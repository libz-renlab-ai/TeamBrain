import type { InfectionPlan, Manifest } from "@teamagent/types";
import { serializeManifest } from "./manifest.js";

export interface ProjectSnapshot {
  has_manifest: boolean;
  has_team_dir: boolean;
  has_shared_skills_dir: boolean;
  has_shared_claude_md: boolean;
  has_githooks_dir: boolean;
  has_pre_commit_hook: boolean;
  has_post_merge_hook: boolean;
}

export interface InfectInput {
  author: string;
  now: string;
  teamagent_version: string;
}

const PRE_COMMIT_HOOK = `#!/usr/bin/env bash
# TeamAgent M5 pre-commit anchor (multi-point enforcement, M5-D 降级模式)
# 设计：警告而不阻塞——TeamAgent 缺失/失败不能让全队工作瘫
# Escape: 设 TEAMAGENT_BOOTSTRAP_SKIP=1 跳过

if [ "\${TEAMAGENT_BOOTSTRAP_SKIP:-}" = "1" ]; then
  exit 0
fi

if ! command -v teamagent >/dev/null 2>&1; then
  echo "[teamagent] 警告：本机未安装 TeamAgent CLI" >&2
  echo "[teamagent] 提示：npm install -g github:libz-renlab-ai/TeamBrain#release" >&2
  exit 0  # 不阻塞 commit
fi

# 兼容旧版本 teamagent：先检测是否支持 m5-bootstrap，避免输出"未知命令"
if teamagent --help 2>&1 | grep -q "m5-bootstrap"; then
  # 显式取 git repo root 传给 --project-root，避免 wrapper / pnpm / nvm 等改变 pwd
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  teamagent m5-bootstrap --project-root "$REPO_ROOT" --check 2>&1 || true
else
  echo "[teamagent] 提示：本机 teamagent 版本不支持 m5-bootstrap (M5+)" >&2
  echo "[teamagent] 升级：npm install -g github:libz-renlab-ai/TeamBrain#release" >&2
fi
exit 0
`;

const SHARED_CLAUDE_MD = `# Shared CLAUDE.md (M5)

This file is auto-merged into the project's CLAUDE.md when team members run
\`teamagent compile\`. Edit shared rules / conventions here; they sync across
the team via git.
`;

const POST_MERGE_HOOK = `#!/usr/bin/env bash
# TeamAgent M5 post-merge：拉取后自动同步团队规则进本地 KB
# 设计：警告而不阻塞——sync 失败不能让 git pull 失败

if [ "\${TEAMAGENT_BOOTSTRAP_SKIP:-}" = "1" ]; then
  exit 0
fi

if ! command -v teamagent >/dev/null 2>&1; then
  exit 0
fi

if teamagent --help 2>&1 | grep -q "m5-sync"; then
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  teamagent m5-sync --project-root "$REPO_ROOT" --apply 2>&1 || true
fi
exit 0
`;

/**
 * 根据当前项目快照决定要往项目里写哪些文件、建哪些目录。
 * 纯函数；不动 IO。
 */
export function planInfection(
  snap: ProjectSnapshot,
  input: InfectInput
): InfectionPlan {
  const files: Record<string, string> = {};
  const dirs: string[] = [];

  if (!snap.has_manifest) {
    const manifest: Manifest = {
      schema_version: 1,
      teamagent_version: input.teamagent_version,
      required_plugins: [],
      required_project_skills: [],
      required_hooks: ["UserPromptSubmit", "Stop"],
      created_by: input.author,
      created_at: input.now,
    };
    files[".teamagent/manifest.json"] = serializeManifest(manifest);
  }
  if (!snap.has_team_dir) dirs.push(".teamagent/team");
  if (!snap.has_shared_skills_dir) dirs.push(".teamagent/shared-skills");
  if (!snap.has_shared_claude_md) {
    files[".teamagent/shared-claude.md"] = SHARED_CLAUDE_MD;
  }
  if (!snap.has_githooks_dir) dirs.push(".githooks");

  const nonHookMissing =
    Object.keys(files).length > 0 || dirs.length > 0;
  const hookMissing =
    !snap.has_pre_commit_hook || !snap.has_post_merge_hook;
  const required = nonHookMissing || hookMissing;

  // W15-003: always emit hook payloads when this is an infection — even if
  // a user-authored hook of the same name already exists. The adapter
  // (applyInfection) chain-loads via marker block, so a preexisting hook
  // is augmented (not silently skipped).
  if (required) {
    files[".githooks/pre-commit"] = PRE_COMMIT_HOOK;
    files[".githooks/post-merge"] = POST_MERGE_HOOK;
  }

  return {
    required,
    files_to_create: files,
    dirs_to_create: dirs,
  };
}
