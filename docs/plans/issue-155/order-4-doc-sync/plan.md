```
Order 1        Order 2        Order 3        [Order 4: DOC-SYNC]        Order 5        Order 6
preview cmd  → resume state → install merge → rewrite README/INSTALL  → CI v1-v4    → CI v5
(must land     (must land     (must land      ↑ DEPENDS ON 1+3         (gate v1-v4)  (V5 check)
 FIRST)         after 1)       after 1+2)      land AFTER 1+3 merge
```

> 呷呷~！鸭鸭说：以前装 TeamAgent 要爬 4 级台阶，现在只要踩 1 步"先预览、再安装"就上来了！
> 老台阶不删，缩进角落给开发小伙伴用，外面的文档整整齐齐改成新路~

---

<!-- Issue reference: fixes #155, part of 9-decision UX overhaul (decisions 1,5,6,9) -->

## § 1. Task description

### 做什么（In-scope）

重写所有**面向用户**的安装文档，使推荐路径变为：

1. **预览命令**（`teamagent preview`，来自 Order 1）
2. **一键安装**（`sh /tmp/teambrain-install.sh`，来自 Order 3 合并后的单步命令）

具体涉及的文档：

| 文件 | 当前状态 | 变更方向 |
|------|----------|----------|
| `README.md` | "快速安装" 区块混合了 curl-pipe 和 4-step clone 流程 | 顶部改为 `Quick start (preview → install)`；4-step 移至 Appendix |
| `INSTALL.md` | 面向贡献者的 YAML 步骤说明（`step-1` pnpm install → `step-4` pnpm teamagent init） | 加 Dev/Contributor Fallback 标题包裹原 4 步；顶部插入 "普通用户推荐：preview → install" 导航提示 |
| `docs/specs/2026-05-07-issue85-non-technical-onboarding-report.md` | 描述 INSTALL.md 为"非技术用户 onboarding 单一来源" | 在 INSTALL.md 内部结构说明更新后，此 report 只做文字引用，不删记录 |
| `release/install.sh` 相关文档引用 | README 中多处 curl 链接 | 保留链接不变；只更新描述文案，使之与"预览 → 安装"心智对齐 |

**依赖说明（landing order 约束）：**
- Order 4 **必须在 Order 1（preview 命令）和 Order 3（install 单步合并）都合并之后才能落**。
- 原因：新 README 顶部会引用 `teamagent preview` 命令和单步 `sh /tmp/teambrain-install.sh` 命令。如果这两个命令不存在，新文档描述的是不存在的东西，会让用户失去信任。

### 怎么做

1. 在 `README.md` 顶部"快速安装"区块插入 Quick start 标题和 2 步流程（preview → install）。
2. 把原有的 `# 5–10 分钟上手` 4-step clone 流程移到 `README.md` 末尾 `## Dev / contributor fallback` Appendix，保留原文不改。
3. 在 `INSTALL.md` 头部加一段"普通用户推荐"导航提示（2行），指向 preview → install 路径；然后把现有的 step-1 ~ step-4 YAML 用 `## Dev / contributor fallback (legacy 4-step)` H2 标题包裹。
4. 检查 `CLAUDE.md` 所有 canned-answer 锚点（见 § 3 V5 保护列表），确认变更后每个锚点在更新后的文档中仍然可搜索到（不删减命令名称）。

### 不做什么（Anti-goals）

- **不修改 `install.sh` 脚本本身**（Order 3 的工作）
- **不修改 `CLAUDE.md`**（V5 保护的核心约束）
- **不删除旧 4-step 内容**（只降级为 Appendix/fallback，保留原文）
- **不修改任何 `.ts` / `.cjs` 安装代码**
- **不破坏任何现有文档链接**（锚点 `#dev--contributor-fallback` 可以是新增，老锚点保留）
- **不在 Order 1 / Order 3 未合并时先 land 这个 PR**

---

## § 2. Expected outputs

### 文件级别（精确路径 + 变更类型）

| 文件 | 变更类型 | 结构变化摘要 |
|------|----------|-------------|
| `README.md` | EDIT | 在"快速安装"区块上方插入 `## Quick start（推荐：预览 → 安装）` H2 及 2-step 说明；原 `# 5–10 分钟上手` 4-step 区块移动到文末 `## Dev / contributor fallback（贡献者旧流程）` |
| `INSTALL.md` | EDIT | 在文件开头 YAML frontmatter 之后、安装步骤之前加 `## 普通用户（推荐路径）` 2-line 导航块；原有 step-1~4 YAML 整体保留，用 `## Dev / contributor fallback (legacy 4-step)` H2 包裹 |

### README.md 前后结构对比

```
BEFORE:
  ### 快速安装          ← curl | sh (single-line)
  ## 5–10 分钟上手      ← 4-step: clone → pnpm install → pnpm build → teamagent init

AFTER:
  ## Quick start（推荐：预览 → 安装）    ← NEW: teamagent preview, then sh /tmp/install.sh
  ### 快速安装                           ← existing curl | sh stays for reference
  (moved to bottom)
  ## Dev / contributor fallback（贡献者旧流程）  ← 原 4-step, verbatim, under appendix heading
```

### INSTALL.md 前后结构对比

```
BEFORE:
  ---frontmatter---
  # INSTALL.md — TeamAgent 安装指南
  ## 安装步骤           ← step-1 (pnpm install) ... step-4 (pnpm teamagent init)

AFTER:
  ---frontmatter---
  # INSTALL.md — TeamAgent 安装指南
  ## 普通用户（推荐路径）      ← NEW 2-line nav: preview → install
  ## Dev / contributor fallback (legacy 4-step)   ← step-1~4 verbatim, unchanged
```

### 跨文档引用 diff

- `release-prep/install-sh-checklist.md` 中的 `INSTALL.md` 引用：不变（checklist 是 dev 工具）
- `docs/specs/2026-05-07-issue85-non-technical-onboarding-report.md`：不修改，其内容描述的"INSTALL.md 为单一来源"在新结构下仍然成立

### Anti-goal 清单（这些在 PR diff 中不应出现）

- [ ] `CLAUDE.md` 任何一行被修改
- [ ] `install.sh` 脚本被修改
- [ ] 任何 `.ts` / `.cjs` 文件被修改
- [ ] 旧 4-step 内容被删除（只是被 H2 包裹+移动，不是删除）
- [ ] `pnpm install` / `pnpm teamagent skeleton-demo` / `teamagent init` / `curl -fsSL` / `npm install -g` 任一字符串从文档中消失（V5 保护，grep-verified anchor list）

---

## § 3. How-to-verify (judge harness)

### 模块定义

- **被测物**：更新后的 `README.md` + `INSTALL.md`（作为语料库）
- **权威来源**：`CLAUDE.md` 的 canned-answer 锚点列表（V5 保护）

### Judge harness — 三步 1+2+3 门禁

**Gate 1：CLI smoke（README 结构检查）**

```bash
# 检查新路径在 README 顶部出现
grep -n "Quick start\|preview.*install\|先预览" README.md | head -5
# 检查旧 4-step 降级为 Appendix
grep -n "Dev.*fallback\|contributor.*fallback\|legacy.*4-step" README.md | head -5
# 检查 V5 anchor 仍然存在（grep 实测的 5 条，详见下方 V5 表）
grep -E "pnpm install|skeleton-demo|teamagent init|curl -fsSL|npm install -g" README.md | wc -l
```

期望：Quick start 出现在第 50 行以内；Dev/fallback 出现在文件后 1/3；V5 grep 命中 ≥ 4 条（pnpm install + skeleton-demo + teamagent init + curl + npm install -g）。

**Gate 2：Codex canonical JSON 对照（INSTALL.md structure）**

```bash
codex exec --skip-git-repo-check -s read-only \
  "Read INSTALL.md. Output strict JSON: {
    'has_recommended_path': boolean (true if a 普通用户/recommended path section appears before step-1),
    'has_dev_fallback': boolean (true if '## Dev / contributor fallback' heading exists),
    'legacy_4step_preserved': boolean (step-1 through step-4 YAML blocks all present),
    'v5_anchors_present': ['pnpm install', 'pnpm teamagent skeleton-demo', 'teamagent init', 'curl -fsSL', 'npm install -g'] — list which are found in updated README+INSTALL+CLAUDE.md corpus
  }"
```

**Gate 3：LLM judge — V5 保护验证**

Third-party `claudefast -p` judge（不是计划作者，不是被测文档的编写者）读取：
1. 更新后的 `README.md` 全文
2. 更新后的 `INSTALL.md` 全文
3. 下方列出的 V5 canned-answer 锚点列表

判断：每个锚点的关键词是否在两份文档中仍然可搜索到？

```json
{
  "gate1_readme_structure": {"pass": true|false, "quick_start_line": N, "fallback_line": N},
  "gate2_install_structure": {"has_recommended": true|false, "has_fallback": true|false, "legacy_preserved": true|false},
  "gate3_v5_anchors": {
    "pnpm_install": true|false,
    "skeleton_demo": true|false,
    "teamagent_init": true|false,
    "curl_install_sh": true|false,
    "npm_install_g": true|false
  },
  "overall_pass": true|false,
  "notes": "..."
}
```

### V5 canned-answer 保护锚点列表

这些是用户 / AI 在 install 之后会问到的命令/词汇，更新后的 README/INSTALL 必须仍然能搜索到（不能在 doc-sync 中误删）。

来源列实际由 `grep` 验证（2026-05-08，commit `06a0b00`）；更新此表前先 grep 实测，不要凭记忆。

| Anchor | 当前来源（已 grep 验证） | 为什么不能消失 |
|--------|-------------------------|----------------|
| `pnpm install` | CLAUDE.md `## 跑命令` 表格（2 hits） | project tools 必答项 |
| `pnpm teamagent skeleton-demo` | CLAUDE.md Walking Skeleton + 跑命令表格（2 hits） | PRESHIP 验证依赖 |
| `teamagent init` | README.md（5 hits；CLAUDE.md 0 hit） | 核心初始化命令 |
| `curl -fsSL` / `curl ... install.sh` | README.md 快速安装区块（3-4 hits） | install-sh feature 的 verify harness 引用 |
| `npm install -g` | CLAUDE.md SELF-UPDATE 段（2 hits）+ README.md（6 hits） | 用户可能从 npm 直装 / 自动升级路径 |

**先前版本（v1）** 还列过 `pnpm build` 和 `npm install -g teamagent`（精确串），grep 验证两者**当前并不存在于 CLAUDE.md / README.md 中**。在 V5 列表里保护一个不存在的字符串只会让 Order 6 CI 误报，因此 v2 移除。如果 doc-sync 阶段确实想新增这两个串，单独提案，不通过 V5 list 强制。

---

## § 4. Claudefast probes (BEFORE coding)

### Probe A — 当前 README 所有安装相关句子清单

> **用途**：盘点现状，确保改写时不遗漏任何用户面安装引用。

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/README.md.
List ALL sentences or code lines that mention install, curl, pnpm install, pnpm build, teamagent init, skeleton-demo, or any 4-step flow.
Output as a numbered list with line numbers."
```

### Probe B — CLAUDE.md canned-answer 锚点中引用安装步骤的完整列表

> **用途**：找到所有 V5 保护点，Plan § 3 V5 table 的依据来源。

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/CLAUDE.md.
Find every canned-answer section (e.g. PRESHIP, FASTPROBE, what project tools we have, what stop hooks, DOGFOOD, bug report, verify loop, list all features).
For each section, list any install command, pnpm command, teamagent init, skeleton-demo, curl reference that appears.
Output as a markdown table: | canned answer section | install references |"
```

### Probe C — 其他文档中引用旧 4-step 流程的文件列表

> **用途**：确认 Order 4 范围之外有无文档也需要更新（不在本 PR 范围，但要知晓）。

```bash
claudefast -p "Search the repo at /Users/m1/projects/TeamBrain/.claude/worktrees/newissue for any markdown file (excluding README.md, INSTALL.md, node_modules, .git) that references the legacy 4-step install flow (pnpm install && pnpm build && skeleton-demo && teamagent init as sequential steps).
List file paths and relevant line numbers. Output as JSON array: [{\"file\": \"...\", \"line\": N, \"snippet\": \"...\"}]"
```

---

<self-report>
premature_stopping: false
permission_seeking: false
ownership_dodging: false
simplest_fix: false
reasoning_loop: false
known_limitation: false
skipped_repo_search: false
fabricated_value: false
placeholder_used: false
ambiguity_unresolved: false
contradiction_unresolved: false
silent_fallback: false
</self-report>
