import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  diffPackRequest,
  entryHasPackTag,
  packTag,
  parsePackMeta,
  type PackMeta,
} from "@teamagent/core";
import { SqliteKnowledgeStore, openDb } from "@teamagent/adapters";
import type { KnowledgeEntry } from "@teamagent/types";

export type PackSubcommand = "list" | "add" | "remove";

export interface PackCommonOptions {
  /** Override registry directory (env: TEAMAGENT_PACKS_DIR; tests inject directly). */
  packsDir?: string;
  /** Override resolved user-global DB path. */
  userGlobalDbPath?: string;
  /** Override $HOME (tests). */
  homeDir?: string;
}

export interface PackArgs extends PackCommonOptions {
  sub: PackSubcommand;
  names: string[];
  json: boolean;
}

export interface PackListResult {
  installed: PackMeta[];
  available: PackMeta[];
  packsDir: string | null;
}

export interface PackAddResult {
  added: Array<{ name: string; rules: number }>;
  alreadyInstalled: string[];
  notFound: string[];
  failed: Array<{ name: string; error: string }>;
}

export interface PackRemoveResult {
  removed: Array<{ name: string; rules: number }>;
  notInstalled: string[];
}

/**
 * Resolve packs directory. Priority:
 *  1. Explicit `opts.packsDir`.
 *  2. `TEAMAGENT_PACKS_DIR` env var.
 *  3. Walk up from this module looking for
 *     `dist/seed/packs/` (bundled) or `packages/teamagent/seed/packs/` (dev).
 *  4. Falls back to undefined (no registry available).
 */
export function resolvePacksDir(explicit?: string): string | undefined {
  if (explicit) return explicit;
  const envPath = process.env["TEAMAGENT_PACKS_DIR"];
  if (envPath) return envPath;
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 8; i++) {
    const bundled = path.join(dir, "dist", "seed", "packs");
    if (fs.existsSync(bundled)) return bundled;
    const dev = path.join(dir, "packages", "teamagent", "seed", "packs");
    if (fs.existsSync(dev)) return dev;
    const sibling = path.join(dir, "..", "teamagent", "seed", "packs");
    if (fs.existsSync(sibling)) return sibling;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function resolveUserGlobalDb(opts: PackCommonOptions): string {
  if (opts.userGlobalDbPath) return opts.userGlobalDbPath;
  const home = opts.homeDir ?? os.homedir();
  return path.join(home, ".teamagent", "global.db");
}

/**
 * Read pack metadata files from `packsDir`. Skips entries with malformed
 * meta JSON (logs name -> error to stderr) so a single broken pack does not
 * break `pack list` for the rest.
 */
export function readPackRegistry(packsDir: string): PackMeta[] {
  if (!fs.existsSync(packsDir) || !fs.statSync(packsDir).isDirectory()) {
    return [];
  }
  const entries = fs.readdirSync(packsDir);
  const metas: PackMeta[] = [];
  for (const f of entries) {
    if (!f.endsWith(".meta.json")) continue;
    const full = path.join(packsDir, f);
    try {
      const text = fs.readFileSync(full, "utf-8");
      metas.push(parsePackMeta(text));
    } catch (err) {
      process.stderr.write(
        `[pack] skip malformed meta ${f}: ${String(err).slice(0, 200)}\n`,
      );
    }
  }
  metas.sort((a, b) => a.name.localeCompare(b.name));
  return metas;
}

/**
 * Read rules from `<packsDir>/<name>.jsonl`. Throws when the file is missing
 * — Codex review on PR #110 (P2): silently treating a missing rule file as
 * an empty rule set lets `pack add` report success while installing nothing,
 * masking packaging / registry mismatches. Callers translate the throw into
 * a `failed` entry so the caller can see exactly which pack was broken.
 */
function readPackRules(packsDir: string, name: string): KnowledgeEntry[] {
  const file = path.join(packsDir, `${name}.jsonl`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `pack rule file missing: ${file} (registry meta is present but the jsonl is not — packaging / registry mismatch)`,
    );
  }
  const text = fs.readFileSync(file, "utf-8");
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as KnowledgeEntry);
}

/**
 * Discover installed pack names from store tags directly — Codex review on
 * PR #110 (P2): iterating only over `available` metadata makes any
 * already-installed pack invisible if its meta file was renamed or removed
 * after the install. Scanning store tags catches those orphan installs so
 * `pack list` reports them honestly (with synthesized metadata).
 */
function findInstalledPackNamesFromStore(
  store: SqliteKnowledgeStore,
): string[] {
  const all = store.getAll();
  const names = new Set<string>();
  for (const e of all) {
    for (const t of e.tags ?? []) {
      if (t.startsWith("pack:")) names.add(t.slice("pack:".length));
    }
  }
  return [...names].sort();
}

function orphanMetaStub(name: string): PackMeta {
  return {
    name,
    description:
      "(metadata unavailable — pack rules are installed but the registry has no matching meta.json)",
    tags: [],
    file_hints: [],
    prompt_version: 1,
  };
}

export function executePackList(opts: PackCommonOptions = {}): PackListResult {
  const packsDir = resolvePacksDir(opts.packsDir);
  const dbPath = resolveUserGlobalDb(opts);
  const available = packsDir ? readPackRegistry(packsDir) : [];
  let installed: PackMeta[] = [];
  if (fs.existsSync(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const store = new SqliteKnowledgeStore(openDb(dbPath));
    try {
      const names = findInstalledPackNamesFromStore(store);
      installed = names.map((name) => {
        const meta = available.find((m) => m.name === name);
        return meta ?? orphanMetaStub(name);
      });
    } finally {
      store.close();
    }
  }
  return { installed, available, packsDir: packsDir ?? null };
}

export function executePackAdd(
  names: string[],
  opts: PackCommonOptions = {},
): PackAddResult {
  const packsDir = resolvePacksDir(opts.packsDir);
  const dbPath = resolveUserGlobalDb(opts);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const available = packsDir ? readPackRegistry(packsDir) : [];
  const store = new SqliteKnowledgeStore(openDb(dbPath));
  const added: PackAddResult["added"] = [];
  const failed: PackAddResult["failed"] = [];
  try {
    const installedNames = findInstalledPackNamesFromStore(store);
    const diff = diffPackRequest({
      requested: names,
      available: available.map((m) => m.name),
      installed: installedNames,
    });
    for (const name of diff.toAdd) {
      try {
        if (!packsDir) {
          throw new Error(
            "no packs registry resolved (set TEAMAGENT_PACKS_DIR or ensure seed/packs/ exists)",
          );
        }
        const rules = readPackRules(packsDir, name);
        let inserted = 0;
        for (const r of rules) {
          if (store.getById(r.id)) continue;
          // Ensure pack tag is present even if jsonl forgot it.
          const tag = packTag(name);
          const tags = r.tags?.includes(tag) ? r.tags : [...(r.tags ?? []), tag];
          try {
            store.add({ ...r, tags });
            inserted++;
          } catch (err) {
            failed.push({ name, error: String(err).slice(0, 200) });
          }
        }
        added.push({ name, rules: inserted });
      } catch (err) {
        failed.push({ name, error: String(err).slice(0, 200) });
      }
    }
    return {
      added,
      alreadyInstalled: diff.alreadyInstalled,
      notFound: diff.notFound,
      failed,
    };
  } finally {
    store.close();
  }
}

export function executePackRemove(
  names: string[],
  opts: PackCommonOptions = {},
): PackRemoveResult {
  const dbPath = resolveUserGlobalDb(opts);
  if (!fs.existsSync(dbPath)) {
    return { removed: [], notInstalled: [...new Set(names)] };
  }
  const store = new SqliteKnowledgeStore(openDb(dbPath));
  const removed: PackRemoveResult["removed"] = [];
  const notInstalled: string[] = [];
  try {
    const all = store.getAll();
    const seen = new Set<string>();
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      const matching = all.filter((e) => entryHasPackTag(e, name));
      if (matching.length === 0) {
        notInstalled.push(name);
        continue;
      }
      for (const m of matching) {
        store.delete(m.id);
      }
      removed.push({ name, rules: matching.length });
    }
    return { removed, notInstalled };
  } finally {
    store.close();
  }
}

// Argument parsing

export function parsePackArgs(argv: string[]): PackArgs {
  if (argv.length === 0) {
    throw new Error(
      'Usage: teamagent pack <list|add|remove> [names] [--json]\n' +
        '  pack list [--json]\n' +
        '  pack add <names>      e.g. pack add frontend-js,ops-safety\n' +
        '  pack remove <names>',
    );
  }
  const sub = argv[0] as PackSubcommand;
  if (sub !== "list" && sub !== "add" && sub !== "remove") {
    throw new Error(`未知子命令: ${sub}. 可用: list / add / remove`);
  }
  let json = false;
  const names: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") {
      json = true;
      continue;
    }
    // Accept comma-separated, space-separated, or repeated positional args.
    for (const part of a.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > 0) names.push(trimmed);
    }
  }
  if ((sub === "add" || sub === "remove") && names.length === 0) {
    throw new Error(`pack ${sub} 需要至少一个 pack 名（逗号或空格分隔）`);
  }
  return { sub, names, json };
}

// Render

export function renderPackList(result: PackListResult, json: boolean): string {
  if (json) {
    return (
      JSON.stringify(
        {
          installed: result.installed,
          available: result.available,
          packs_dir: result.packsDir,
        },
        null,
        2,
      ) + "\n"
    );
  }
  const lines: string[] = [];
  if (result.installed.length === 0) {
    lines.push("Installed packs: (none)");
  } else {
    lines.push(`Installed packs (${result.installed.length}):`);
    for (const p of result.installed) {
      lines.push(`  - ${p.name} [${p.tags.join(", ")}] — ${p.description}`);
    }
  }
  lines.push("");
  if (result.available.length === 0) {
    lines.push("Available packs: (no packs shipped in this teamagent build)");
  } else {
    lines.push(`Available packs (${result.available.length}):`);
    for (const p of result.available) {
      lines.push(`  - ${p.name} [${p.tags.join(", ")}] — ${p.description}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function renderPackAdd(result: PackAddResult): string {
  const lines: string[] = [];
  if (result.added.length > 0) {
    const totalRules = result.added.reduce((s, a) => s + a.rules, 0);
    lines.push(
      `✅ Installed ${result.added.length} pack${result.added.length === 1 ? "" : "s"} (${totalRules} rule${totalRules === 1 ? "" : "s"} added)`,
    );
    for (const a of result.added) {
      lines.push(`   • ${a.name}: ${a.rules} rule${a.rules === 1 ? "" : "s"}`);
    }
  }
  if (result.alreadyInstalled.length > 0) {
    lines.push(
      `↺ Already installed: ${result.alreadyInstalled.join(", ")}`,
    );
  }
  if (result.notFound.length > 0) {
    lines.push(`❌ Unknown pack: ${result.notFound.join(", ")}`);
    lines.push("   Run `teamagent pack list` to see available packs.");
  }
  if (result.failed.length > 0) {
    lines.push(`⚠  Failed: ${result.failed.map((f) => `${f.name} (${f.error})`).join(", ")}`);
  }
  if (lines.length === 0) lines.push("(nothing to do)");
  return lines.join("\n") + "\n";
}

export function renderPackRemove(result: PackRemoveResult): string {
  const lines: string[] = [];
  if (result.removed.length > 0) {
    for (const r of result.removed) {
      lines.push(`✅ Removed pack "${r.name}" (${r.rules} rule${r.rules === 1 ? "" : "s"} deleted)`);
    }
  }
  if (result.notInstalled.length > 0) {
    lines.push(`↺ Not installed: ${result.notInstalled.join(", ")}`);
  }
  if (lines.length === 0) lines.push("(nothing to do)");
  return lines.join("\n") + "\n";
}

/** Convenience for bin entry / init.ts integration. */
export function packAddExitCode(result: PackAddResult): number {
  if (result.notFound.length > 0) return 1;
  if (result.failed.length > 0) return 1;
  return 0;
}
