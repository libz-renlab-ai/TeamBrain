import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mergeLwwBatch,
  teamRuleToKnowledgeEntry,
  type MergeResult,
} from "@teamagent/core";
import { FsTeamRuleStore } from "@teamagent/adapters/m5/fs-team-rule-store";
import { DualLayerStore } from "@teamagent/adapters";

export interface M5SyncOptions {
  projectRoot: string;
  /** --apply 模式：把 LWW 结果写入本地 KnowledgeStore */
  apply?: boolean;
  /** 自定义 KB store；测试可注入 */
  kbStore?: { add: (e: any) => void; update: (id: string, patch: any) => void; delete: (id: string) => boolean; getById: (id: string) => any };
}

export interface M5SyncResult {
  total_claims: number;
  /** 经 LWW 合并后的状态：rule_id → effective state */
  merged: Array<{
    rule_id: string;
    state: "alive" | "tombstone";
    winner_claim_author: string;
    original_author: string;
    /** alive 时 content 摘要（前 60 字符） */
    summary?: string;
  }>;
  /** B-129: corrupt or out-of-spec team-rule files surfaced (not silently dropped) */
  skipped_files?: Array<{ path: string; reason: string }>;
  /** --apply 模式下实际写入的 KB 动作 */
  applied?: {
    upserted: string[];
    deleted: string[];
    skipped: Array<{ rule_id: string; reason: string }>;
  };
}

/**
 * Bucket a list of skipped-file diagnostics by short reason category so we
 * can render a one-line-per-category summary alongside the per-file list
 * (W15-014). Categories are heuristic (substring match on the underlying
 * reason string).
 */
export function summarizeSkipReasons(
  skipped: ReadonlyArray<{ path: string; reason: string }>,
): Array<[string, number]> {
  const buckets = new Map<string, number>();
  for (const s of skipped) {
    const cat = categorizeSkipReason(s.reason);
    buckets.set(cat, (buckets.get(cat) ?? 0) + 1);
  }
  return [...buckets.entries()].sort((a, b) => b[1] - a[1]);
}

function categorizeSkipReason(reason: string): string {
  const r = reason.toLowerCase();
  if (
    r.includes("json") &&
    (r.includes("parse") ||
      r.includes("unexpected") ||
      r.includes("invalid"))
  ) {
    return "JSON parse error";
  }
  if (r.includes("future")) return "future timestamp";
  if (
    r.includes("schema") ||
    r.includes("validation") ||
    r.includes("required field") ||
    r.includes("must be")
  ) {
    return "schema violation";
  }
  if (r.includes("eperm") || r.includes("eacces")) return "permission denied";
  if (r.includes("enoent")) return "file vanished";
  return "other";
}

/**
 * Strip ANSI/control bytes from a string before printing it as part of a sync
 * summary (B-130). Only applied to user-controllable fields like rule_id and
 * content summary.
 */
function sanitizeForTerminal(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "?").replace(/\[[0-9;?]*[ -/]*[@-~]/g, "");
}

export async function runM5Sync(opts: M5SyncOptions): Promise<M5SyncResult> {
  const fsStore = new FsTeamRuleStore();
  const skipped: Array<{ path: string; reason: string }> = [];
  const claims = await fsStore.listAll(opts.projectRoot, {
    onSkip: (entry) => skipped.push(entry),
  });
  const merged = mergeLwwBatch(claims);

  const out: M5SyncResult["merged"] = [];
  for (const [ruleId, mr] of merged) {
    out.push(formatMerged(ruleId, mr));
  }
  out.sort((a, b) => a.rule_id.localeCompare(b.rule_id));

  const result: M5SyncResult = { total_claims: claims.length, merged: out };
  if (skipped.length > 0) {
    result.skipped_files = skipped;
  }

  if (opts.apply) {
    const teamId = computeTeamId(opts.projectRoot);
    const kb = opts.kbStore ?? openProjectKb(opts.projectRoot);
    const applied: NonNullable<M5SyncResult["applied"]> = {
      upserted: [],
      deleted: [],
      skipped: [],
    };
    for (const [ruleId, mr] of merged) {
      if (!mr.winner) continue;
      try {
        if (mr.winner.deleted) {
          const wasThere = kb.delete(ruleId);
          if (wasThere) applied.deleted.push(ruleId);
        } else {
          const entry = teamRuleToKnowledgeEntry(
            ruleId,
            mr.winner,
            mr.original_author ?? "unknown",
            teamId
          );
          if (kb.getById(ruleId)) {
            kb.update(ruleId, entry);
          } else {
            kb.add(entry);
          }
          applied.upserted.push(ruleId);
        }
      } catch (e) {
        applied.skipped.push({
          rule_id: ruleId,
          reason: (e as Error).message,
        });
      }
    }
    result.applied = applied;
  }

  return result;
}

function computeTeamId(projectRoot: string): string | undefined {
  try {
    const url = execSync("git remote get-url origin", {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],  // suppress stderr "No such remote"
    }).trim();
    if (!url) return undefined;
    // normalize：去 .git、去 user/token、统一 host
    const normalized = url
      .replace(/\.git$/, "")
      .replace(/^https?:\/\/[^@\/]+@/, "https://")
      .toLowerCase();
    return createHash("sha256")
      .update(normalized)
      .digest("hex")
      .slice(0, 16);
  } catch {
    return undefined;
  }
}

function openProjectKb(projectRoot: string): DualLayerStore {
  const projectDbPath = path.join(projectRoot, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path.join(os.homedir(), ".teamagent", "global.db");
  fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
  return new DualLayerStore({ projectDbPath, userGlobalDbPath });
}

function formatMerged(
  ruleId: string,
  mr: MergeResult
): M5SyncResult["merged"][number] {
  const w = mr.winner;
  if (!w) {
    return {
      rule_id: ruleId,
      state: "tombstone",
      winner_claim_author: mr.winner_claim_author ?? "",
      original_author: mr.original_author ?? "",
    };
  }
  if (w.deleted) {
    return {
      rule_id: ruleId,
      state: "tombstone",
      winner_claim_author: mr.winner_claim_author ?? "",
      original_author: mr.original_author ?? "",
    };
  }
  return {
    rule_id: ruleId,
    state: "alive",
    winner_claim_author: mr.winner_claim_author ?? "",
    original_author: mr.original_author ?? "",
    // B-130: strip ANSI escapes / control chars so a malicious rule cannot
    // clear the user's terminal or inject cursor sequences when printed.
    summary: sanitizeForTerminal(w.content.slice(0, 60)),
  };
}

export function parseM5SyncArgs(args: readonly string[]): M5SyncOptions {
  const opts: M5SyncOptions = { projectRoot: process.cwd() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--project-root") {
      opts.projectRoot = args[++i] ?? process.cwd();
    } else if (a.startsWith("--project-root=")) {
      opts.projectRoot = a.slice("--project-root=".length);
    } else if (a === "--apply") {
      opts.apply = true;
    }
  }
  return opts;
}

export function renderM5SyncResult(r: M5SyncResult): string {
  const lines: string[] = [];
  lines.push(
    `[m5-sync] 读到 ${r.total_claims} 个 claim，合并为 ${r.merged.length} 条规则。`
  );
  for (const m of r.merged) {
    if (m.state === "alive") {
      lines.push(
        `  ✓ ${m.rule_id} (claim=${m.winner_claim_author}, original=${m.original_author}): ${m.summary}`
      );
    } else {
      lines.push(
        `  ✗ ${m.rule_id} (tombstone by ${m.winner_claim_author}, original=${m.original_author})`
      );
    }
  }
  // B-129 / W15-014: surface every skipped corrupt / out-of-spec file so
  // users know data was dropped. Add a reason-category breakdown when the
  // list is long so the user can spot patterns at a glance.
  if (r.skipped_files && r.skipped_files.length > 0) {
    lines.push(
      `[m5-sync] ⚠ skipped ${r.skipped_files.length} file(s) (corrupt JSON / schema violation / future timestamp):`,
    );
    if (r.skipped_files.length >= 5) {
      const breakdown = summarizeSkipReasons(r.skipped_files);
      for (const [cat, count] of breakdown) {
        lines.push(`    · ${cat}: ${count}`);
      }
      lines.push("");
    }
    for (const s of r.skipped_files) {
      lines.push(`  - ${s.path}: ${s.reason}`);
    }
  }
  if (r.applied) {
    lines.push(
      `[apply] upserted=${r.applied.upserted.length} deleted=${r.applied.deleted.length} skipped=${r.applied.skipped.length}`
    );
    for (const s of r.applied.skipped) {
      lines.push(`  ! skip ${s.rule_id}: ${s.reason}`);
    }
  }
  return lines.join("\n");
}
