import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { TeamRuleFile } from "@teamagent/types";
import { parseTeamRule, serializeTeamRule } from "@teamagent/core";

/**
 * Diagnostic returned alongside listAll so m5-sync can warn the user about
 * corrupt / non-conforming team-rule files instead of silently skipping them
 * (B-129).
 */
export interface ListAllOptions {
  /** Receives one entry per skipped file with the underlying reason. */
  onSkip?: (entry: { path: string; reason: string }) => void;
  /** Drop claims whose effective ts is more than this many ms in the future. */
  futureSkewToleranceMs?: number;
}

/**
 * TeamRuleStorePort：对 .teamagent/team/<author>/<rule_id>.json 的读写抽象。
 *
 * 实现约束：
 * - listAll 必须包含所有 author 子目录的所有 rule
 * - writeRule 用 atomic write（temp + rename）确保不留半文件
 * - 同一 (claim_author, rule_id) 的 writeRule 会覆盖（因为是同一作者更新自己的 claim）
 *   ——这是 LWW 的本地体现：同一作者只保留最新版本
 */
export interface TeamRuleStorePort {
  /** 列出 .teamagent/team/ 下所有 (claim_author, file)。 */
  listAll(projectRoot: string, opts?: ListAllOptions): Promise<TeamRuleClaim[]>;

  /** 读单条；不存在返回 null。 */
  readRule(
    projectRoot: string,
    claimAuthor: string,
    ruleId: string
  ): Promise<TeamRuleFile | null>;

  /** 写单条（覆盖同 claim_author 的旧版本）。 */
  writeRule(
    projectRoot: string,
    claimAuthor: string,
    rule: TeamRuleFile
  ): Promise<void>;
}

export interface TeamRuleClaim {
  /** 文件所在的 author 子目录（= claim 写入者） */
  claim_author: string;
  file: TeamRuleFile;
}

/**
 * 文件系统 TeamRuleStorePort 实现：
 *   .teamagent/team/<claim_author>/<rule_id>.json
 *
 * writeRule 用 atomic write（写 .tmp 再 rename）确保不留半文件。
 */
export class FsTeamRuleStore implements TeamRuleStorePort {
  async listAll(
    projectRoot: string,
    opts: ListAllOptions = {},
  ): Promise<TeamRuleClaim[]> {
    const teamDir = path.join(projectRoot, ".teamagent", "team");
    const out: TeamRuleClaim[] = [];

    let authors: string[];
    try {
      authors = await fs.readdir(teamDir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return out;
      throw e;
    }

    const realNowMs = Date.now();
    const skewMs = opts.futureSkewToleranceMs ?? 60_000;

    for (const claimAuthor of authors) {
      const authorDir = path.join(teamDir, claimAuthor);
      let stat;
      try {
        stat = await fs.stat(authorDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      let entries: string[];
      try {
        entries = await fs.readdir(authorDir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const filePath = path.join(authorDir, entry);
        try {
          const raw = await fs.readFile(filePath, "utf8");
          const file = parseTeamRule(raw);
          // B-140: reject claims whose effective ts is too far in the future
          const cur = file.current as { deleted?: boolean; modified_ts?: string; deleted_ts?: string };
          const effTs = cur.deleted ? cur.deleted_ts : cur.modified_ts;
          if (typeof effTs === "string") {
            const tsMs = Date.parse(effTs);
            if (Number.isFinite(tsMs) && tsMs > realNowMs + skewMs) {
              opts.onSkip?.({
                path: filePath,
                reason: `effective timestamp "${effTs}" is more than ${Math.round(skewMs / 1000)}s in the future`,
              });
              continue;
            }
          }
          out.push({ claim_author: claimAuthor, file });
        } catch (e) {
          // B-129: surface skip reason instead of silently dropping
          opts.onSkip?.({
            path: filePath,
            reason: (e as Error).message ?? String(e),
          });
        }
      }
    }
    return out;
  }

  async readRule(
    projectRoot: string,
    claimAuthor: string,
    ruleId: string
  ): Promise<TeamRuleFile | null> {
    const p = path.join(
      projectRoot,
      ".teamagent",
      "team",
      sanitize(claimAuthor),
      `${sanitize(ruleId)}.json`
    );
    try {
      const raw = await fs.readFile(p, "utf8");
      return parseTeamRule(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async writeRule(
    projectRoot: string,
    claimAuthor: string,
    rule: TeamRuleFile
  ): Promise<void> {
    const dir = path.join(
      projectRoot,
      ".teamagent",
      "team",
      sanitize(claimAuthor)
    );
    await fs.mkdir(dir, { recursive: true });
    const finalPath = path.join(dir, `${sanitize(rule.rule_id)}.json`);
    const tmpPath = `${finalPath}.tmp.${process.pid}.${Date.now()}`;
    const content = serializeTeamRule(rule);
    await fs.writeFile(tmpPath, content, "utf8");
    await fs.rename(tmpPath, finalPath);
  }
}

/** 把 id / author 中可能不安全的文件系统字符替换成 _。 */
function sanitize(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "_");
}

/** 公开的 author 名 sanitization——CLI 调用层也可用，写 dir 前 normalize。 */
export function sanitizeAuthor(name: string): string {
  return sanitize(name);
}
