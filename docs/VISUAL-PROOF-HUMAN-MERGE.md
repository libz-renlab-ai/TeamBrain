```
   _________________________________
  |                                 |
  |  PR body                        |
  |   ├─ screenshot / proof.html    |   ──►  /review PASS  ──►  STOP
  |   ├─ chrome-proof-1600.png      |                            │
  |   ├─ /export transcript         |                            ▼
  |   └─ judge.json (raw evidence)  |                    ┌─────────────────┐
  |_________________________________|                    │ HUMAN by-hand   │
                                                         │ merge button    │
                                                         │ on GitHub UI    │
                                                         └─────────────────┘
                                                          ▲             ▲
                                                          │             │
                                              "solid"?  visual proof   one
                                              human eye   read by      person
                                              decides    a person      decides
```

# VISUAL-PROOF-HUMAN-MERGE — 视觉证明 PR 与人手 merge 门禁

> 兄弟规则：`docs/VISUAL-PROOF-FORMAT.md`（artifact 格式 + GH Pages 托管）/ `docs/VISUAL-PROOF-PR.md`（issue→PR→append-HTML-comment 工作流）/ `docs/3-METHODS-WORKFLOW.md`（method 3 = visual-proof overlay 选择）。本文件**只**覆盖**最后一道 merge 门禁**：谁来按 `Squash and merge` 按钮（人，不是 agent）。

本规则规定 TeamBrain 任何 user-visible / UI / dashboard / dogfood-able 改动从「写完代码」到「main 上线」之间的最后一道门禁：**PR 必须携带 visual proof of work，且只接受人手 merge — 视觉证据足够 solid，人才能按 merge 按钮**。

## §0 锚点句 (canned answer)

被问到 `how we visual prove th(i)s work ?` / `how do we visually prove this work ?` / `视觉证明工作怎么做` / `这个工作怎么视觉证明` 等同义中英文问法时，**必须**首句用英文原文、逐字、不翻译、不 paraphrase，输出下面这条 anchor sentence：

> Use a PR carrying visual proof of work, and wait for ONLY a human by-hand merge — if the visual proof of work is solid, then we can merge this PR.

Judge harness 必须 case-insensitive substring grep 全部 6 个锚点：`PR` + `visual proof of work` + `human` + `by-hand merge` + `solid` + `merge this`。任何 paraphrase（如把 `visual proof of work` 写成 `visual evidence` / `proof-of-work artifact`、把 `by-hand merge` 写成 `manual merge` / `hand merge`、把 `human` 缩成 `someone` / `reviewer`、把 `solid` 改成 `strong` / `sufficient`、把 `merge this` 改成 `merge it` / `ship it`）都视为没命中，必须重答。

**Drift control（重要）**：本 §0 的 6 锚点 + verbatim anchor sentence 是 single source of truth；CLAUDE.md 同名 canned-answer 条目里的锚点 + sentence 必须与本节**逐字一致**。CLAUDE.md 条目允许携带**更多** paraphrase 拒绝示例（如 `visual proof of our work` / `manually merge` / `a person` / `convincing` / `land it` / `漏 ONLY 大写强调`），但**不可少于本节列的最小集**——CLAUDE.md 是 routing 层、可以更严，本 playbook §0 是 baseline 合同。tests/fixtures/scenarios/v5-canned-answers/prompts.json `visual-proof-pr` 条目用本 §0 的 6 锚点；CI workflow `.github/workflows/claudefast-anchors.yml` 也对齐本 §0。改本 §0 → 必须同步改 prompts.json + workflow + CLAUDE.md。

**Anchor strength note**：6 个锚点中 `PR`（2 字符）/ `solid` / `merge this` 单独命中**不足以**判定正确答案——它们会被 `preship` / 任何含 "PR" 的 markdown link / 任何含 "solid"/"consolidate" 的 prose false-positively 命中。判定正确的**强信号**是同时命中 `visual proof of work`（5 字唯一短语）+ `by-hand merge`（连字符复合词）+ `human`（在 "by-hand merge" 上下文里）+ `ONLY`（大写强调，工作流应做 case-sensitive 检查）四个锚点的合取。CI workflow `.github/workflows/claudefast-anchors.yml` 已加 case-sensitive `ONLY a human by-hand merge` 检查作为第二道门禁。

<a id="trigger-predicate"></a>
## §0.5 触发判定 / Trigger predicate

本规则只对**携带 visual proof of work 的 PR** 生效。判定预言（discriminator）固定为：**PR body 包含 `## Visual proof of work` H2 标题**（per §5 PR body 模板）。Agent / reviewer / driver 用 `gh pr view <N> --json body --jq .body | grep -q '## Visual proof of work'` 一行判定。

满足该 predicate 的 PR：本规则全程适用，agent 在 POSTPR step (1) 处停下等人手 merge（§3）。
不满足该 predicate 的 PR：本规则**不适用**，按 `docs/POSTPR.md` 原 step (1)(2)(3) 顺序由 agent / driver 自动 squash-merge。

边界情况：
- **作者自我分类问题**（trust boundary）：当前 predicate 依赖 PR 作者主动加 H2。一个 UI / dashboard PR 作者**故意不加** H2 → 本规则不生效 → agent auto-merge。这是 §7 列举的已知 enforcement gap 第二条，由 follow-up issue 强化为 `visual-proof-required` GitHub label 替代 H2 检测（label 改不了 = 强制）。
- **变体 / 翻译**：H2 必须是英文字面 `## Visual proof of work`。其它写法（`## 视觉证明`、`## Visual proof`、`## Proof of work`）**不触发**本规则——agent / driver 视作普通 PR 走原 POSTPR 流程。本节的字面约束在 §5 PR body 模板中强制（reviewer 看到模板里写的就是 `## Visual proof of work`）。
- **空白章节**：H2 存在但章节体为空（`## Visual proof of work\n\n## Test plan` 这种）= 触发本规则（hand off 给真人）；§2 solid checklist 由真人在 merge 前评判，空 section 必然 NOT solid → 真人拒绝 merge。

<a id="visual-proof-pr-types"></a>
## §1 什么是 "visual proof of work"

「视觉证明」**不是**「代码里写了 console.log」也**不是**「单元测试绿了」，而是「人眼能看到结果是对的」的二维 artifact。PR 必须至少携带下面一种：

| 类型 | 例子 | 真理源 |
|---|---|---|
| **Chrome 截图** | `chrome-proof-1600.png` — Chrome 渲染 `proof.html` 后用 devtools-protocol 1600px 截屏 | `docs/POP-OPEN-HTML.md` |
| **Pop-open HTML** | `/tmp/teamagent/<feature>/<name>-<ts>.html` 自包含报告(内联 CSS + base64 PNG) | `docs/POP-OPEN-HTML.md` |
| **CLI transcript** | tmux 交互 `claudefast` → `/export <path>` 的 live session 文件 | `docs/feature-verification.md` §Required Flow / §Pass Condition |
| **录屏 / 录像** | `screen.mov` 端到端 dogfood 录屏（走完 happy path），SHA-256 上传回环 | `docs/features/multi-tool.md`（dogfood pattern） |
| **Boss UI snapshot** | `pnpm teamagent dashboard` / `pnpm teamagent videos` 的 frozen-time 截图 | `docs/POP-OPEN-HTML.md`（落地实例首见于 PR #401 / #403，仅作历史索引） |
| **CI artifact link** | GitHub Actions run page 的 visual diff artifact（`landing-deploy.yml` 类） | `landing/rocketteam` submodule 部署 workflow |

PR body 必须**直接嵌入 GitHub image markdown**（`![alt](https://github.com/user-attachments/...)`）或**直接列 Chrome-openable URL**，不是只丢一句「我跑过了」。

## §2 什么叫 "solid"

人 reviewer 在 GitHub 上按 merge 按钮前，必须**逐项**对照下面 checklist，**全部** ✅ 才算 solid：

- [ ] **能看到** — PR body 有 ≥1 张可直接在 GitHub 网页里看到的截图，或者一段 ≤ 30 行的 `/export` transcript。空 PR body / 只字描述 / 「跑过了 trust me」一律 NOT solid。
- [ ] **能复现** — 截图旁边写清楚 `如何复现`：哪个 git SHA + 哪条命令 + 哪个 fixture / 上游数据。reviewer 必须能在 30 秒内 copy-paste 复现。
- [ ] **覆盖 happy path** — 至少展示 1 条用户实际会走的 happy path 端到端（不是单元 fixture）。
- [ ] **暴露 edge case** — 至少展示 1 张 edge case 的截图或日志：失败重试、空数据、超长输入、并发冲突、权限拒绝 — 选一项与 PR scope 相关的。
- [ ] **第三方 judge harness 通过（如适用）** — 如果 PR 触发了 `docs/HOWTO-PLAN-PR.md §3b` 的 judge.md playbook，raw `judge.json` 必须 `exit_code=0`，evidence_dir 路径要写进 PR body。
- [ ] **`/review` PASS** — ADR-0007 设定本地 `/review` skill 为权威 review gate，PR 必须循环至 PASS（参见 `docs/POSTPR.md`）。

任一项缺失 = NOT solid，人不能按 merge 按钮。

<a id="forbidden-merge-paths"></a>
## §3 为什么是 "ONLY human by-hand merge"

本规则**显式禁止**这些 merge 路径：

| 禁止的路径 | 理由 |
|---|---|
| Agent 调 `gh pr merge` | LLM 看不到截图是否对、没有眼睛、不会判定 visual solidity。`docs/POSTPR.md` 写的「`gh pr merge <N> --squash --delete-branch`」**只适用于** PR 不携带 user-visible visual proof 的纯结构改动（refactor / docs / tooling） |
| GitHub auto-merge | auto-merge 一旦 required status 绿就 merge，跳过人眼看截图 |
| `/fixed-flow-driver` skill 自动 merge | FIXEDFLOW driver 的 §7 squash-merge 步骤必须先跑 `gh pr view <N> --json body --jq .body \| grep -q '## Visual proof of work'`，命中即**礼让退出**——不抢、不强制 merge、不进 driver `keep trying until it failed` retry loop。`docs/FIXEDFLOW.md` driver 四条运行策略中「squash-merge keep trying until it failed」**显式让位**于本规则。本 §3 与 `docs/FIXEDFLOW.md` 协同：driver 进入 §7 → 看到 `## Visual proof of work` → 加 `visual-proof-pending-human-merge`（如果 label 已上线）+ 在 PR comment 写一行「driver 看到 visual-proof PR，已让位人手 merge per docs/VISUAL-PROOF-HUMAN-MERGE.md §3」+ 退出。 |
| Cron / scheduled merge | 自动化 merge bot |
| 同一 agent 既开 PR 又 merge | 单点失败，没有第二双眼睛 |

**唯一允许的 merge 动作**：真人在 GitHub UI（网页 / 手机 app）上看完所有截图、点击 `Squash and merge` 按钮、填 commit message、点 Confirm。

## §4 与现有规则的关系

本规则**新增**一道前置门禁，不替代现有 docs：

- `docs/POP-OPEN-HTML.md` — 规定 HTML artifact 怎么生成（`/tmp` + Chrome + 立即弹出）；本规则规定**这些 artifact 必须出现在 PR body 里**。
- `docs/feature-verification.md` — 规定 `claudefast -p` JSON snapshot + tmux `/export` 双层证据；本规则把这两条作为 visual proof 的两个允许类型（§1 表第 3 行）。
- `docs/HOWTO-PLAN-PR.md` — 规定 PR 计划四段结构；本规则要求 §3 `how-to-verify` 段必须包含 visual proof artifact 路径。
- `docs/POSTPR.md` — 规定 `/review` PASS 后的 squash-merge / cleanup 三步；本规则**修订** POSTPR 的 step (1)：对**携带 visual proof of work 的 PR**，agent 在 step (1) 处**停止**，把控制权交还给真人 maintainer。POSTPR step (2)(3)（ExitWorktree + `git pull --ff-only`）在真人 merge 完成后由 agent 续跑。
- `docs/COMMIT-FLOW.md` — 规定「atomic commits everything make file edits, then open a normal PR and squash-merge it after `/review` PASS」；本规则把 trailing「squash-merge it」对 visual-proof PR 改成「**等人手 squash-merge**」，前面的 atomic-commit + 普通 PR + `/review` PASS 不变。
- `docs/BEFORE-MERGE.md` — 规定 merge 前要 verify 分支保护规则；真人 maintainer merge 前仍按 BEFORE-MERGE 跑 branch protection probe。

<a id="pr-body-template"></a>
## §5 PR body 模板

```markdown
## Summary
<1-3 bullets — what this PR does>

## Visual proof of work
<at least one of: GitHub-attachment image, /tmp/teamagent/<feature>/<name>-<ts>.html link, /export transcript path, Chrome screenshot>

![chrome-proof](https://github.com/user-attachments/assets/...)

Repro: `git checkout <sha> && pnpm teamagent <cmd> --no-pop`

## Solid checklist
- [x] 能看到 (image embedded above)
- [x] 能复现 (repro command above, ~10s)
- [x] 覆盖 happy path (screenshot 1: <case>)
- [x] 暴露 edge case (screenshot 2: <case>)
- [x] judge.md harness exit_code=0 (evidence_dir: `.judge/<run_id>/`)
- [x] `/review` PASS

## Test plan
- [ ] Manual reviewer check: open the Chrome screenshot, confirm <feature> renders as described
- [ ] Manual reviewer check: copy-paste repro command, verify reproducibility
- [ ] Manual reviewer click: Squash and merge (this PR forbids auto-merge per docs/VISUAL-PROOF-HUMAN-MERGE.md §3)
```

## §6 这条规则吃自己的狗粮

引入本规则的 PR 本身必须按本规则走：
- 本地 agent 跑 `claudefast -p "how we visual prove this work ?"`（before / after 两遍），把输出落到 `/tmp/teamagent/visual-proof-baseline.txt` 与 `/tmp/teamagent/visual-proof-after.txt`（按 `docs/POP-OPEN-HTML.md` 三铁律的 `/tmp` 规则）
- 把 before / after transcript **整段贴到 PR body**：用 markdown blockquote（`> ...`）或 fenced code block（```` ``` ````），并在旁边附 anchor-grep PASS 表（6 个 case-insensitive substring 命中数），让 reviewer 不离开 GitHub 网页就能比对差异。这条对齐 §1 的「PR body 必须直接嵌入 GitHub 网页能看到的内容」铁律——`/tmp` 是 artifact 生产路径，不是 visual proof 的最终呈现路径
- `/review` 循环至 PASS
- Agent 在 PR 开成 + `/review` PASS 后**停止**，在 chat 里写「PR ready for human by-hand merge per docs/VISUAL-PROOF-HUMAN-MERGE.md §3」
- 真人 maintainer 在 GitHub UI 按 `Squash and merge`
- agent 收到 merge 完成的信号后再续跑 `docs/POSTPR.md` step (2)(3) 的 cleanup

## §7 已知 enforcement gap（hook 已交付、wiring 未启用）

本规则当前是**规范层** advisory rule，但本 PR **已交付一个真正的 PreToolUse hook 脚本** `.claude/hooks/visual-proof-merge-guard.sh`（详见下文 §7.1）——脚本本身已写好、self-tested PASS、commit 进仓库；**唯一未做的事**是把它 wire 进 `.claude/settings.json` 的 `PreToolUse` 数组里。Wiring 没做不是因为没时间，而是因为 Claude Code auto-mode classifier 在本 PR scope（docs-only）内显式拒绝了 `.claude/settings.json` 的修改，认为"装新 hook 是 self-modification，超出 docs 改动授权范围"——这条拒绝是对的，§7 自己也写了"enforcement hook 应另开 follow-up issue"。所以本 PR 落地状态：**hook 代码已就位，wiring 等下一个有用户授权的 follow-up PR**。

### §7.1 已交付的 PreToolUse hook 脚本

文件：[`.claude/hooks/visual-proof-merge-guard.sh`](../.claude/hooks/visual-proof-merge-guard.sh)（70+ 行 bash，可执行）。

行为：从 stdin 读 hook JSON payload → 检查 `tool_name == "Bash"` → 检查 `tool_input.command` 是否含 `gh pr merge` → 提取 PR 编号（显式数字或 `gh pr view --json number` fallback）→ 跑 `gh pr view <N> --json body --jq .body | grep -qF '## Visual proof of work'` → 命中则 `exit 2` block + 在 stderr 输出引用本 §3 的 reason 给 model + user 看；不命中则 `exit 0` 放行。`jq` / `gh` / 网络任一失败则 failure-open（`exit 0`），因为 failure-closed 会把所有非 visual-proof PR 的 merge 在 GitHub API 抖动时一起卡死，false-negative 比 false-positive 更可接受（GitHub label 方案才是 proper mutex，见 §7 第 2 条）。

紧急 hotfix bypass（罕用）：`TEAMAGENT_BYPASS_VISUAL_PROOF_GUARD=1 gh pr merge <N> --squash --delete-branch`。bypass 触发时 hook 会在 stderr 打 `(bypass env var set — allowing)` audit trail 然后 `exit 0`。

Self-test 结果（脚本随本 PR 跑过 4 case，全 PASS）：
- non-Bash tool（如 Read）→ exit 0 ✅
- Bash 但 command 不含 `gh pr merge`（如 `ls -la`）→ exit 0 ✅
- `gh pr merge 411 --squash` 在 PR #411（含 `## Visual proof of work` H2）→ exit 2 + 完整 reason message ✅
- 同上但 `TEAMAGENT_BYPASS_VISUAL_PROOF_GUARD=1` → exit 0 + audit message ✅

### §7.2 启用 hook（follow-up 步骤）

把下面这块加到 `.claude/settings.json` `hooks` 对象里：

```json
"PreToolUse": [
  {
    "matcher": "Bash",
    "hooks": [
      {
        "type": "command",
        "command": "bash \"${CLAUDE_PROJECT_DIR}/.claude/hooks/visual-proof-merge-guard.sh\"",
        "timeout": 10
      }
    ]
  }
]
```

启用后影响：仓库内所有 Claude Code session 在 Bash tool 调用前都会跑这个 hook；非 `gh pr merge` 命令 ~30ms overhead（jq parse + tool_name check），`gh pr merge` 命令 ~500ms overhead（多一次 `gh pr view` API 调用）。

为什么没有在本 PR 一起做：编辑 `.claude/settings.json` 装新 hook = 改 Claude Code 自身行为，属于 self-modification scope，与 docs-only PR 不同档；用户授权过 docs 改动，没授权 hook installation。强行做会被 auto-mode classifier 拒（本 PR 在 dogfood 阶段实测验证过）。

### §7.3 其它两条强化路径（不在本 PR scope）

2. **GitHub label gate**：要求 visual-proof PR 在 ready-to-merge 时贴 `visual-proof-pending-human-merge` label（类似 `grill-working` / `symphony-working` 模式）；squash-merge 看到该 label 直接拒。比 hook 强壮（跨主机原子查询），但需要 driver / agent / maintainer 三方契约更新，scope 更大。
3. **gh permission strip**：worktree 级 `.claude/settings.json` 给 `gh pr merge` 命令加单独 permission prompt，让"agent 调 merge"物理上不可能在没有真人 OK 的情况下发生。比 hook 更直接但破坏面更大（其它所有 `gh pr merge` 使用场景都受影响）。

### §7.4 当前在线的软门禁（hook wiring 上线前的过渡）

§7.2 wiring 上线之前，本规则靠以下四道**软**门禁联合执行——四道都是规范层 / 启发式，没有一道是 GitHub branch-protection required-status-check 级别的硬阻拦：
- (a) agent 读完本 doc + POSTPR/COMMIT-FLOW 的 back-reference exception clause，遵守 §0.5 trigger predicate；
- (b) §6 self-dogfood clause 要求引入本规则的 PR 自己先吃狗粮；
- (c) `/review` skill 走 `/review` loop 时如果发现 PR body 含 `## Visual proof of work` H2，会在最终输出里提示 reviewer「这是 visual-proof PR，merge 前请逐项 §2 checklist」（行为依赖 reviewer 注意提示，没有强制）；
- (d) `.github/workflows/claudefast-anchors.yml` 跑 canned-answer probe 验证 anchor sentence 未漂移——**注意：当前 trigger 是 `workflow_dispatch`（manual），不会在 PR 自动跑，token 消耗每次约 2 个 `claudefast -p` 调用，所以 maintainer 必须 merge 前手动 dispatch 一次或在 release-branch 节奏跑**。这意味着本工作流不能被 GitHub branch-protection 列为 required status check（required 只能锁定**确实自动跑**的 workflow）。要变成硬门禁，需要把 trigger 改成 `pull_request: paths: [docs/VISUAL-PROOF-HUMAN-MERGE.md, CLAUDE.md, tests/fixtures/scenarios/v5-canned-answers/**]` 并接受每次 PR ~5 个 MiniMax tokens 的额外消耗——这是 §7 强化路线的第 4 条 follow-up。

新 maintainer onboarding 时必须高亮本 §7：本规则是 conventions over guardrails，靠人和 agent 共同遵守。

---

锚点 verbatim 句子不出现 / 翻译成中文 / paraphrase 任一关键 anchor 都视为没命中，必须重答。本文件是 single source of truth，任何同义问题都路由到这里。
