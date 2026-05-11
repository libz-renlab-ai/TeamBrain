import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { LocalState, InfectionPlan } from "@teamagent/types";

/**
 * BootstrapPort：M5-A 引导/传染所需的 IO 抽象。
 *
 * 实现约束：
 * - 所有写入必须幂等（同样输入跑两次结果一致）
 * - 非 hook 文件 (e.g. .teamagent/manifest.json) 不得覆盖已存在内容
 * - hook 文件 (.githooks/post-merge / pre-commit) 必须 chain-load 而非
 *   静默跳过 (W15-003): 如果用户已有 hook，把 TeamAgent block 用
 *   marker 包裹追加到末尾；下次 apply 时按 marker 替换 block
 * - readManifest 不存在时返回 null（不抛错）
 */
export interface BootstrapPort {
  /** 读项目的 manifest；不存在返回 null。 */
  readManifest(projectRoot: string): Promise<string | null>;

  /** 探测项目当前状态。 */
  probeProject(projectRoot: string): Promise<ProjectProbe>;

  /**
   * 把 InfectionPlan 写入项目，返回写入结果分类。
   * - dirs_to_create 中已存在的目录跳过
   * - files_to_create 中非 hook 文件已存在则保留原内容（idempotency）
   * - hook 文件 (.githooks/post-merge / .githooks/pre-commit) 用 marker
   *   block 写入；已存在用户 hook 时把 TeamAgent block 追加到末尾
   * - 创建的 hook 文件应该 chmod +x（Windows 上可能 no-op）
   */
  applyInfection(
    projectRoot: string,
    plan: InfectionPlan,
  ): Promise<ApplyInfectionResult>;

  /** 探测本机 TeamAgent 状态。 */
  getLocalState(): Promise<LocalState>;
}

export interface ApplyInfectionResult {
  /** files newly created on disk */
  written: string[];
  /** existing user hook augmented with TeamAgent marker block */
  chained: string[];
  /** non-hook file already present, kept as-is to preserve idempotency */
  skipped: string[];
}

/** Marker delimiters used to chain-load TeamAgent logic into a user hook. */
export const TEAMAGENT_HOOK_BLOCK_START =
  "# >>> teamagent post-merge block >>>";
export const TEAMAGENT_HOOK_BLOCK_END =
  "# <<< teamagent post-merge block <<<";

function isChainLoadableHook(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/");
  return (
    norm.endsWith("/post-merge") ||
    norm.endsWith("/pre-commit") ||
    norm.endsWith("/pre-push") ||
    norm.endsWith("/post-checkout")
  );
}

function extractShebang(content: string): string {
  if (content.startsWith("#!")) {
    const nl = content.indexOf("\n");
    return content.slice(0, nl >= 0 ? nl : content.length);
  }
  return "#!/usr/bin/env bash";
}

function stripShebang(content: string): string {
  if (content.startsWith("#!")) {
    const nl = content.indexOf("\n");
    return nl >= 0 ? content.slice(nl + 1) : "";
  }
  return content;
}

/** Wrap a hook payload with TeamAgent markers; used when no user hook yet. */
export function wrapHookWithTeamagentBlock(content: string): string {
  const shebang = extractShebang(content);
  const body = stripShebang(content).replace(/\n+$/, "");
  return (
    `${shebang}\n` +
    `${TEAMAGENT_HOOK_BLOCK_START}\n` +
    `${body}\n` +
    `${TEAMAGENT_HOOK_BLOCK_END}\n`
  );
}

/**
 * Insert/refresh the TeamAgent block in an existing user hook.
 * Idempotent: running twice with the same `content` is a no-op.
 *
 * PR #282 review follow-up: throws when only one of START/END marker is
 * present (or END appears before START) — otherwise a corrupted hook
 * silently grows a second START marker on next apply, and the run after
 * that truncates user code between the orphan START and the new END.
 */
export function augmentHookWithTeamagentBlock(
  existing: string,
  content: string,
): string {
  const body = stripShebang(content).replace(/\n+$/, "");
  const startIdx = existing.indexOf(TEAMAGENT_HOOK_BLOCK_START);
  const endIdx = existing.indexOf(TEAMAGENT_HOOK_BLOCK_END);
  const hasStart = startIdx >= 0;
  const hasEnd = endIdx >= 0;
  if (hasStart !== hasEnd || (hasStart && hasEnd && endIdx <= startIdx)) {
    throw new Error(
      "teamagent hook block markers are corrupted in existing hook " +
        "(only one of START/END found, or END appears before START). " +
        "Refusing to overwrite to avoid silent data loss. " +
        "Please restore both markers manually, or remove the existing block.",
    );
  }
  if (hasStart && hasEnd) {
    const before = existing.slice(0, startIdx).replace(/\n+$/, "");
    const after = existing
      .slice(endIdx + TEAMAGENT_HOOK_BLOCK_END.length)
      .replace(/^\n+/, "");
    const head = before.length > 0 ? `${before}\n` : "";
    const tail = after.length > 0 ? `\n${after}` : "";
    return (
      `${head}` +
      `${TEAMAGENT_HOOK_BLOCK_START}\n` +
      `${body}\n` +
      `${TEAMAGENT_HOOK_BLOCK_END}\n` +
      `${tail}`
    );
  }
  // No marker yet — append after user content (preserve user's hook commands).
  const trail = existing.endsWith("\n") ? "" : "\n";
  return (
    `${existing}${trail}` +
    `${TEAMAGENT_HOOK_BLOCK_START}\n` +
    `${body}\n` +
    `${TEAMAGENT_HOOK_BLOCK_END}\n`
  );
}

export interface ProjectProbe {
  has_manifest: boolean;
  has_team_dir: boolean;
  has_shared_skills_dir: boolean;
  has_shared_claude_md: boolean;
  has_githooks_dir: boolean;
  has_pre_commit_hook: boolean;
  has_post_merge_hook: boolean;
}

export interface FsBootstrapDeps {
  /** 探测本机 TeamAgent 版本（如读包 package.json）。注入便于测试。 */
  readTeamagentVersion: () => Promise<string | null>;
  /** 已装插件名列表来源。 */
  readInstalledPlugins: () => Promise<string[]>;
  /** 已装项目级 skill 路径列表来源。 */
  readInstalledProjectSkills: () => Promise<string[]>;
  /** 已装 hook 列表来源。 */
  readInstalledHooks: () => Promise<LocalState["installed_hooks"]>;
}

export class FsBootstrap implements BootstrapPort {
  constructor(private deps: FsBootstrapDeps) {}

  async readManifest(projectRoot: string): Promise<string | null> {
    const p = path.join(projectRoot, ".teamagent", "manifest.json");
    try {
      return await fs.readFile(p, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async probeProject(projectRoot: string): Promise<ProjectProbe> {
    const exists = async (rel: string) => {
      try {
        await fs.access(path.join(projectRoot, rel));
        return true;
      } catch {
        return false;
      }
    };
    return {
      has_manifest: await exists(".teamagent/manifest.json"),
      has_team_dir: await exists(".teamagent/team"),
      has_shared_skills_dir: await exists(".teamagent/shared-skills"),
      has_shared_claude_md: await exists(".teamagent/shared-claude.md"),
      has_githooks_dir: await exists(".githooks"),
      has_pre_commit_hook: await exists(".githooks/pre-commit"),
      has_post_merge_hook: await exists(".githooks/post-merge"),
    };
  }

  async applyInfection(
    projectRoot: string,
    plan: InfectionPlan
  ): Promise<ApplyInfectionResult> {
    const result: ApplyInfectionResult = {
      written: [],
      chained: [],
      skipped: [],
    };
    for (const dir of plan.dirs_to_create) {
      await fs.mkdir(path.join(projectRoot, dir), { recursive: true });
    }
    for (const [rel, content] of Object.entries(plan.files_to_create)) {
      const p = path.join(projectRoot, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });

      let existing: string | null = null;
      try {
        existing = await fs.readFile(p, "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }

      const chainable = isChainLoadableHook(rel);

      if (existing === null) {
        // Fresh write. Hook files get wrapped with TeamAgent markers so
        // future re-applies can replace the block in-place (W15-003).
        const payload = chainable
          ? wrapHookWithTeamagentBlock(content)
          : content;
        await fs.writeFile(p, payload, "utf8");
        result.written.push(rel);
      } else if (chainable) {
        // User already has a hook — chain-load by adding/refreshing the
        // marker block instead of silently skipping (W15-003 root cause).
        // PR #282 review follow-up: if the marker pair is corrupted in
        // the existing hook, the helper throws. Catch per-file, leave the
        // hook untouched (no data loss), and bucket it as skipped so the
        // renderer surfaces the file to the user.
        try {
          const augmented = augmentHookWithTeamagentBlock(existing, content);
          if (augmented === existing) {
            result.skipped.push(rel);
          } else {
            await fs.writeFile(p, augmented, "utf8");
            result.chained.push(rel);
          }
        } catch (e) {
          if (
            e instanceof Error &&
            e.message.includes("teamagent hook block markers are corrupted")
          ) {
            result.skipped.push(rel);
          } else {
            throw e;
          }
        }
      } else {
        // Non-hook file (e.g. .teamagent/manifest.json) — keep idempotency
        // contract: existing content wins.
        result.skipped.push(rel);
        continue;
      }

      if (
        rel.endsWith("pre-commit") ||
        rel.endsWith("post-merge") ||
        rel.endsWith("pre-push") ||
        rel.endsWith("post-checkout") ||
        rel.endsWith(".sh")
      ) {
        try {
          await fs.chmod(p, 0o755);
        } catch {
          // Windows 上 chmod 可能 no-op，忽略
        }
      }
    }
    return result;
  }

  async getLocalState(): Promise<LocalState> {
    return {
      teamagent_version: await this.deps.readTeamagentVersion(),
      installed_plugins: await this.deps.readInstalledPlugins(),
      installed_project_skills: await this.deps.readInstalledProjectSkills(),
      installed_hooks: await this.deps.readInstalledHooks(),
    };
  }
}
