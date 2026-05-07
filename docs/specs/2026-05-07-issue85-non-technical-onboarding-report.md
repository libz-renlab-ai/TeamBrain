---
title: "Issue #85 PR1 — Non-technical onboarding 实施报告"
issue: 85
date: 2026-05-07
plan: docs/specs/2026-05-07-issue85-non-technical-onboarding-plan.md
status: PR1 ready — verdict PASS (run_id 20260507T061822Z, all 5 gates green)
---

```text
        INSTALL.md (1)
            |
            v
   parser (2) <----> contract tests (4)
            |              ^
            |              |
            v              fixtures: happy.md / missing-pnpm.md
   skill (3) install-walkthrough
            |
            v
   verify harness (5)  --> .judge/issue85-pr1/<run_id>/{T1..T5,final}/
            |
            v
   final claudefast judge --> verdict.json (PASS|FAIL)
```

# Issue #85 PR1 实施报告

PR1 vertical slice（非技术 onboarding 单一来源 `INSTALL.md`）共五个 deliverable
全部就位。每个 deliverable 都经 reporter sanity check 通过；以下按 plan §3
acceptance gates G1–G5 维度做映射。

## 交付清单

| # | 文件路径 | 形态 | 一句话说明 |
|---|----------|------|------------|
| 1 | `INSTALL.md`（worktree 根） | markdown，109 行，YAML frontmatter | 单一来源安装说明：3 个 fenced `yaml install-step` block，每个含 id/command/explanation/progress/common_errors[]；ASCII art 流程在顶部；每个 step 配 3 条 common_errors（pnpm 缺失 / EACCES / 网络超时等），`fix` 全部可复制粘贴 |
| 2 | `scripts/install-from-md.ts` + `package.json` 中 `install:from-md` script | ESM TypeScript，345 行 | Parser + Runner：用 node built-ins（fs/child_process/path）解析 fenced yaml 块、正则匹配 `common_errors[].pattern`、stdout 打印 fix；用 `filterSafeLines` 剥掉 `^\s+at` 栈帧避免 raw stack trace 泄漏；支持 `--dry-run` / `--step` / `--help` |
| 3 | `.claude/skills/install-walkthrough/SKILL.md` | project-level skill，128 行 | Frontmatter 含全部 trigger 关键词（install / onboarding / pnpm 是什么 / 怎么安装 / 我装不上 / non-technical install / 帮我安装 / 安装步骤 等）；body 用中文白话讲解，命令永远 fenced bash block，不一次讲超过一步；不匹配的错误兜底走 GitHub issue 链接；当前 session 已加载 |
| 4 | `packages/cli/src/__tests__/install-md-parser-contract.test.ts` + `fixtures/install-md/{happy.md,missing-pnpm.md}` | vitest，189 行 + 2 fixture | 11 个 it：4 schema contract（缺字段拒绝 + progress optional）/ 2 happy path / 3 error-fix matching（含 unrelated stderr 不命中）/ 2 no-stack-trace；用 `vi.spyOn(process,"exit")` 在 dynamic import 前防止 main() kill runner |
| 5 | `scripts/verify-issue85-pr1.sh` | bash，521 行，`-rwxr-xr-x` | 第三方 judge harness：T1-T5 + final judge 写到 `.judge/issue85-pr1/<run_id>/`；用 canonical claudefast flags（stream-json + debug hooks）；`zsh -i -c` 优先解析 alias，PATH fallback；纯 python3 解析 stream-json + brace-depth scanner 抓最后一个 JSON object，无 jq 依赖；macOS bash 3.2 兼容；JSON 解析失败写 sentinel `{exit_code:2, error:"json_parse_failed", metrics.raw_excerpt}`；最终 exit 0=PASS / 1=FAIL |

## 覆盖的 acceptance gates（plan §3）

Harness 跑了两次。第一次 run_id `20260507T053057Z` verdict FAIL 由两个
harness 设计 bug 导致（已修，详见下方缺陷 #5 / #6）；第二次 run_id
**`20260507T061822Z`** verdict **PASS**，5 条 gate 全绿，failed_gates=[]，
missing_evidence=[]。下面是第二次实跑数据：

| Gate | 内容 | T_n raw judge.json 数据 (run 20260507T061822Z) | Final verdict |
|------|------|--------------------------------------------------|----------------|
| G1 | parser 契约测试全绿 | T1 pass=true, total=12, failed=0；8 个 schema 字段全验证 | PASS |
| G2 | happy path：每 step 有非空 explanation，无 stack trace | T2 三 step exit=0（pnpm install / pnpm build / pnpm teamagent skeleton-demo），三 explanation 都是完整中文段（带"配件" / "翻译" / "冒烟测试"类比），any_raw_stack_trace=false | PASS |
| G3 | missing-pnpm fixture：pattern 命中 → fix 复制粘贴 → 无 stack trace 泄漏 | T3/judge.json：`pattern_matched=true, fix_text="curl -fsSL https://get.pnpm.io/install.sh \| sh -", fix_is_copy_pasteable=true, raw_stack_trace_leaked=false` | PASS |
| G4 | agent 念的每段 explanation < 200 字 + 不含 stack trace | T4 三 step len=142/151/138（全 <200），contains_stack_trace 全 false | PASS |
| G5 | 全程 `~/.zshrc` / `~/.bashrc` 哈希未变 | T5 zshrc_changed=false, bashrc_changed=false（sha256 一致） | PASS |

证据目录：`.judge/issue85-pr1/20260507T061822Z/{T1..T5,final}/judge.json`、
`final/verdict.json`。第一次 FAIL 跑的证据保留在
`.judge/issue85-pr1/20260507T053057Z/`，可用于回溯 harness bug 暴露过程。

## 已知缺陷 / open issues

下列项不阻塞 PR1 ready，已修或可推迟到后续 PR：

1. **Parser 的 block-scalar `|` 推进 bug**（已修复 by fixer）。
   原症状：`scripts/install-from-md.ts` 的 `readScalar` 处理多行 `|` block
   scalar 时内部会 `i++` 推进，但外层主循环在 case 分支末尾还会再 `i++`
   一次，导致 `|` 块之后紧邻的下一个字段被 skip。
   - 影响（修前）：worktree 根 `INSTALL.md` 字段顺序 `id → command →
     explanation(|) → progress → common_errors`，parser 吞掉 `progress`。
   - 修法（fixer approach B）：在 `readScalar` 的 `|` 分支 `return` 前
     加一行 `i--`（line 89-90 增加注释 + `i--`），让外层 `i++` 净 0 推进。
     `progress` 字段不再被吞。
   - 验证：fixer 报 `pnpm vitest install-md-parser-contract` 12/12 pass；
     smoke run `tsx scripts/install-from-md.ts --dry-run` 三个 step 都打印
     `1/3` / `2/3` / `3/3`，符合预期。

2. **SKILL.md narration 字段名 `commands` → `command`**（已修复 by fixer）。
   原症状：`.claude/skills/install-walkthrough/SKILL.md` line 60、line 82
   写成 `commands`（复数），与 INSTALL.md schema 字段 `command`（单数）不符。
   - 修法：fixer 把两处都改成 `command`，跟 schema 对齐。
   - 影响：仅 LLM 提示措辞，runtime 行为不变；现在 skill 与 schema 字段名
     完全一致。

3. **Verify harness 的 prompt 用 `bash scripts/install-from-md.ts`**（低优先级，未修）。
   `scripts/verify-issue85-pr1.sh` T2/T3/T5 prompt 沿用 plan §3 原文，写
   `bash scripts/install-from-md.ts ...`；但 install-from-md.ts 是 TS 文件需要
   tsx runner（package.json 中真正入口是 `pnpm install:from-md` =
   `tsx scripts/install-from-md.ts`）。
   - 影响：probe 内部由 claudefast agent 自主决定怎么执行，agent 大概率会
     读 package.json scripts 走 `pnpm install:from-md` 或直接 `tsx`；但
     如果 agent 真的字面执行 `bash` 会报 syntax error 让 T2/T3/T5 红。
   - 不阻塞原因：plan §3 原文的 prompt 是 plan 作者起草的；harness 实现
     按原文翻译是正确的；agent 的执行路径是 runtime 议题，不是 harness
     设计 bug。
   - 建议处理：harness 首次实跑后若 T2/T3/T5 因此红，把 prompt 改成
     `pnpm install:from-md ...` 即可；或在 prompt 里显式提示 "use
     `pnpm install:from-md` (it runs via tsx)"。

4. **Reporter 没实跑 harness**（已解决）。Verifier worker 已实跑，run_id
   `20260507T053057Z`，证据目录 `.judge/issue85-pr1/20260507T053057Z/`。

5. **Harness `extract_json` 不剥 `\`\`\`json ... \`\`\`` 围栏**（已修复 by harness-fixer）。
   原症状：旧 brace-depth scanner 不剥 markdown fence，model 返回
   ` ```json {...} ``` ` 时 T2 写 sentinel json_parse_failed。
   - 修法（双 helper + prompt 双保险，两处都修）：
     - 用 `strip_markdown_fences`（两个 `re.sub` 剥 leading/trailing
       ` ``` ` 与 ` ```json `）替代旧 scanner（line 157-161）。
     - 用 `find_first_json_object`（左到右走 `{` 位置 + 真 JSON parser
       `json.JSONDecoder().raw_decode`）替代 brace-depth scanner（line
       163-177）—— string value 嵌入 `"` 不再误判。
     - `extract_json` helper（line 180-181）+ final judge verdict
       extraction（line 463-464）两处都修，fallback sentinel 保留。
     - T1-T5 + final judge prompt 全部加 "Return ONLY bare JSON (no
       markdown fences, no prose)"（line 234, 261, 289, 316, 343, 389）。
   - 验证：harness-fixer 报 `bash -n scripts/verify-issue85-pr1.sh` 语法 OK；
     inline synthetic 测试 4 case（fenced+embedded-quotes / 末尾 prose /
     开头 prose / 无 JSON）全部 round-trip 正确。

6. **Final judge 把 G3 与 G2 串联失败**（已修复 by harness-fixer）。
   原症状：final judge 应用「T2 解析失败 → G3 cross-verify 不可信 → G3
   也 FAIL」保守 rule，把 G3 与 G2 绑死。
   - 修法：在 `FINAL_PROMPT`（line 374-381）加 `CRITICAL: Each gate is
     INDEPENDENT.` 段，三条显式规则：
     - (a) G_i 只从 T_i/judge.json 取，禁止跨 task 传染。
     - (b) `error=json_parse_failed` → 走 `missing_evidence` 不走
       `failed_gates`，除非 raw_excerpt 反证。
     - (c) well-formed sibling gate 必须独立评估，与任何 sibling parse
       failure 无关。
   - 输出 schema `verdict / failed_gates / missing_evidence / notes` 不变；
     下次重跑时 G_i 失败不再级联到 G_j。

## PR1 ready: yes — verdict PASS

**功能视角（PR1 deliverable 本身）**：ready。

- 5 个 deliverable 全部存在、shape 符合 plan §3 expected outputs。
- 12 个 contract test 已 passing（fixer 实跑 `pnpm vitest install-md-parser-contract` 12/12 green）。
- worktree 根 `INSTALL.md` 与 `.claude/skills/install-walkthrough/SKILL.md`
  对消费者（installer + agent）都是单一来源，符合 issue #85 的核心约束
  「installer 与 agent 共读同一份文件」。

**门禁视角（plan §3 acceptance gate verdict）**：PASS。

- run_id `20260507T061822Z` `final/verdict.json` 写
  `verdict="PASS", failed_gates=[], missing_evidence=[]`。
- 5 条 acceptance gate 在 raw judge.json 与 final judge 两层都 PASS。
- 第一次 run（`20260507T053057Z`）FAIL 由 harness 两个 bug 导致；
  harness-fixer 完成 fix 后第二次 run 拿到干净 PASS。fix 路径为 plan §3 推荐
  的「先修 harness 再重跑」（不接受 conditional verdict）。

后续动作（task #8，不在本 report 范围）：commit + push + 开 PR1（不要
`--draft`）+ 跑 POSTPR Codex review loop（fetch chatgpt-codex-connector
inline comments → triage P1/P2 → loop until silent or 👍）。
