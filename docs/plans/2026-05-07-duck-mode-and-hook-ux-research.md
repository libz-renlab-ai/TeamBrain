```text
                ┌──────────────────────────────────────┐
                │   research.md — duck-mode + hook UX  │
                │   issues #116 + #86 (combined PR)    │
                └──────────────┬───────────────────────┘
                               │
        ┌──────────────────────┴──────────────────────┐
        │                                             │
   #116 jargon                                  #86 hook UX
   emit sites                                   + matcher FP
        │                                             │
        ├── postinstall.mjs (install banner)          ├── pre-tool-use-sdk.ts
        ├── init.ts renderInitResult                  │   (formatWarnMessage,
        ├── stats.ts renderStats                      │    formatBlockReason,
        ├── warmup.ts banner                          │    formatAsciiRuleBlock)
        ├── bin.ts install-hook /                     ├── bin-pre-tool-use.ts
        │   install-user-hook                         │   (stderr emit, matcher
        └── (no opt-in flag yet)                      │    invocation)
                                                      ├── keyword-matcher.ts
                                                      │   (substring match,
                                                      │    no whitelist)
                                                      └── README.md hero
                                                          (no screenshots dir)
```

# Research — duck-mode + hook UX combined PR

Companion to `2026-05-07-duck-mode-and-hook-ux-plan.md`.
Date: 2026-05-07. Author: claude-opus-4-7. Worktree: `.claude/worktrees/issue116` (branch `worktree-issue116`).

This file is a context dump only — no decisions, no scope. The plan file owns the decisions. All paths are relative to the repo root unless noted.

## 1. Issue context

### Issue #116 — installer cute CEO duck mode

- Source: `https://github.com/libz-renlab-ai/TeamBrain/issues/116` (label `enhancement`).
- User report (2026-05-07 14:15): "专业名词用户看不懂，需要在安装过程中的每次回答都 explain to a cute CEO duck please（允许永久保留这个 feature）".
- Behavior contract (verbatim from issue body):
  - Any user-visible output (installer / CLI / statusline / hook notification) can be paired with a 中文 cute-duck explanation under "duck mode".
  - Duck explanation uses project-existing duck-voice signals: at least one of `呷呷~` / `鸭鸭说` / `(>ω<)` / ASCII duck.
  - User can explicitly enable / disable. Switch name not specified.
  - When enabled, every user-visible line gets ≥1 duck line covering each engineer term that appears.
  - When disabled, output reverts to current shape; engineer-view conciseness preserved.
- Verification clauses V1–V5 written into the issue (jargon coverage ≥100% in duck mode, persistent feature outside install, 中文 only, engineer view unchanged ±5%, FASTPROBE anchors not regressed).

### Issue #86 — hook prompts as humane messages + README screenshots

- Source: `https://github.com/libz-renlab-ai/TeamBrain/issues/86` (labels `enhancement`, `help wanted`).
- Original user complaint: red ASCII art box with `置信度 0.90 · 已触发 0 次 · 1天前学到 / 避免: ... / 使用: ... / 理由: ...` is opaque to non-technical users; reads like a stack trace; never tells them "what I just tried, why it was caught, what to do now".
- False-positive embedded in the issue: a routine `gh issue create` whose body string referenced a rule name was intercepted because `wrong_pattern` matching is naive substring on concatenated tool-input fields.
- Five concrete tasks listed: rewrite hook block (first-line humane); change framing color (drop `Error:` red into `⚠️ TeamAgent 提醒`); add wrong-pattern context whitelist (skip meta-commands or doc references); add ≥2 README screenshots (intercept + learning); screenshot redaction checklist; ≥1 non-technical user dogfood (30s comprehension test).
- Dependency: tightly coupled to #84 (landing page) and #85 (non-technical onboarding) per issue body.

## 2. Code map — issue #86 (hook output + matcher)

### 2.1 Hook block formatting

`packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts`

- L148–159 `formatWarnMessage(rule, now)`: produces the warn-tier ASCII box header `置信度 ${conf} · ${age}学到` and field rows `避免 / 使用 / 理由`. Wrapped via `formatAsciiRuleBlock("TeamAgent 经验提醒", lines)`.
- L161–173 `formatBlockReason(rule, now)`: block-tier variant. Header includes `已触发 ${hitCount} 次`. Wrapped as `formatAsciiRuleBlock("TeamAgent 强烈提醒", lines)`.
- L182–193 `formatAsciiRuleBlock(title, lines)`: draws the box using `+--`, `+`, `|`, `-` ASCII chars and `RULE_BOX_WIDTH` / `RULE_BOX_INNER_WIDTH` constants. No first-line summary, no detail-collapse.
- The literal Chinese strings `避免` / `使用` / `理由` are the field labels users complained about reading like internal jargon.

### 2.2 Hook stderr emission path

`packages/cli/src/bin-pre-tool-use.ts`

- L84–91: legacy keyword matcher invocation — flattens `tool_input` and passes to `matchRulesAsync`.
- L96–134: semantic matcher attempted (fallback to legacy on error per L190–194).
- L174: `mergeSemanticAndLegacyMatches()` blends both result sets.
- L234–236: `if (result.systemMessage && process.env.TEAMAGENT_HOOK_STDERR !== "0") { process.stderr.write(...) }` — direct stderr write, **not through AttributionBus**.

`packages/cli/src/bin-stop.ts`
- L78, L178, L186, L207 (and others): `process.stderr.write("TeamAgent: 向量化补全 N 条规则\n")` etc. — also direct stderr.

### 2.3 Color framing

`packages/cli/src/bin.ts:1022` — `process.stderr.write(`Error: ${err.message}\n`)`. The literal `Error:` prefix is in this global error handler, not in the hook block code. Red coloring observed by user is terminal-default stderr coloring (no explicit `\x1b[31m` in hook source).

`packages/benchmark/src/sdk-runner.ts:17` defines `red: (s) => USE_COLOR ? \`\x1b[31m${s}\x1b[0m\` : s` but is benchmark-only.

### 2.4 Wrong-pattern matcher (legacy)

`packages/core/src/matcher/legacy/keyword-matcher.ts`

- L28–65 `matchRules(input, rules)`: entry point.
- L40–44: M3-洞1 refactor — filter relaxed from `type === "avoidance"` to `!rule.wrong_pattern`. So both `avoidance` and `practice` rules with `wrong_pattern` participate.
- L51: enforces `channel === "tool-action"` (M4-A scoping).
- L55 `splitPatterns(rule.wrong_pattern)` — split on `|` or `/` per the source comment.
- L55–57 `patterns.some((p) => patternMatches(...))`.
- L69–82: input concatenation — joins `command`, `content`, `file_path`, `url`, etc. into one haystack string. **This is the false-positive root**: a `gh issue create --body "wrong_pattern as documentation"` ends up with the pattern inside the haystack indistinguishable from real violations.
- L108–141 `patternMatches(pattern, haystack)` → `containsNonExtending(haystack, pattern)`: plain `.includes()` for punctuation-heavy patterns; word-boundary check for alphanumeric. **No quoted-arg detection, no meta-command exemption.**

### 2.5 Semantic matcher (M4-B)

`packages/core/src/matcher/semantic-matcher.ts`

- L28–50 `semanticMatch()` — BM25 + dense RRF. Uses `XenovaRuleEmbedder` + `SqliteSemanticRetriever`. Does NOT use substring `wrong_pattern`; pattern lives only in legacy.
- Default for normal users; falls back to legacy on error or when `TEAMAGENT_MATCHER=legacy` is set.
- Both run in dual-layer at L94–189 of `bin-pre-tool-use.ts`. Legacy still runs even when semantic is available — so legacy false positives still surface.

### 2.6 Matcher tests

`packages/core/src/matcher/legacy/__tests__/keyword-matcher.test.ts` — basic substring tests. No quoted-arg / meta-command coverage; this is where new test cases land.

### 2.7 Rule schema

`packages/types/src/knowledge-entry.ts`

- L75 `wrong_pattern: z.string().default("")`.
- L148–149 `hard_negatives` exists (vector negatives for semantic matcher; not for substring).
- No `meta_command_exempt` / `context_blacklist` / `quoted_arg_ignore` fields. Adding one is a schema migration.

### 2.8 README hero

`README.md`

- L1–8: title + badges.
- L10–22: "为什么需要它" — empathy intro.
- L25–42: "5–10 分钟上手" install block.
- No screenshots referenced. No `docs/screenshots/` directory (`ls docs/screenshots` returns "No such file or directory").
- This is where the issue #86 hero screenshots will land.

## 3. Code map — issue #116 (installer + CLI jargon emit sites)

### 3.1 `packages/teamagent/postinstall.mjs`

- L25 `⏳ TeamAgent: 预热向量模型 multilingual-e5-small (~120MB)...` — jargon: 向量模型 (embedding).
- L29 `✅ TeamAgent: 模型预热完成 (${durationMs}ms)`.
- L118 `ℹ️ update-state init 失败: ...` — error path.
- L130–147 install banner — multi-line:
  - `✨ TeamAgent 安装成功`
  - `· 归因渲染: verbose 模式 (TEAMAGENT_VISIBILITY=smart 可调)` — jargon: 归因渲染, verbose, smart
  - `· 知识种子: ${ruleMsg}` — jargon: 知识种子
  - `· 自动初始化: ${userHookMsg}` — jargon: hook
  - `· 下一步: 直接打开 Claude Code`
  - Numbered next-step list (skeleton-demo / stats / --help)
  - Footer link to docs.
- L153 `ℹ️ TeamAgent doctor 有未通过项...knowledge.db 未初始化...` — jargon: doctor, knowledge.db.

### 3.2 `packages/cli/src/commands/init.ts` `renderInitResult()` — L843–908

Per-step detail emitters (subset):

| step key            | sample output                                       | jargon                                |
|---------------------|-----------------------------------------------------|---------------------------------------|
| `detect-stack`      | `lang=typescript fw=next.js pm=pnpm`                | tech stack                            |
| `load-preset`       | `注入元原则 4 条`                                    | 元原则 (meta-principle)               |
| `load-seed`         | `注入打包规则 28 条（总 28 条）`                      | seed, 打包规则                         |
| `scan-rules`        | `CLAUDE.md: 15 bullets`                             | bullets                               |
| `structure-rules`   | `成功导入 12/15（跳过 0，失败 3）`                    | LLM structuring                       |
| `install-hook`      | `已注册: .claude/settings.local.json` / `⚠️ 检测到已有 statusLine，未覆盖` | hook, statusLine, settings.local.json |
| `install-plugins`   | `5 新装` / `3 已存在`                                | plugins                                |
| `compile-skills`    | `已导出 28 条候选规则到 Skills；CLAUDE.md 规则块输出已禁用` | Skills, 规则块                         |
| `link-codex-files`  | `已确保软链接: .codex/skills`                        | Codex, 软链接                          |

Final summary block at L879–893: `✅ TeamAgent 安装成功！` + next-step list `teamagent doctor`, `teamagent stats`.

### 3.3 `packages/cli/src/commands/stats.ts`

- L96–192 `renderStats()` — main stats body. `按分类: C/E/S/K` (code/engineering/strategy/knowledge tier letters).
- L159–165 high-hit rules: `[M次] trigger → correct_pattern (conf=0.92)` — jargon: trigger, correct_pattern, conf.
- L168–172 recent: `[date] C/tag trigger`.
- L175–189 confidence movements: `本周（7 天）confidence 变化 top N` — jargon: confidence.
- L195–206 `renderExplain()`: `tier: experimental (max ever: canonical)` / `confidence: 0.850` / `demerit: 0.00 (updated never)`. Heavy jargon for individual rule detail.
- L302–338 `renderStuckInPromotion`, `renderOverrideSignals` — diagnostic modes with deep jargon.

### 3.4 `packages/cli/src/commands/warmup.ts`

- L25 `⏳ TeamAgent: 预热向量模型 multilingual-e5-small (~120MB)...`
- L29 `✅ TeamAgent: 模型预热完成 (${durationMs}ms)`
- L34 `   不影响安装；首次使用时仍会按需下载。`

### 3.5 `packages/cli/src/bin.ts` install-hook commands

- L331–341 `install-hook` output: `✅ Hook 已注册到 Claude Code: ${settingsPath}` + `入口: ${hookEntry}` + `下次开 Claude Code 时生效。`
- L352–374 `install-user-hook` output: `✅ 用户级 SessionStart hook 已注册: ${settingsPath}` + `打开任何新项目时将自动检测并 init`.

### 3.6 No existing duck / explain flag

grep confirms:
- `stats.ts:21` has `explain?: string;` but it's the per-rule-detail `--explain <id>` flag, not a global mode.
- `analyze.ts` has `--verbose` / `-v` for analyze only.
- No `--ceo-mode`, `--explain-like-ceo-duck`, no `TEAMAGENT_EXPLAIN_*` env, no duck-related symbol anywhere.

## 4. Duck voice style anchors

User-level `~/.claude/CLAUDE.md` and project `CLAUDE.md` define DUCKPLAN duck signals:
- `呷呷~`
- `鸭鸭说` / `鸭鸭`
- `(>ω<)`
- ASCII duck (e.g. `   __`/`<(o )___`/` ( ._> /`/`  `---'`).

Constraint: 中文 only. `quack quack ~` is explicitly disallowed by the user-level rule. Each duck snippet must contain ≥1 signal token.

Existing duck-voice example in repo: project CLAUDE.md DUCKPLAN section uses these signals when explaining the four-section plan rule. The duck-mode lookup table can borrow that voice.

## 5. Existing reference docs

Verified present:
- `docs/HOWTO-PLAN-PR.md` — 4-section PR plan workflow.
- `docs/feature-verification.md` — 1+2+3 gate (claudefast → codex exec → JSON hard-match → tmux `/export`).
- `docs/FASTPROBE.md` — orient → parallel → audit recipe.
- `docs/POSTPR.md` — Codex review fetch + triage loop.
- `docs/rules/duckplan.md` — duck signal canon.
- `docs/PRODUCT-FEATURES.md` — 58 features. Items affected by this PR: "AI 犯错前提醒" (#86) and "纠正一次下次记住" (#86 README).
- `CLAUDE.md` — POSTPR canned answer requires `fetch the codex review` literal phrasing; FASTPROBE conflict-resolve canned answer; PRESHIP CSV.

Missing dirs (will create):
- `docs/screenshots/` — for #86 README screenshot assets.
- `.judge/` (per-repo top-level): not present; judge runs go to `.judge/<run_id>/` per testing-judge-harness rule. Already gitignored typically.

## 6. Constraints surfaced from CLAUDE.md / AGENTS.md

- **Functional Core Imperative Shell**: hook output should ideally route through AttributionBus (`packages/ports/src/attribution-bus.ts`) instead of direct stderr. Currently does not — flag for the plan as either in-scope cleanup or follow-up tech debt.
- **Worktree placement**: new worktrees go under `.codex/worktrees/`. #116 currently in legacy `.claude/worktrees/issue116`; #86 newly created at `.codex/worktrees/issue86`. The combined plan PR will be opened from `worktree-issue116` branch (where research/plan files commit), then implementation can dual-track between the two worktrees if needed.
- **PR must be normal, not draft**.
- **Commit style**: `feat(m{N}): ...` / `fix(m{N}): ...`. Phase 4+ M5-ish — mark as `feat(m5):` for duck mode + `feat(m5):` (or `fix(m5):`) for hook UX. Will confirm in plan.
- **Verification 1+2+3 gate** is mandatory pre-merge. Must name MODULE under test — likely `pnpm teamagent stats --duck` (V2 anchor) and `pnpm teamagent intercept-explain --help` (synthetic dry-run for hook prompt format).
- **POSTPR loop** mandatory after PR opens. Plan must include a POSTPR placeholder.

## 7. Open architectural questions for the plan

1. **Per-callsite vs global stream filter for duck-mode**:
   - (a) Helper `duckifyLine(text, opts)` invoked at every jargon-emit site (clean but high diff surface).
   - (b) Wrap `process.stdout.write` / `process.stderr.write` once at CLI entry to scan for known terms (low diff but risky for hook protocol I/O).
   - Plan recommends (a) with a centralized `JARGON_TABLE` constant.

2. **Where the `wrong_pattern` whitelist lives**:
   - (a) Code-side: `keyword-matcher.ts` adds a hardcoded `META_COMMANDS` array (skip when command starts with `gh issue`, `gh pr`, `git commit -m`, etc.).
   - (b) Schema-side: rule.knowledge-entry adds optional `meta_command_exempt: string[]` per-rule.
   - (c) Both: code default whitelist + per-rule extension.
   - Plan recommends (a) for the false-positive fix scope; (b) is a follow-up if ever needed.

3. **Hook block first-line format**:
   - Proposal: `⚠️ TeamAgent 拦了一下 — 你刚才在做 X，建议改成 Y。详情见折叠区。` 第二行 `复制即可: <suggested command>`. Confidence/trigger count/rule-id moved into a single `[i] details: conf=0.90 hit=0 1d ago rule-id=R-123` line at the bottom (or behind a `--verbose` reveal).
   - Decision: keep a single-line details suffix (terminals don't have folding) instead of true折叠区. Plan owns the final spec.

4. **Screenshot capture method**:
   - Real-machine capture with redaction script vs synthetic terminal-simulator screenshots (e.g., asciinema → SVG).
   - Plan recommends asciinema-based reproducible captures so re-runs are easy and redaction is automatic.

5. **Codex review repeatedly bounces this kind of PR for unchecked direct stderr output** (M4-A pattern). Plan must call out AttributionBus alignment or explicit punt with rationale.

## 8. Probes to run before coding (FASTPROBE preview)

These are listed here so the plan section ④ can reference them. Do not run during research — only before coding.

- `!claudefast -h | head -80` — orient on current flag set.
- `!claudefast -p "List every file under packages/ that calls process.stderr.write or process.stdout.write directly. Only return file paths and line numbers. Don't read whole files."` — confirm exhaustive jargon-emit sites for duck-mode coverage.
- `!claudefast -p "Read packages/core/src/matcher/legacy/keyword-matcher.ts and tell me whether the pattern matching ever inspects the original Bash tool_name argv structure (subcommand-aware), or only the concatenated haystack. Quote line numbers."` — confirm matcher false-positive root.
- `!claudefast -p "Search README.md and all docs/screenshots*.md or docs/SCREENSHOTS.md for any prior screenshot embed conventions. Tell me if screenshot dimensions, dark/light mode, or alt-text rules are already standardized."` — README screenshot prior art.
- `!claudefast -p "Read docs/feature-verification.md and tell me the canonical JSON schema expected from {MODULE} --help. List the required fields and ordering."` — feature-verification 1+2+3 schema.
- (audit-grade) stream-json wrap of the matcher false-positive probe — output piped into `.fastprobe/matcher-fp.debug.log` for evidence.

## 9. Risks and dependencies

- **Risk: legacy matcher haystack concatenation order changes break tests.** Mitigated by adding new test cases that explicitly target false-positive patterns (`gh issue create --body`).
- **Risk: duck-mode env flag name conflicts with future opt-in flags.** Plan picks one canonical name (`TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=1` + CLI `--explain-like-ceo-duck`) and documents.
- **Risk: README screenshots leak path / token / hostname.** Plan mandates redaction script + manual diff before commit.
- **Dependency: #84 (landing page) and #85 (onboarding)** may overlap with #86 README rework. Plan stays scoped to the screenshot section only and explicitly flags #84/#85 as follow-up coordination.
- **Dependency: AttributionBus migration** for hook stderr output. Plan likely defers to follow-up unless trivially in-scope.

## 10. Source links and timestamps

- Issue #116 fetched: 2026-05-07 via `gh issue view 116`.
- Issue #86 fetched: 2026-05-07 via `gh issue view 86`.
- Code map produced from three parallel Explore agent runs on 2026-05-07. All cited line numbers are valid as of branch `worktree-issue116` HEAD `866cb9a` (main).
- Companion plan: `docs/plans/2026-05-07-duck-mode-and-hook-ux-plan.md`.
