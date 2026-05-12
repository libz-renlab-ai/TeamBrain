import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { planInfection } from "@teamagent/core";
import { FsBootstrap } from "@teamagent/adapters/m5/fs-bootstrap";

export interface M5InfectOptions {
  projectRoot: string;
  /** 注入 manifest.json 的 author。默认尝试读 git config user.name。 */
  author?: string;
  /** 注入 manifest.json 的 teamagent_version。默认从 teamagent 包的 package.json 读。 */
  teamagentVersion?: string;
  /** 注入 manifest.json 的 created_at。默认 new Date().toISOString()。 */
  now?: string;
  /**
   * W15-002: 默认 m5-infect 拒绝覆盖一个已经设成非 .githooks 的
   * core.hooksPath（例如 husky 的 .husky / lefthook 的 .lefthook 等），
   * 并把 hookspath_blocked=true 报回。--force 显式同意覆盖。
   */
  force?: boolean;
}

export interface M5InfectResult {
  written_files: string[];
  written_dirs: string[];
  /** existing user hook augmented with TeamAgent marker block (W15-003) */
  chained_files?: string[];
  /** files left untouched because content already on disk */
  skipped_files?: string[];
  skipped: boolean;
  /** B-150: whether `git config core.hooksPath .githooks` was set on the local clone. */
  git_hookspath_set?: boolean;
  /**
   * W15-002: true when a preexisting non-.githooks core.hooksPath value
   * (e.g. .husky) blocked us from setting .githooks. The caller / renderer
   * should surface this loudly so the user can decide to merge or rerun
   * with --force.
   */
  hookspath_blocked?: boolean;
  /** the existing core.hooksPath value that blocked us, if any. */
  hookspath_existing?: string;
}

export async function runM5Infect(
  opts: M5InfectOptions
): Promise<M5InfectResult> {
  const port = new FsBootstrap({
    readTeamagentVersion: async () => readSelfVersion(),
    readInstalledPlugins: async () => [],
    readInstalledProjectSkills: async () => [],
    readInstalledHooks: async () => [],
  });

  const snap = await port.probeProject(opts.projectRoot);
  // 优先项目级 git config（cwd=projectRoot 让 SessionStart hook 跑时也能拿到
  // 项目里设置的 user.name）；fallback 全局 git config；再 fallback "unknown"
  const author =
    opts.author ?? gitUserName(opts.projectRoot) ?? gitUserName() ?? "unknown";
  const teamagent_version =
    opts.teamagentVersion ?? (await readSelfVersion()) ?? "0.0.0";
  const now = opts.now ?? new Date().toISOString();

  const plan = planInfection(snap, { author, now, teamagent_version });

  if (!plan.required) {
    return { written_files: [], written_dirs: [], skipped: true };
  }

  const writeRes = await port.applyInfection(opts.projectRoot, plan);

  // B-150 + W15-002: viral propagation requires the local clone to honor
  // `.githooks/`. But unconditionally writing `core.hooksPath = .githooks`
  // would silently destroy a husky / lefthook / custom-hook framework that
  // the user already configured. Read the current value first; only write
  // when it is empty or already `.githooks`. Refuse otherwise (unless the
  // caller passed --force) and surface the conflict in the result.
  let git_hookspath_set = false;
  let hookspath_blocked = false;
  let hookspath_existing: string | undefined;
  let existingValue: string | null = null;
  try {
    existingValue = execSync("git config --get core.hooksPath", {
      cwd: opts.projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim() || null;
  } catch {
    // exit code 1 from `git config --get` means "not set" — treat as null.
    existingValue = null;
  }

  const safeExisting = existingValue === null || existingValue === ".githooks";
  if (safeExisting || opts.force) {
    try {
      execSync("git config core.hooksPath .githooks", {
        cwd: opts.projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      git_hookspath_set = true;
    } catch {
      // best-effort: not a git repo, or git absent — bootstrap --apply will retry.
    }
  } else {
    hookspath_blocked = true;
    hookspath_existing = existingValue ?? "";
  }

  return {
    written_files: writeRes.written,
    chained_files: writeRes.chained,
    skipped_files: writeRes.skipped,
    written_dirs: plan.dirs_to_create,
    skipped: false,
    git_hookspath_set,
    hookspath_blocked,
    hookspath_existing,
  };
}

async function readSelfVersion(): Promise<string | null> {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // 从 packages/cli/src/commands/ 上溯到 packages/teamagent/package.json
    const candidates = [
      path.resolve(here, "..", "..", "..", "teamagent", "package.json"),
      path.resolve(here, "..", "..", "..", "..", "teamagent", "package.json"),
    ];
    for (const p of candidates) {
      try {
        const raw = await fs.readFile(p, "utf8");
        return (JSON.parse(raw).version as string) ?? null;
      } catch {
        // 试下一个候选
      }
    }
    return null;
  } catch {
    return null;
  }
}

function gitUserName(cwd?: string): string | null {
  try {
    return execSync("git config user.name", {
      encoding: "utf8",
      ...(cwd ? { cwd } : {}),
    }).trim() || null;
  } catch {
    return null;
  }
}

export function parseM5InfectArgs(args: readonly string[]): M5InfectOptions {
  const opts: M5InfectOptions = { projectRoot: process.cwd() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--force") {
      opts.force = true;
      continue;
    }
    const take = (flag: string): string | undefined => {
      if (a === flag) return args[++i];
      if (a.startsWith(flag + "=")) return a.slice(flag.length + 1);
      return undefined;
    };
    const r = take("--project-root");
    if (r !== undefined) {
      opts.projectRoot = r;
      continue;
    }
    const au = take("--author");
    if (au !== undefined) {
      opts.author = au;
      continue;
    }
    const tv = take("--teamagent-version");
    if (tv !== undefined) {
      opts.teamagentVersion = tv;
      continue;
    }
  }
  return opts;
}

/**
 * Issue #284 grill (2026-05-11): `m5-*` is soft-archived. The recommended
 * onboarding command is now `teamagent init .`, which writes gstack-style
 * Claude-required enforcement (`.teamagent/required.json` +
 * `.claude/hooks/check-teamagent.sh`) instead of `.githooks/`.
 * The legacy `m5-infect` command continues to work for backward compat,
 * but every invocation prints this banner so users migrate.
 */
export const M5_INFECT_DEPRECATION_BANNER =
  "[legacy] `teamagent m5-infect` 已归档，请改用：teamagent init .";

export function renderM5InfectResult(r: M5InfectResult): string {
  if (r.skipped) {
    return `${M5_INFECT_DEPRECATION_BANNER}\n[m5-infect] 项目已被传染，无需动作。`;
  }
  const lines = [M5_INFECT_DEPRECATION_BANNER, "[m5-infect] 传染完成。"];
  if (r.written_files.length) {
    lines.push("  已写入文件:");
    for (const f of r.written_files) lines.push(`    - ${f}`);
  }
  if (r.chained_files && r.chained_files.length) {
    lines.push("  已 chain-load 进现有 hook (W15-003):");
    for (const f of r.chained_files) lines.push(`    - ${f}`);
  }
  if (r.skipped_files && r.skipped_files.length) {
    lines.push("  已存在内容、保留原文件 (idempotent):");
    for (const f of r.skipped_files) lines.push(`    - ${f}`);
  }
  if (r.written_dirs.length) {
    lines.push("  已建目录:");
    for (const d of r.written_dirs) lines.push(`    - ${d}`);
  }
  if (r.hookspath_blocked) {
    lines.push("");
    lines.push(
      `⚠️  W15-002: core.hooksPath 已设为 "${r.hookspath_existing}"（疑似 husky / lefthook / 自定义 hook 框架），未覆盖。`,
    );
    lines.push(
      "    → TeamAgent 的 .githooks/post-merge 不会自动触发；请手动把 hooks 目录链到 .githooks，",
    );
    lines.push("      或重跑 `teamagent m5-infect --force` 显式覆盖。");
  }
  return lines.join("\n");
}
