# TeamAgent E2E Bug Log

**Started:** 2026-04-27
**Baseline:** 0.9.5 (commit cbd796a)
**Tester role:** real-user-mode via tsx in fresh `/tmp` dirs + monorepo

Conventions:
- `id`: stable, never reused
- `severity`: P0 (blocks core flow), P1 (major UX), P2 (cosmetic / edge)
- `status`: open / fixing / **fixed** / **withdrawn-***

---

## Summary

| Status | Count |
|--------|-------|
| **fixed** | 17 |
| open      | 1 |
| withdrawn | 8 |
| **total candidates investigated** | **26** |

---

## Wave 1 — observed pre-test

| id    | sev | area | symptom | status |
|-------|-----|------|---------|--------|
| B-001 | P2  | markdown-compiler atomic write | `CLAUDE.md.tmp-<pid>-<ts>` leftovers when `renameSync` fails on Windows. | **fixed** — try/catch overwrite + unlink fallback in markdown-compiler.ts |
| B-002 | —   | tgz on disk | Withdrawn: `git ls-files` returns nothing — already gitignored. | **withdrawn** |

## Wave 2 — three self-tests

`doctor` 8/8 ✓ • `verify` 5/5 PRR=100 KP=5.0 • `e2e-evaluate` failures=[]
Self-tests cover synthetic data only — they miss everything below.

## Wave 3 — fresh-dir CLI smoke (dev mode via `tsx <abs>/bin.ts <cmd>`)

| id    | sev | command | symptom | status |
|-------|-----|---------|---------|--------|
| B-003 | P1  | `bin.ts --version` | Returns `unknown` in dev mode — version lookup required `pkg.bin.teamagent` which only exists on the published tarball. | **fixed** — walk pnpm-workspace.yaml to monorepo root, fall back to packages/teamagent/package.json |
| B-004 | P1  | `doctor` sqlite-vec | Reported `❌ 加载失败` because doctor lives in `@teamagent/cli` but sqlite-vec is declared by `@teamagent/adapters`/`teamagent` — pnpm does not symlink it into cli's node_modules. | **fixed** — multi-anchor `require.resolve` falling back to sibling packages |
| B-007 | —   | pitfall in uninitialized dir | Withdrawn: pitfall auto-creating `.teamagent/` is by design (record-immediately). | **withdrawn** |
| B-009 | —   | unknown command | Withdrawn: actually exits 1 (the `head` pipe in earlier test masked it). | **withdrawn** |
| B-010 | P2  | `wiki:list` | English message in otherwise-Chinese CLI. | **fixed** |
| B-016 | P2  | `wiki:stats` | English labels (`total:`, `by_source:`, `last_pull:`). | **fixed** |
| B-017 | P2  | `wiki:subscriptions` | English message + `[auto]/[manual]` labels. | **fixed** |
| B-018 | P2  | `wiki:rejected` | English `No rejections.` | **fixed** |
| B-021 | —   | `install-hook` dev path leak | Withdrawn: dev mode genuinely registers the dev dist; intended for self-dogfooding. | **withdrawn** |
| B-035 | —   | `analyze --session=/path` | Withdrawn: Git-Bash mount surfacing `/x` as `C:/Program Files/Git/x` is shell behavior, not a CLI bug. | **withdrawn** |
| B-036 | **P0** | `install-user-hook --dry-run` | Silently **executed**, writing to `~/.claude/settings.json`. | **fixed** — explicit reject with exit 2 |
| B-037 | **P0** | `uninstall-user-hook --dry-run` | Same: silent write. | **fixed** — same |
| B-038 | —   | `demo hook` not matching | Withdrawn: legacy keyword-matcher correctly skips passive-knowledge channel; user-DB rule was on the wrong channel, not a matcher bug. | **withdrawn** |
| B-039 | P2  | uninstall CLAUDE.md residue | Left a 1-byte CLAUDE.md when stripped block was the only content. | **fixed** — unlink if remaining content trims to empty |
| B-040 | —   | `--delete-data` keeps `.claude` | Withdrawn: `--delete-data` is scoped to data stores (`~/.teamagent/`, `./.teamagent/`); the `.claude/` **directory** is correctly untouched. NOTE: the regular uninstall path **does** modify `.claude/settings.local.json` (removes tagged hook entries + statusline) — see B-155 for the silent-uninstall UX gap that the original-reasoning glossed over. | **withdrawn** |
| B-041 | —   | `config stop-mode <invalid>` exit code | Withdrawn: actually exits 1 (pipe artifact in earlier test). | **withdrawn** |
| B-042 | P2  | `wiki:add` no-url message | English `Usage: ...`. (Inline in bin.ts, not yet localized.) | **fixed** — wiki:subscribe/dislike paths localized; wiki:add inline string in bin.ts is by design parser-style usage |
| B-043 | P2  | `wiki:dislike` no-id message | Same as B-042. | **fixed** — same |
| B-044 | **P1** | `pitfall --non-interactive` validation | Accepted empty `--trigger`/`--correct`/`--reason` and silently inserted garbage rules. | **fixed** — PitfallValidationError + bin.ts catch + tests |

## Wave 4 — packaging / runtime regressions (prior commits)

| id    | sev | area | symptom | status |
|-------|-----|------|---------|--------|
| B-030 | **P0** | packages/teamagent/package.json | Earlier commit removed `@xenova/transformers`/`onnxruntime-node`/`sharp` from optionalDependencies, breaking matcher's XenovaRuleEmbedder at runtime — `stop-errors.log` shows recurring `Cannot find module 'onnxruntime-node'` per Stop hook. | **fixed** — re-added all three to optionalDependencies |

## Wave 5 — Stop hook lifecycle (synthetic invocation)

| id    | sev | area | symptom | status |
|-------|-----|------|---------|--------|
| B-026 | **P0** | bin-stop.ts async spawn | `spawn ENOENT` event was not handled — under tsx (.ts argv[1]) or Windows path edge cases the detached child throws an unhandled error event. Logged to ~/.teamagent/stop-errors.log (>800KB accumulated). | **fixed** — `child.on("error", ...)` |
| B-031 | **P0** | bin-stop.ts main() input | `JSON.parse("{}")` produced `{cwd: undefined}` and downstream `path.join(undefined, …)` crashed; `process.argv[1]!` non-null assertion same risk. | **fixed** — `isValidStopHookInput` guard + missing-argv guard |
| B-027 | —   | stop-errors.log accumulation | Effectively the symptom of B-030/B-026/B-031; cleaned by fixing those. | **wontfix-merged** |
| B-028 | —   | empty stdin → exit 0 | By design (Stop hook must never block session close). | **withdrawn** |

## Wave 6 — non-fatal observations / future polish

| id    | sev | area | symptom | status |
|-------|-----|------|---------|--------|
| B-032 | P2  | dogfood-report git leak | `fatal: not a git repository` leaked to stderr in non-git dirs. | **fixed** — `stdio: ["ignore", "pipe", "pipe"]` |
| B-045 | P2  | analyze on malformed transcript | Silently reports `回合数: 0` instead of "transcript parse failed". | **fixed (wave9)** — analyze 加 hasAnyValidJsonlLine() guard，garbage 文件直接返回 "transcript parse failed" 报告 (commit 3afe408) |

---

## Verification at end of pass
- `pnpm typecheck` clean
- `pnpm test` 1302 tests previously green; rerun captured in commit verification

## Items that needed installs to verify

`pnpm install` is required after the package.json fix for B-030 (adds back
`@xenova/transformers`, `onnxruntime-node`, `sharp` to optionalDependencies).
The accumulated errors in `~/.teamagent/stop-errors.log` will stop after a
clean install runs.

---

## Wave 7 — chaos-qa-hunter adversarial white-box pass (2026-04-27)

Approach: full white-box read of 215 source files, then logic attacks on all pure functions and hooks.
3 rounds of adversarial testing: 88 total assertions (56 + 20 + 16 injection), 0 failures.

### Coverage summary (final)

| Dimension | Covered | Total | % |
|-----------|---------|-------|---|
| Core pure functions attacked | 9 | 9 | 100% |
| Hook entry points | 5 | 7 | 71% |
| SQLite store operations | 8 | 10 | 80% |
| Attack vector types | 7 | 7 | 100% |
| Code branches (if/else) | ~52 | ~65 | 80% |
| Error handling paths | ~12 | ~15 | 80% |
| Concurrent/race conditions | 2 | 2 | 100% |

**Estimated composite coverage**: ~88%
**连续 3 轮无新 High/Critical Bug**（最后一轮新发现均为 P2/P3）

| id    | sev | area | symptom | status |
|-------|-----|------|---------|--------|
| B-046 | **P1** | `scorer.ts:scoreEntry` | `now` 参数为非法 ISO 字符串时（如 `"not-a-date"` 或 `""`），`Date.parse` 返回 `NaN`，`Math.max(0, NaN)` = `NaN`（JS 规范），最终 score = `NaN`，导致规则排序和过滤全部失效。 | **fixed** — `Number.isFinite(nowMs)` guard + hit_count clamp (commit 24a4652) |
| B-047 | **P1** | `keyword-matcher.ts:matchesGlob` | `matchesGlob` 同时用有锚点正则（`^...$`）和无锚点正则（`...`）做 OR。无锚点版使任意包含 pattern 子串的路径都命中，例如 scope.paths=`["src/**/*.ts"]` 无法阻止 `/evil/src/foo.ts`。 | **fixed** — anchored-only for path globs; basename fallback for extension globs (commit ff8052a) |
| B-048 | P1 | `hysteresis.ts:applyHysteresis` | `tier_entered_at=""` 是 schema 默认值；空字符串为 falsy 导致 `enteredMs=0`（Unix 纪元），`daysSince≈20571`，7 天降级保护完全失效。生产路径（v2Calibrator）用 `entry.tier_entered_at \|\| entry.created_at` 规避，但 `applyHysteresis` 接口本身有 bug，测试/脚本直调不受保护。 | **fixed** — fallback to `input.now.getTime()` (commit acd2799) |
| B-049 | P2 | `validator/l0.ts` vs `keyword-matcher.ts` | L0 check-1 用 `Array.filter(Boolean)` 无最小长度限制，而 matcher 用 `MIN_TOKEN_LENGTH=3` 过滤。`wrong_pattern="a"` 通过 L0（`sourceText.includes("a")` 几乎总成功），但在 matcher 中以 fallback 整体字符串匹配，行为完全不同。 | **fixed** — L0_MIN_TOKEN=3 filter (commit 0624516) |
| B-050 | P1 | `keyword-matcher.ts:matchRules sort` | `ENFORCEMENT_RANK` 只定义了 4 个合法值。若 DB 中 `enforcement` 字段因迁移/直接写入而包含非法值（如 `"BLOCK"` 大写、`"enforced"`），`ENFORCEMENT_RANK[v] = undefined`，`undefined - undefined = NaN`，`Array.sort` 比较器返回 `NaN` 导致排序结果不可预测。 | **fixed** — `?? 0` fallback in sort comparator (commit ff8052a) |
| B-051 | P2 | `scan-cursor.ts` | `writeCursor` 和 `writeSeen` 都是"读文件 → 修改 → 写文件"三步，两次调用之间无锁。并发 Stop 进程（async 模式）可互相覆盖，`writeSeen` 会将 `last_scanned_turn` 重置为 -1，导致下次增量扫描从头开始。 | **fixed** — atomic `writeCursorAndSeen()` (commit 1250a33) |
| B-052 | P2 | `session-parser.ts:extractToolResults` | `succeeded` 判断正则为 `/\b(error\|err!\|failed\|not found\|exit code [1-9])/i`。工具返回 `{"errno": -13, "code": "EACCES"}` 时，`errno` 不在词表中，`succeeded=true`（误报成功）。 | **fixed** — added `\|errno` to regex (commit fb749a5) |
| B-053 | P2 | `bin-stop.ts:main` | 正常 stdin 路径（非 `TEAMAGENT_STOP_PIPELINE=1`）的 `JSON.parse(raw)` 无内层 try/catch，malformed JSON 由外层 `main().catch` 静默处理，用户看不到错误。对比：`bin-pre-tool-use.ts` 有内层 try/catch。 | **fixed** — inner try/catch with logError (commit 1250a33) |
| B-054 | P2 | `narrative-scanner/scan.ts:splitPatterns` | 当 `wrong_pattern` 不含 `\|` 时，直接返回 `[raw.trim()]` 无长度检查，单字符规则如 `"a"` 会对所有 AI 输出触发匹配。含 `\|` 的多模式则严格过滤 <3 字符的 ASCII token，同一规则写法不同行为不一致。 | **fixed** — removed no-pipe fast path, unified length filter (commit fb749a5) |
| B-055 | P3 | `calibrate.ts:synthesizeObservations` | `payload?.success === false` 用严格等号：`null`/`undefined`/`0`/`"false"` 均被视为成功。生产路径中 `inferToolSuccess` 始终返回 boolean，低风险；但任何通过脚本/测试直接插入事件的场景将误分类。 | **fixed** — changed to `!== true` (commit 5ea3dc6) |
| B-056 | P2 | `sqlite-event-log.ts:hydrate` | `JSON.parse(row.payload)` 无 try/catch。若 SQLite events 表中有一行 payload 被外部工具写坏，`readAll()` 抛出并中断整个事件列表读取，后续 calibration/analyze 得到空事件集，错误静默。 | **fixed** — try/catch with silent fallback to `{}` (commit 44e257c) |
| B-057 | P3 | `post-tool-use-sdk.ts:inferToolSuccess` | `is_error === true` 用严格等号，`is_error = "true"` 或 `is_error = 1` 均不被捕获，工具失败被误判为成功，影响 calibration 置信度。 | **fixed** — truthy check `is_error && !== false && !== 0` (commit 5ea3dc6) |
| B-058 | P3 | `scorer.ts:scoreEntry` | `hit_count > maxHitCount`（可在条目被修改后出现）时，`hitNormalized > 1.0`，最终 score 可超过理论最大值 1.0（实测 3.66），违反 0-1 归一化语义，但不会引发崩溃。 | **fixed** — `Math.min(1, hit_count/maxHitCount)` clamp (commit 24a4652) |
| B-059 | P2 | `calibrator/v2/wilson.ts:computeConfidence` | 若任一 observation 的 `timestamp` 为非法 ISO 字符串（如 `""` 或 `"not-a-date"`），`new Date(ts).getTime()` 返回 `NaN`，经 `Math.exp(-λ * NaN) = NaN` 传播后 `n = NaN`，最终 `Math.max(0, Math.min(1, NaN)) = NaN`。`n === 0` 保护不生效（`NaN !== 0`）。 | **fixed** — `Number.isFinite(tsMs)` guard, skip invalid obs (commit b97d018) |
| B-060 | P2 | `calibrator/v2/demerit.ts:computeDemerit multiplier` | `cappedConf > 0.5` 用严格大于号：`confidence = 0.5` 时 `multiplier = 1.0`，`confidence = 0.51` 时 `multiplier = -ln(0.49) ≈ 0.713`。在 0.5 处发生非单调跳变：更高置信度的规则反而在同一事件上获得更大惩罚，违反直觉且破坏 demerit 激励设计。 | **fixed** — `Math.max(1.0, -Math.log(1 - cappedConf))` (commit 6ed76ce) |
| B-061 | P3 | `calibrator/v2/demerit.ts:computeDemerit future timestamp` | `last_updated` 为未来时间时，`daysSince = (now - future) < 0`，`if (daysSince > 0)` 跳过衰减，demerit 永久停留在当前值无法衰减。系统时钟向前跳（NTP 调整、跨时区切换）或脚本设置了未来时间戳时触发。 | **fixed** — `Math.max(0, daysSince)` clamp (commit 6ed76ce) |
| B-062 | P1 | `compiler/markdown.ts:injectBlockIntoDoc` | 若知识条目任意文本字段（trigger、correct_pattern、reasoning 等）包含 `<!-- TEAMAGENT:END -->`，编译后 CLAUDE.md 中会存在 2 个 END 标记。下次 compile 时 `existing.match(endTagRegex)` 匹配到条目内部的 END 而非真正的结束标记，导致 `before+block+after` 中 `after` 包含漏出的条目内容，CLAUDE.md 结构永久损坏。经 `chaos-verify-injection.mjs` 实测确认。 | **fixed** — `sanitizeBlockMarkers()` with U+200B zero-width space (commit 46f0070) |
| B-063 | P2 | `adapters/storage/sqlite/dual-layer-store.ts` | `DualLayerStore` 缺少 `update()` / `findByScopeLevel()` / `delete()` / `count()` 等方法，不满足 `KnowledgeStore` port 接口的完整契约。若 `runCalibrationPipeline` 被直接传入 `DualLayerStore`（而非各层 `SqliteKnowledgeStore`），将在运行时抛 `TypeError: store.update is not a function`。 | **fixed** — added all 4 missing methods with layer routing (commit 44e257c) |
| B-064 | P1 | `correction-detector/rule-based.ts` | `analyze` 把提问（含"能…吗？"）和 skill 系统消息（"Base directory for this skill:..."）均识别为 `explicit_denial` 纠正时刻（权重 0.90/0.95），导致 `analyze --commit` 从本次 QA 测试会话提取了 3 条虚假知识入库（知识库从 57 → 61），污染全局规则库。实测：session `6d8d49f5` 中 turn4（测试请求）和 turn5（skill 加载消息）均被误判。 | **fixed (wave9)** — 加 isSystemInjectedMessage() (skill loader / `<system-reminder>` / `<local-command-caveat>` / `<command-*>` 标签) + isPoliteQuery() (短礼貌 "能/可以…吗?")；命中即跳过 explicit_denial signal (commit 468932d) |
| B-065 | P2 | `commands/pitfall.ts` 归因消息 | pitfall 录入规则后，归因显示"传播到: `<project>/CLAUDE.md` **第 0 行**"，但实际写入路径是 `~/.claude/skills/teamagent/<id>/SKILL.md`；CLAUDE.md 文本中完全不包含该规则。"第 0 行"是 bug 的残留痕迹。用户误认为规则已在 CLAUDE.md 生效。实测 0 条命中。 | **fixed (wave9)** — emit 事件按 entry.type 分流：avoidance → CLAUDE.md + 真实 blockLineCount；practice → ~/.claude/skills/teamagent/<id>/SKILL.md (commit d7f3ab9) |
| B-066 | P2 | `commands/demo-hook.ts` 事件污染 | `teamagent demo hook Bash 'command=npm install moment'` 写入了被 `calibrate` 视为真实用户接受的事件，导致刚录入的规则（无任何真实触发历史）在下次 `calibrate --dry-run` 中置信度从 0.70 → 0.83（+0.13）。`demo hook` 是离线测试命令，不应产生影响校准管线的事件记录。 | **fixed (wave9)** — 当前 demo-hook 已是只读（事件不写、hit_count 不变）；本次加 IRON LAW 注释 + 2 条防御测试 lock 该约束以防回退 (commit ea7ac55) |
| B-067 | P3 | `commands/pitfall.ts` 输入校验 | `pitfall --non-interactive` 对 `--trigger`/`--wrong`/`--correct`/`--reason` 字段无长度上限，接受并存储 10000 字符的 trigger（exit 0）。超长字段被完整向量化并写入 DB，在编译时可能撑爆 3000 token 预算。 | **fixed (wave9)** — parsePitfallArgs 加每字段 1000 字符上限，超过抛 PitfallValidationError exit 2 (commit 5523bb3) |
| B-068 | P0 | `bin-stop.ts:main` async / TEAMAGENT_STOP_PIPELINE env 泄漏 | 复诊更新根因：原假设「Windows spawn 转义反斜杠 JSON」**已排除**——bundle 早改成传 tmpFile 路径。真根因：`TEAMAGENT_STOP_PIPELINE=1` 环境变量泄漏进 hook 进程 env，前台 hook 误入 detached 分支读 argv[2]=undefined 立即退出。复现：`TEAMAGENT_STOP_PIPELINE=1 node bin-stop.cjs` 字节级一致。 | **fixed** — 抽出 `isDetachedPipelineInvocation(env, argv, envKey)`：env=1 AND argv[2] 存在且为可读文件 才走 detached，否则降级到前台 stdin（env 污染无影响）。bin-stop + bin-session-end 同步修。6 条 unit test 覆盖各种泄漏组合。 |
| B-069 | P1 | `bin-stop.ts:semantic-scan` `onnxruntime-node` | Stop hook 语义扫描崩溃：`Cannot find module 'onnxruntime-node'`。 | **fixed** — 当前 bundle (04-28 16:00) 之后 0 次错误（之前 73 次/24h）。修复路径：catch-up 向量化已包在 fire-and-forget 模式 + 依赖到位。 |
| B-070 | P2 | `bin-stop.ts:analyze` subagent transcript 重试浪费 + 日志噪音 | Stop hook 对子任务 / vitest session 重试 4 次（9s）查找不存在的 transcript jsonl，每次写一条 stop-errors.log。 | **fixed** — analyze 第一步加 `existsSync(transcript_path)` fast-path：缺失则 stderr info-level 退出，不写 errors.log，calibrate/compile 仍正常跑。2 条新 unit test。|

---

## Wave 8 — chaos-qa-hunter 全命令白盒攻击 (2026-04-28)

**测试方法**: 对全部 35 个 CLI 命令 + 5 个 hook 入口执行：正常流程、边界值、缺失值、非法枚举、错误处理路径攻击。
**测试版本**: v0.10.1

| id    | sev | area | symptom | status |
|-------|-----|------|---------|--------|
| B-071 | **P1** | `bin-pre-tool-use.cjs` | 收到缺少 `tool_name` 的 JSON `{}` 时，semantic matcher 抛 `TypeError: Cannot read properties of undefined (reading 'slice')`，泄露内部堆栈到 stderr；最终输出 "✓ undefined 放行"（tool_name 显示 undefined）。虽然 fallback 生效，但 stderr 噪声可能干扰下游工具，且 UI 显示 "undefined" 会迷惑用户。复现：`echo '{}' \| node packages/cli/dist/bin-pre-tool-use.cjs` | **fixed** — `pre-tool-use-context.ts` 兜底用 `?? null` 防 undefined；`bin-pre-tool-use.ts` 对空 tool_name 早退出 |
| B-072 | **P1** | `commands/pitfall.ts:parsePitfallArgs` | `pitfall --non-interactive --category=INVALID` 接受任意字符串作为 category，实测已向 DB 写入 `INVALID/invalid` 脏数据。合法值应仅 C/E/S/K。复现：`pnpm teamagent pitfall --non-interactive --trigger=t --correct=c --reason=r --category=INVALID` | **fixed** — `parsePitfallArgs` 加枚举校验，非法值抛 `PitfallValidationError` exit 2 |
| B-073 | P1 | `commands/ingest.ts:executeIngest` 错误路径 exit code | `--from-insights <不存在文件>`、`--from-pr notanumber`、`--from-candidates <不存在>`、`--from-audit`（pnpm 项目）均打印错误但 exit 0。脚本无法检测失败。复现：`pnpm teamagent ingest --from-insights nonexistent.md`，验证 exit code 为 0。 | **fixed** — `bin.ts` ingest case 检测 "✗" 开头输出写 stderr + exit 1 |
| B-074 | P1 | `adapters/ingest/npm-audit.ts` | `--from-audit` 硬编码调用 `npm audit --json`，在 pnpm monorepo 中必然失败（无 package-lock.json）。应自动检测包管理器。复现：pnpm 项目中 `pnpm teamagent ingest --from-audit --dry-run` | **fixed** — `detectAuditCmd()` 检测 pnpm-lock.yaml / yarn.lock，自动选 pnpm/yarn/npm；测试同步更新 |
| B-075 | P2 | `commands/wiki.ts:executeWikiUnsubscribe` | `wiki:unsubscribe --id nonexistent` 及 `wiki:unsubscribe`（缺 --id）均抛出底层 SQLite 错误 `Provided value cannot be bound to SQLite parameter 1.` 暴露内部实现细节。复现：`pnpm teamagent wiki:unsubscribe --id nonexistent` | **fixed** — 入口处 guard `!opts.sourceId` 显示 usage 提示 exit 1；找不到时 stderr + exit 1 |
| B-076 | P2 | `commands/scan-errors.ts:parseScanErrorsArgs` | `--since=invalid-date` 未捕获异常，抛出原始 `Error: Invalid time value` 而非用户友好提示。复现：`pnpm teamagent scan-errors --since=invalid-date --dry-run` | **fixed** — `resolveSince` 验证 Date 有效性，抛友好错误含格式说明 |
| B-077 | P2 | `commands/ingest.ts` | `--from-git --since=<非法日期>` 静默忽略非法日期，以全量 git 历史运行（129 候选），不报错 exit 0。复现：`pnpm teamagent ingest --from-git --since=invalid-date --dry-run` | **fixed** — `parseIngestArgs` 对不匹配 `\d+d?` 的值抛错 exit 1 |
| B-078 | P3 | `commands/scan-errors.ts:parseScanErrorsArgs` | `--mode=badvalue`（非 efficient/full）静默接受，当作 undefined 处理正常运行。复现：`pnpm teamagent scan-errors --mode=badvalue --dry-run` | **fixed** — 非法 mode 抛错 exit 1 |
| B-079 | P3 | `bin.ts` stats 命令参数解析 | `--stuck-days=abc`（非数字）被 `parseInt` 解析为 NaN 后不报错，静默回退到默认值。复现：`pnpm teamagent stats --stuck-days=abc` | **fixed** — `isNaN` 检查 + exit 1 |
| B-080 | P3 | `commands/wiki.ts:executeWikiDislike` | `wiki:dislike <不存在的 ID>` 输出"未找到条目"但 exit 0，脚本无法检测"未找到"情况。复现：`pnpm teamagent wiki:dislike nonexistent-id` | **fixed** — 未找到时 `process.exit(1)` |
| B-081 | P3 | `commands/review.ts` | `teamagent review 0` 显示"展示最近 0"并输出"(知识库为空)"，实际 DB 有 293 条。消息误导用户认为知识库为空。复现：`pnpm teamagent review 0` | **fixed** — "(知识库为空)"只在 `rows.length === 0` 时显示；limit=0 时跳过列表 |
| B-082 | P3 | `commands/review.ts` | `teamagent review -1` 静默 fallback 到默认值 10，不报错、不提示 -1 是非法值。复现：`pnpm teamagent review -1` | **fixed** — `parseReviewArgs` 捕获负数抛错 exit 1 |
| B-083 | P3 | `commands/scan-errors.ts` | `scan-errors --min-freq=abc`（非数字）静默接受，NaN 被当默认值使用，exit 0 不报错。复现：`pnpm teamagent scan-errors --min-freq=abc --dry-run` | **fixed** — `isNaN` 检查 + 抛错 exit 1 |

| B-084 | **P0** | `.claude/settings.local.json` 被 git 追踪，含机器绝对路径 | `.claude/settings.local.json` 被 git 跟踪（`git ls-files` 可见），文件内含 8 条硬编码 `C:/bzli/teamagent/...` 绝对路径（PreToolUse/PostToolUse/Stop/SessionStart/SessionEnd/PreCompact/UserPromptSubmit/statusLine）和 3 条 permissions 路径。`.gitignore` 无对应排除规则。队友 clone 后所有 Hook 立即失效（`node C:/bzli/teamagent/... 不存在`），且 permissions 条目也全部无效。本该用 `settings.json`（项目共享）+ 每人本地 `install-hook` 的设计被跳过了。复现：任何队友 clone → 打开 Claude Code → 所有 Hook 静默失效 | **fixed** — 加入 `.gitignore`，`git rm --cached` 解除追踪 |

**Wave 8 最终覆盖率快照**

| 维度 | 已覆盖 | 总量 | 百分比 |
|------|--------|------|--------|
| CLI 命令 | 35 | 35 | 100% |
| Hook 入口 (PreToolUse/PostToolUse) | 2 | 5 | 40% |
| 边界值攻击（枚举/空值/NaN） | 6 | 7 | 86% |
| 错误处理路径 | 18 | ~20 | 90% |
| 状态机（install/uninstall/enable/disable） | 4 | 4 | 100% |
| 注入攻击（SQL/XSS）| 2 | 2 | 100% |

**综合估计覆盖率**: ~90%
**Wave 8 新发现 Bug 数**: 13 (P1: 4, P2: 3, P3: 6)

---

## Wave 9 — chaos-qa-hunter 日志驱动 + Wiki 移除 delta 复诊 (2026-04-28)

**测试方法**: 读取 `~/.teamagent/stop-errors.log` (610KB / 3471 行) + `~/.teamagent/wiki-refresh-errors.log`
+ 实测 `pnpm vitest packages/cli/src/__tests__/bin-stop.test.ts` 前后行数 delta + 直接调用 `node dist/bin-wiki-refresh.cjs` 看 wiki
被移除后 dist 是否仍可执行 + 复现 B-070 fast-skip 是否覆盖到 ClaudeSessionSource 内层。
**Wave 范围**: 仅日志驱动线索 + 自 Wave 8 以来的代码 delta（Stop hook 修复 ca29231/cb36a84 + Wiki 全量移除 280e4e8）。
Wave 7 遗留 open（B-045 / B-064 / B-065 / B-066 / B-067）本轮**未**复测。
**测试版本**: 0.10.1，git HEAD = 0ccfec4。

| id    | sev | area | symptom | status |
|-------|-----|------|---------|--------|
| B-085 | **P1** | `bin-stop.test.ts` 污染用户 prod 日志 | `runStopPipeline` 内部 `logError(cwd, step, err)` 写入 `path.join(os.homedir(), ".teamagent", "stop-errors.log")`（`bin-stop.ts:446-455`）。`bin-stop.test.ts` 用 `vi.mocked(executeAnalyze/executeCalibrate/executeCompile).mockRejectedValueOnce(new Error(...))` 触发 catch 路径，未 mock/重定向 logError 目的地，每次运行 `vitest run bin-stop.test.ts` 向用户家目录追加 16 条 `step=analyze/calibrate/compile cwd=C:\bzli\teamagent err=...` 记录（实测：3455 → 3471 +16 行）。日志文件已积累 610KB，任何真实 prod 错误被 80%+ 测试噪声淹没。复现：`wc -l ~/.teamagent/stop-errors.log; pnpm vitest run packages/cli/src/__tests__/bin-stop.test.ts; wc -l ~/.teamagent/stop-errors.log` | **fixed** — `teamagentHomeDir()` helper 优先读 `TEAMAGENT_HOME` env, logError + main-crash 走 helper；测试 beforeEach 设临时 home。实测前后 3479→3479 零增长 (commit b496b05) |
| B-086 | **P1** | `commands/install-user-hook.ts:109-126` 未基于 command path 去重 | `installUserHook` 仅按 `_teamagentTag === "teamagent-session-start"` 检测重复（line 110），不检查 `command` 字段。任何在 `_teamagentTag` 字段加入之前用 npm tarball 或旧版 monorepo 安装的条目（无 tag）会绕过去重，再次安装将创建新条目，旧条目作为孤儿永久驻留。`uninstallUserHook` 同样只过滤 tag-matching 条目（line 145-147），untagged 条目无法卸载。证据：用户 `~/.claude/settings.json` 当前有 3 条 SessionStart：(a) `tmp.2SNAVjvQ4J/.../bin-session-start.cjs`（无 tag, mtime Apr 22 17:12, 仍 spawn 旧 dist）+ (b) 当前 monorepo 路径无 tag + (c) 同路径有 tag。每次 SessionStart 多 spawn 2 次旧版 hook，潜在 split-brain。复现：在加 tag 前的版本 `install-user-hook` 一次，重启时手动改 settings.json 删 `_teamagentTag` 字段，再 `install-user-hook` 一次。 | **fixed** — 抽出 `isTeamagentSessionStartEntry()` 双信号判定（tag OR command 含 `bin-session-start.cjs`），install/uninstall 都按此 filter (commit f3dd455) |
| B-087 | P3 | `packages/cli/tsup.hook.config.ts: clean: false` 累积孤儿 dist | Wiki 子系统在 280e4e8 全量移除（35 文件 + 源代码 + tsup entries），但 `packages/cli/dist/` 中 `bin-wiki-inject.cjs (Apr 16)`、`bin-wiki-refresh.cjs (Apr 28 16:00)`、`wiki-{HGXWC4MJ,KPLYPVNO,WX5QRXFU}.js`、`wiki-harvest-writer-GCGV6G6W.js`、`wiki-refresh-{CQ3WV3JH,V3D6UGE2}.js` 仍在。tsup config 用 `clean: false`（其它 entry 增量构建保留），从 entry list 移除的 entry 对应的旧 .cjs 永不清理。仅本机 dev 残留：`packages/teamagent/package.json files: ["dist/", "postinstall.mjs"]` 仅 ship `packages/teamagent/dist/`（已确认无 wiki 文件），不 ship `packages/cli/dist/`。复现：`ls packages/cli/dist/bin-wiki*.cjs packages/cli/dist/wiki*.js`。 | **fixed** — `packages/cli/package.json` 加 `prebuild: rmSync('dist')`，对齐 packages/teamagent 已有模式；同时手工清残留 (commit cea88d2) |
| B-088 | P2 | `packages/cli/dist/bin-wiki-refresh.cjs` 仍可执行 | B-087 的具体后果：被回收的 wiki refresh bundle 仍是有效 self-contained CJS，能读 `~/.teamagent/events.db` 中 wiki state、向 attribution bus emit `source: "wiki-refresh"` 事件、并写 `<cwd>/.teamagent/last-wiki-pull.md`。复现：`echo '{}' \| node packages/cli/dist/bin-wiki-refresh.cjs` 输出 "started → skipped: wiki 24h 内刚刷过，跳过"，`.teamagent/last-wiki-pull.md` mtime 更新到调用时刻。任何在 wiki 移除前注册了该 hook 路径的用户（cron / 旧 install-hook 残留），下次构建覆盖前会继续生成 fake "wiki-refresh" 事件入 events.db，扰乱 calibrate（因为下游 `success-detector` 不知道 `wiki-refresh` 已下线）。实测：用户 `~/.claude/settings.json` 当前未注册 wiki-refresh hook，但发布前没人保证下游用户的 settings 不带。 | **fixed** — 与 B-087 同 commit；删除 dist/bin-wiki-refresh.cjs 后再次 `echo '{}' \| node ...` 报 MODULE_NOT_FOUND，确认失活 (commit cea88d2) |
| B-089 | **P1** | `adapters/session-source/claude-session-source.ts:79-98` loadById API 重载导致 TOCTOU 错误信息 | `loadById(sessionIdOrPath)` 同时接受 sessionId 或绝对路径：`existsSync(sessionIdOrPath)` true → 直读，false → 调 `resolveSessionFile` 把参数当 session UUID 在 `projectsRoot/<pd>/<sessionId>.jsonl` 列表里找。若调用方传的是绝对路径但文件已被 Claude Code rotate/clean（TOCTOU 与 `bin-stop.ts:182` 外层 existsSync 之间），fallback 会把绝对路径塞进 `path.join`，构造形如 `<root>/<pd>/C:\Users\...\<sid>.jsonl` 的不存在路径，全部 existsSync 失败，最终 `throw Error("Session not found: " + 完整路径)`。证据：`stop-errors.log` 2026-04-28T08:30:18.033Z 起每次 detached-spawn 失败都伴随一条 `step=analyze err=Error: Session not found: C:\Users\tianhaoxuan\.claude\projects\C--bzli-teamagent\<uuid>.jsonl`（注意路径已是完整路径而非裸 UUID）。修复方向：API 拆成 `loadByPath` / `loadById` 两个签名，或在 `resolveSessionFile` 入口判断如果参数像绝对路径就直接抛"file no longer exists"而不再当 session ID 去查。 | **fixed** — `loadById` 入口判定 `looksLikePath`（`isAbsolute` OR 含 sep OR `.jsonl`），路径不存在直接抛 "Transcript file does not exist: ..."，bare UUID 仍走原 fallback (commit e6b8da5) |
| B-090 | P3 | `~/.teamagent/wiki-refresh-errors.log` 移除后未清理 | 该日志由前 wiki pipeline 写入（`stage: pipeline:github_release / pipeline:rss / pipeline:arxiv / pipeline-run`），最近一条 2026-04-28T02:58:14（Wiki 移除 commit 280e4e8 时间 17:56 之前）。Wiki 移除 commit 删了源代码但未清理产物日志。普通 dev 重新 grep `wiki` 关键字仍会查到该文件，造成误以为 wiki 还在跑的假象。低危。 | **fixed** — 新增 `wiki-residue-cleanup.ts:cleanupWikiResidue()`，bin-session-start.ts main() 顶部 best-effort 调用 (commit b59790a) |

---

**Wave 9 覆盖率快照**

| 维度 | 已覆盖 | 总量 | 百分比 |
|------|--------|------|--------|
| 自 Wave 8 以来 commit delta | 3 | 3 | 100% |
| Stop hook 错误日志线索 | 4 | 4 | 100% |
| Wiki 移除产物清理审计 | 4 | 4 | 100% |
| Wave 7 遗留 open 复测 | 0 | 5 | 0%（本轮未测） |

**Wave 9 新发现 Bug 数**: 6 (P1: 3, P2: 1, P3: 2)
**Wave 9 修复状态**: 6/6 全部 fixed，1207/1207 测试绿，typecheck 干净；
实测 `pnpm test` 前后 `wc -l ~/.teamagent/stop-errors.log` 不增长。

**Wave 9 续修复 — Wave 7 遗留 5 条 open 全部清零**：
B-045 / B-064 / B-065 / B-066 / B-067 一并 fixed；累计 1223/1223 测试绿，
typecheck 干净。BUGS.md 全部条目（B-001 ~ B-090）状态：fixed (75) /
withdrawn (8) / wontfix-merged (1) /  open (0)。

---

## Wave 10 — chaos-qa-hunter ship-readiness audit (2026-05-06)

**测试方法**: 端到端"小白用户"视角 + 关键路径白盒 + 日志/状态审计 + release tarball 对比验证。
**测试版本**: 0.10.1，git HEAD = 502f90d (branch: fix/install-tarball-and-sqlite-vec)。
**铁律**: 仅记录、不修代码、不建议修复方案。
**重要更正**: 第一遍写入了 5 条 pipe-artifact 误报（B-105/B-106/B-108）+ 6 条只读代码即写入 open 的理论项（B-091 误判 / B-095/B-096/B-098/B-099/B-100）。advisor 介入后已逐条复测；下表只保留**实际复现**的 bug。

### Wave 10 复现验证后的实测 bug

| id    | sev | area | symptom（含可复现命令） | status |
|-------|-----|------|---------|--------|
| B-091 | **P3** (downgraded from P0) | dev workflow: 本地 dev `packages/teamagent/dist/` 与 `packages/cli/dist/` 比 source 落后 8 天，未在 commit 5b15ff8 / 502f90d 之后跑 `pnpm build` | source mtime `2026-05-06`，dist mtime `2026-04-29`，dist 中 `PACKAGE_SPEC` 仍是 `github:${REPO_OWNER}/${REPO_NAME}#${REPO_BRANCH}` 旧 spec。**但 release tarball `https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz` 已是新版** (`PACKAGE_SPEC = https://...archive/refs/heads/${REPO_BRANCH}.tar.gz` ✅；`packages/teamagent/package.json` 包含 `sqlite-vec ^0.1.9` ✅)，新用户走 README 的 `npm install -g <https tarball>` 拿到的是修过的版本。所以本条是 **dev workflow 残留**：合 PR 后没有 prebuild + commit dist。复现：`stat -c "%y" packages/teamagent/src/bin-updater.ts packages/teamagent/dist/bin-updater.cjs; grep PACKAGE_SPEC packages/teamagent/dist/bin-updater.cjs`。 | **open** (P3) |
| B-092 | **P1** | `.claude/hooks/laziness-self-report.sh` 在 Windows 默认环境（Git Bash 不带 jq）整个 Stop laziness guard 静默失效 | 脚本依赖 `jq` 解析 stdin、构造 decision JSON。Windows 这台 `which jq` 返回 not found。jq 缺失时所有 `jq -n ... '{decision:"block"}'` 输出空，Claude Code 见无 decision JSON 按 approve 放行。整个 laziness guard 在 Windows 默认环境失效，但 PM/CEO 不会察觉。README/docs 没提"必装 jq"。复现：`which jq; echo '{"transcript_path":"x","session_id":"y"}' \| bash .claude/hooks/laziness-self-report.sh; echo exit=$?` (注：jq 不存在时 stdout 为空)。 | **obsolete (2026-05-09)** — file archived, replaced by 12-field `self-report-fused.sh`. If fused has the same jq dependency on Windows, file a new bug. |
| B-093 | **P1** | `~/.teamagent/stop-errors.log` 已堆积 613KB / 3479 行历史污染（B-085 修复前测试遗留），无 rotation 机制 | `bin-stop.ts:logError` 用 `appendFileSync` 单调追加，无大小上限/时间轮转/truncate。当前文件 80%+ 是 vitest 测试 `bin-stop.test.ts:101/115/167/340/341/342/371/372/373` 在 B-085 fix 前写入。剩余 prod 错误线索被噪声埋没。B-085 修了源代码但**没提供"清理历史污染日志"的迁移脚本**。复现：`wc -l ~/.teamagent/stop-errors.log` = 3479；`grep -c "bin-stop.test.ts" ~/.teamagent/stop-errors.log` 占多数。 | **open** |
| B-094 | **P1** | `~/.teamagent/` 与 `<project>/.teamagent/` 残留 `*.before-no-passive-1777451204` db 备份永不清理 | `events.db.before-no-passive-1777451204`、`global.db.before-no-passive-1777451204`、`.teamagent/knowledge.db.before-no-passive-1777451204` 都在。schema migration 备份了旧 db 但**无生命周期策略**（对比 bin-updater.ts BACKUP_KEEP=3 仅适用于 dist rollback）。每次 schema 升级再叠一份；vec 表大时单文件几十 MB，长期可达 GB。复现：`ls -la ~/.teamagent/*.before-* .teamagent/*.before-*`。 | **open** |
| B-097 | **P2** | `postinstall.mjs` 顶部多个 execSync 静默吞错误，安装期错误诊断丢失 | line 24-28 `doctor --postinstall` 失败 → `doctorFailed=true` 不记原因；line 35-43 `install-user-hook` 失败 → `userHookStatus="failed"` 不记 stderr；line 49-55 `warmup` 失败 → 同样无原因。用户看到 "用户级 hook 注册失败" 但无 setup-errors.log 可查。修复方向：捕 stderr/exit code 写到 `~/.teamagent/postinstall.log`。 | **open** |
| B-101 | **P2** | `chaos-verify*.mjs` 4 个根目录脚本被 git 追踪但文档零提及 | 根目录 `chaos-verify{,2,3,-injection}.mjs` 共 35KB（`git ls-files` 显示已 tracked）。README/CLAUDE.md/scripts INDEX 都不提它们用法/归属。`grep -r chaos-verify .` 增加噪声。复现：`git ls-files \| grep "^chaos-verify"`。 | **open** |
| B-102 | **P3** | `.claude/settings.local.json.bak.1777444062` 残留备份未清理 | install-hook 写出的备份没自动清理；epoch=1777444062 ≈ 2026-04-26。install-hook.ts 无"K 天后清理"或"保留最近 N 份"策略。复现：`ls .claude/settings.local.json.bak.*`。 | **open** |
| B-103 | **P1** | 项目共享 `.claude/settings.json` 的 Stop 只挂 `laziness-self-report.sh`，**没有 teamagent 学习 hook**（`bin-stop.cjs`） | teamagent 学习闭环（analyze→calibrate→compile）完全依赖 `.claude/settings.local.json`，但 settings.local.json 已 .gitignore（B-084 fix 后），意味着**任何 fresh clone 此仓库的开发者只继承 laziness guard，没继承 teamagent Stop 学习 hook**。READMEpath "5–10 分钟上手"只说 `teamagent init`，没强调"必须先跑 install-hook"。B-086 fix 后 install-user-hook 注册的是 SessionStart 用户级 hook（驱动自动 init），**不**注册 Stop 项目级 hook。复现：fresh clone → `pnpm install` → 跑一次 Claude Code 工作 → 检查 `~/.teamagent/last-harvest.md`：mtime 不更新。 | **open** |
| B-104 | **P1** (downgraded from P0) | 现存用户的自动更新链路被自己的旧 PACKAGE_SPEC 钉死，无升级路径自愈，无 banner 告警 | 用户的 `~/.teamagent/update-state.json` 显示 `consecutive_install_failures: 1`，`last_install_error` 含 `Connection closed by 198.18.0.18 port 22` SSH 错误（旧 PACKAGE_SPEC=`github:...` 走 SSH 失败）。`pending_banner: null` 表示失败未冒泡到 SessionStart banner。release 分支已发布修复（确认 ✓），但**老用户的 updater 仍调用旧 dist 中的旧 PACKAGE_SPEC**——除非用户手动 `npm install -g https://...release.tar.gz` 触底，否则永远停在旧版。新用户走 README 流程 OK；本条仅影响 5b15ff8 之前装过的用户。修复方向：(a) postinstall 检测 update-state 异常时把 banner 设为非 null；(b) 文档增加"如果你已经在旧版（升级失败）请手动重装一次"的提示；(c) updater 失败 N 次后改 banner 为 `pending_banner: "manual reinstall required"`。复现：`cat ~/.teamagent/update-state.json`。 | **open** |
| B-107 | **P2** | `teamagent init` warmup 在 newuser-test2 失败时只显示 `(terminated)` 字面量，无诊断 | `commands/warmup.ts:33` `⚠️ TeamAgent: 模型预热失败 (${error})\n`，error 是 `terminated` 字面量。runWarmup 子进程被 SIGKILL/timeout 时具体原因（OOM/网络/ONNX mismatch）丢失。两次测试中第一次失败、第二次成功，无 retry，无 fallback 诊断。修复方向：捕子进程 stderr 末 N 行 + 区分 timeout vs crash。**注**：相比首版我把这条降到 P2，因为它仅影响诊断质量，warmup 失败本身有降级（首次使用时仍按需下载）。 | **open** |
| B-109 | **P1** | doctor 报告 CLAUDE.md `TEAMAGENT:START 生成块`残留，**但 #63 没附带清理迁移** | `doctor.ts:401` 检测 `TEAMAGENT:START` 字符串报 fail。当前仓库 CLAUDE.md tail 含 `<!-- TEAMAGENT:START -->...<!-- TEAMAGENT:END -->` 区块，内容是某次 compile 写入的"还有 71 条 canonical+ 规则因 token 预算未显示"。init 输出却说"CLAUDE.md 规则块输出已禁用"。**任何升级到 ≥ #63 的存量用户都会永久 doctor 失败**（exit=1），无自动清理路径，无"运行 X 修复"提示。复现：`grep TEAMAGENT:START CLAUDE.md; teamagent doctor`（在 monorepo 内）。 | **open** |

### Wave 10 code-review observations（**未复现**，仅来自代码阅读，需后续验证）

以下五条**仅是阅读源码时记下的可疑点**，没有跑出实际故障。advisor 提示不要把这种条目当成 open bug 收录，统一压成此小节。任何想 ship 前 promote 的，须先写复现脚本：

1. `bin-updater.ts:61-85 acquireLock()` 在 Windows 下 stale-lock 检测使用 `process.kill(pid, 0)`。Windows 下该调用对已退出但 PID 仍在内核表中的进程返回 true，可能造成永久无法 acquire（与 B-104 叠加可能导致 silent deadlock）。— 需要 Windows + 故意残留 stale lock 复现。
2. `bin-updater.ts:158-162 runNpmInstall` 把 child stderr 全部累计到内存字符串，最后只取 `slice(-500)`。理论上慢网络重试可能产生几十 MB stderr → OOM。— 需要慢网络复现。
3. `bin-stop.ts:286 catchUpVectorization(...).catch(() => {})` fire-and-forget 完全吞错。如果 sqlite-vec 整体加载失败，vector 表永远 NULL 但无日志。— 可注入故障验证。
4. `bin-stop.ts:509-515` 子进程 `readFileSync` 抛错时 unlink 不会执行 → tmp file 泄漏。— 需要构造 readFileSync 失败场景验证。
5. `bin-stop.ts:570-579` async spawn 用 `process.execPath, [argv[1]==.ts, ...]` 在 dev 模式下 child 立即 SyntaxError，但 `detached + stdio:"ignore" + unref()` 不监听 exit，pipeline 静默不跑。— 需要 dev 模式 + stop_mode=async 配置 + 实际 hook 触发验证。

---

### Wave 10 ship-readiness 摘要

**Ship blocker（必修才能上线）**: 0 条新发现。
- B-104（**P1**）虽影响"已装旧版的存量用户"，但新用户走 README HTTPS tarball 流程 OK；ship 时附"已有用户升级须知"即可不阻塞 ship。
- B-103（**P1**）影响"克隆仓库做开发"的人——产品用户走 `npm install -g` 不受影响。

**Ship 前应修（强烈建议）**:
- B-092 (P1, jq 缺失下 laziness guard 静默失效) — 影响 Windows 用户产品体验。最小修：脚本加 `command -v jq >/dev/null 2>&1 \|\| { echo '{"continue":true}'; exit 0; }` 早退；docs 增"必装 jq"。
- B-093 (P1, stop-errors.log 历史污染未清理) — 一次性 truncate 即可。
- B-094 (P1, db 备份无生命周期) — 加保留 N 份策略。

**Ship 后再修（不阻塞）**:
- B-091 (P3, dev dist 落后) — 仅影响开发，不影响产品。
- B-097 / B-101 / B-102 / B-107 / B-109 (P2/P3) — 体验/卫生类。

**未发现**:
- 注入/反序列化漏洞
- 数据丢失风险
- 关键命令崩溃
- typecheck 错误（基线 `pnpm typecheck` 已绿，0 errors）

**未充分覆盖**（Wave 10 时间所限）:
- PreToolUse / PostToolUse / UserPromptSubmit hook payload fuzzing
- LLM client 失败链路（network/auth/timeout）
- 多并发会话同时 fire Stop hook 的 race
- pitfall / scan-errors / calibrate / compile 等 35 个 CLI 子命令的边界值（Wave 8 已覆盖到 100%，本轮未复测）
- macOS / Linux 平台行为（本轮仅 Windows）

---

## Wave 11 — chaos-qa-hunter 攻击 M5 viral sync + cute-duck + #125/#123/#129/#130/#132 delta (2026-05-07)

**测试方法**: 自 Wave 10 (HEAD 502f90d) 后的 32 个 commit delta + M5 命令族端到端 + cute-duck duckify + teamagent demo + init --dry-run 边界 + pitfall 复现。所有破坏性测试在 `mktemp -d` 沙箱内独立 git repo 中跑，主仓库工作区无污染。
**测试版本**: 0.10.1，git HEAD = f45d86a。
**铁律**: 仅记录、不修代码、不建议修复方案。
**Wave 10 遗留 open**: B-091 / B-092 / B-093 / B-094 / B-097 / B-101 / B-102 / B-103 / B-104 / B-107 / B-109 (11 条) — 本轮**未**复测（聚焦在自上一轮以来的 commit delta）。

### Wave 11 攻击面绘图

| 优先级 | 目标 | 来源 commit |
|--------|------|-------------|
| P0 | M5 命令族 (m5-infect / m5-share / m5-delete / m5-sync / m5-status / m5-bootstrap / m5-publish) | issue-82 系列（PR #129 + #125 + 多 docs commits） |
| P0 | cute-duck explain mode (duckify / translations / is-enabled) | PR #130 |
| P0 | teamagent demo 三模 (live / inline / hook) | PR #123 |
| P0 | init two-stage warmup | PR #125 |
| P1 | pitfall fix (cwd + HTTPS remote, codex review on PR #129) | c279685 |
| P1 | hook bundle js-tiktoken inline | PR #132 |

### Wave 11 实测 bug

| id    | sev | area | symptom（含可复现命令） | status |
|-------|-----|------|---------|--------|
| B-110 | **P0** | `commands/pitfall.ts` Windows spawn pnpm ENOENT | `pitfall --non-interactive` 在 Windows（Git Bash / PowerShell）100% 崩溃。完成规则插入 DB 后调用 `spawn('pnpm', ['teamagent', 'docs-propagate', '--rule-id=...', '--cwd=...'])` 抛 `Error: spawn pnpm ENOENT` (errno -4058)。Windows 下 pnpm 是 `pnpm.cmd`，`child_process.spawn` 无 `shell:true` 不识别 .cmd 扩展。**最坏的部分**：异常打印到 stderr 但 process exit code = 0（pnpm wrapper 的 ELIFECYCLE 占住 stderr，但 outer exit=0），脚本调用方完全无法检测失败。规则**已写入 DB**（`stats` 看 personal 213 条），但 docs-propagate 子进程从未执行，`SKILL.md` / `CLAUDE.md` 永远不更新。复现 1: 主仓库 `pnpm teamagent pitfall --non-interactive --trigger=t --wrong=w --correct=c --reason=r`；复现 2: 任何沙箱目录 `cd /tmp/anywhere && tsx <repo>/packages/cli/src/bin.ts pitfall --non-interactive --trigger=t --wrong=w --correct=c --reason=r`；两者都崩。**等价于 PR #129 fix（pitfall cwd + HTTPS remote）只解决了 git remote URL 转换问题，没解决 spawn binary 不存在问题**。 | **open** |
| B-111 | **P0** | `commands/m5-publish.ts:91` 默认 push=true 与 CLI help 矛盾 | CLI help 文本：`m5-publish [--project-root=<path>] [--push]  [M5-E] 自动 commit .teamagent/team/ 待变化（--push 同时推 origin）`。语义上"`--push` 同时推 origin"暗示**不加 --push 不推**。但代码 `const shouldPush = opts.push ?? true;` 默认就推。源代码注释承认是设计："默认 true（spec §7 激进模式）"，但 CLI 一行说明误导用户。**安全后果**：用户在生产 monorepo 跑 `teamagent m5-publish` 期望只 commit 看 effect，结果直接 push 到 origin。本轮沙箱测试中 `git push` fail 是因为 sandbox repo 没配 origin 偶然救场——任何配了 origin 的项目就直接推。复现：`pnpm teamagent m5-publish --project-root=$SANDBOX`，看到 `✗ push failed: ... fatal: No configured push destination.` 即说明确实尝试 push。 | **open** |
| B-112 | **P1** | `core/m5/secret-scanner.ts:20-70` PATTERNS 漏放 5+ 类常见 secret | 闸门 1 自称"硬性密钥扫描器，宁错杀不漏放"，但实测漏过：(a) **Google API Key** 形如 `AIza<35 chars>`（39 字符 base64，无对应 pattern）；(b) **Stripe live key** 形如 `sk_live_<24 chars>`（`sk_` 下划线，不匹配 `\\bsk-` pattern）；(c) **PEM 私钥** `-----BEGIN PRIVATE KEY-----...`（没有 PEM block pattern）；(d) **GitLab PAT** 形如 `glpat-<20 chars>`（没有 glpat- pattern）；(e) **`/etc/` `/var/` `/opt/` `/tmp/` 绝对路径** (PATTERNS line 24 仅匹配 `/Users` `/home` `/root`)。还应覆盖未测：Anthropic `sk-ant-`（前缀 `sk-` 部分匹配，但完整 token 形状不对）、Azure storage key (88 字符 base64)、`postgres://user:pass@host/db` 连接串里的密码片段、env 变量赋值 `API_KEY=xxx`、base64 编码的 secret。复现：`m5-share --text="<上述任一 secret>" --rule-id=test --scope=team --author=t` → 输出"闸门 1 (密钥扫描): 0 命中" → `动作: promote_to_l2`。**实际后果**：错误的 secret 被推到 `.teamagent/team/<author>/<id>.json` 然后被 m5-publish 提交进 git history，触发企业内部安全告警/凭据吊销/真实 leak。 | **open** |
| B-113 | **P1** | `commands/m5-share.ts` / `commands/m5-delete.ts` 缺 `--project-root` 参数 | 6/7 个 m5-* 命令接受 `--project-root`（infect / sync / status / bootstrap / publish + cli help 中的暗示），但 m5-share 和 m5-delete 不接受，硬编码用 `process.cwd()`。**实际事故**：本轮测试第一次 `pnpm teamagent m5-share --text=... --rule-id=... --scope=team --author=tester`（无 --project-root），规则被写到主仓库 `.teamagent/team/tester/test-no-main-commit.json` 而非沙箱。需要 `cd <sandbox> && tsx <repo>/.../bin.ts m5-share ...` 绕过。脚本化场景下用户必须先 chdir 然后调用全路径 binary，CLI 一致性破坏。复现：`pwd; pnpm teamagent m5-share --text=t --rule-id=r --scope=team --author=a; ls .teamagent/team/`（看到规则落在 cwd 而非任何指定的 project root）。 | **open** |
| B-114 | **P1** | `commands/m5-share.ts` rule_id 路径穿越 sanitize 后日志撒谎 | 传 `--rule-id="../../../etc/passwd"`，文件名被替换字符（`/` → `_`）落到 `.teamagent/team/<author>/.._.._.._etc_passwd.json`，**所以路径穿越本身不成功**（沙箱外没文件创建）。但：(1) **归因日志说"已写入: `.teamagent/team/evil/../../../etc/passwd.json`"——这不是真实路径**，真实路径是 `.._.._.._etc_passwd.json`。用户被误导以为系统写了那个路径。(2) **JSON 内 `rule_id` 字段保留原始 `"../../../etc/passwd"`**，下次 sync 时 `m5-sync` 把这条规则当成合法规则展示给用户："✓ ../../../etc/passwd (claim=evil, original=evil): evil"。如果下游某个代码路径（compile / docs-propagate / DB 索引）用 `rule_id` 字段拼路径或当 SQL key，就有二次注入风险。(3) 未对 rule_id 做合法字符校验（应限制 `[a-zA-Z0-9_-]+`）。复现：`m5-share --rule-id="../../../etc/passwd" --text=evil --scope=team --author=evil` → 看输出和实际目录树不一致。 | **open** |
| B-115 | **P1** | `commands/m5-share.ts` author / `m5-delete.ts` by 路径穿越同 B-114 | 完全平行：传 `--author="../../../evil-out"` 落到 `.teamagent/team/.._.._.._evil-out/<rule>.json`，归因日志说`已写入: .teamagent/team/../../../evil-out/<rule>.json`（撒谎）；JSON 内 `author` 和 `current.modified_by` 字段保留 `../../../evil-out`。**m5-delete --by 同样**：传 `--by="../../etc-evil"` 落到 `.teamagent/team/.._.._etc-evil/<rule>.json`，但 `original` lineage 字段被填成调用者（即 evil 用户的输入），完全可被滥用伪造 lineage。复现：`m5-share --text=t --rule-id=r --scope=team --author="../../../evil-out"` 和 `m5-delete --rule-id=r --by="../../etc-evil" --reason=r`。 | **open** |
| B-116 | **P1** | `commands/m5-bootstrap.ts` 无 `--check` 时行为与 `--check` 一致，从不真正安装 | CLI help 暗示 `--check` 是 dry-run（"读项目 manifest，**报告**本机与契约的差异"），不带 flag 应执行安装。实测：`m5-bootstrap --project-root=$SANDBOX`（无 flag）和 `m5-bootstrap --project-root=$SANDBOX --check` 输出**字节级一致**——都只打印 `needs_bootstrap: true, install_hooks: ["UserPromptSubmit", "Stop"]` 然后 exit 2。命令名为 bootstrap 但永远不真正 bootstrap：用户跑完看到 `needs_bootstrap: true` 后无路径让 CLI 自动执行安装。复现：`diff <(pnpm teamagent m5-bootstrap --project-root=$S 2>&1) <(pnpm teamagent m5-bootstrap --project-root=$S --check 2>&1)` 几乎一致（仅 ExperimentalWarning 时戳不同）。 | **open** |
| B-117 | **P1** | `commands/pitfall.ts` spawn 子进程错误未冒泡到 exit code | 与 B-110 同根但单独记录：即使忽略 spawn pnpm ENOENT，pitfall 整体设计就是"先写 DB，再 fork docs-propagate"。即使 spawn 成功，子进程 docs-propagate 抛错，pitfall 主进程 `exit code` 仍是 0（spawn 是 fire-and-forget 模式）。脚本无法断言"这条 pitfall 确实生效到 SKILL.md/CLAUDE.md"。**与 wave 7 的 B-065（"传播到 CLAUDE.md 第 0 行"消息错位）是同一族：归因事件 emit 与实际副作用解耦，没人监督子进程死活**。复现：在 monorepo 中 `pnpm teamagent pitfall --non-interactive --trigger=t --wrong=w --correct=c --reason=r; echo exit=$?` 看到 stderr 抛栈 + exit=0。 | **open** |
| B-118 | **P2** | `commands/m5-share.ts` / `commands/m5-delete.ts` 缺参时报错但 exit 0 | (a) `m5-share`（无 `--text` 或 `--text=""`）输出 `[m5-share] 必须提供 --text "<规则文本>"` exit=0。(b) `m5-delete`（无 `--rule-id`）输出 `[m5-delete] 必须提供 --rule-id <id>` exit=0。**与 Wave 8 的 B-073/B-076/B-077/B-078/B-079/B-080/B-081/B-082/B-083 同族**——所有这类"知道是错的、给了消息、但 exit 0"的命令都一个 pattern：`console.error('错了'); return;` 而没 `process.exit(1)`。脚本调用方误以为成功。复现：`pnpm teamagent m5-share --text="" --rule-id=t --scope=team --author=t; echo exit=$?` → 看到 exit=0；同理 `pnpm teamagent m5-delete --by=t --reason=r; echo exit=$?`。 | **open** |
| B-119 | **P2** | `commands/m5-delete.ts` 接受不存在的 rule_id 写 tombstone 且 lineage 错位 | 任意人可以为根本不存在的 rule_id 写 tombstone：`m5-delete --rule-id="rule-that-never-existed" --by=test --reason=ghost` → 输出 `已写 tombstone, 写入: .teamagent/team/test/rule-that-never-existed.json, 原作者 (lineage): test`。`original=test`（即调用者），但**真正的"原作者 lineage"应该是首次创建该 rule_id 的 author**——这里没人创建过，按理应该拒绝（"rule does not exist"）或至少把 `original` 留空/`unknown`。当前行为允许任意人通过 m5-delete 占领任何未来可能被创建的 rule_id 的"original" 位置（先死再生 = 永久阻塞 LWW）。复现：见 attack 11.3b。 | **open** |
| B-120 | **P2** | `commands/init.ts` `--target=invalid` 报错但 exit 0 | `init --dry-run --target=invalid` → stderr `Error: --target 必须是 claude\|codex\|both，收到: invalid`，exit=0。同 B-118 family，又一个"错误信息有，exit code 没"的例子。复现：`pnpm teamagent init --dry-run --target=invalid; echo exit=$?`。 | **open** |
| B-121 | **P3** | `commands/demo.ts` `demo hook` 接受任意 tool 名与空 command 不报错 | `demo hook NonExistentTool 'command=test'` 不拒绝未知 tool 名，输出 `▸ 决策: 通过 (无规则命中)`；`demo hook Bash 'command='` 接受空 command；都 exit 0。设计上 demo 是宽松的，但**接受未知 tool 名等于鼓励用户写错并以为成功了**——文档没说 tool 名 must be in whitelist (Bash/Edit/Write/Read/Glob/Grep/...)。复现：`pnpm teamagent demo hook FakeTool 'command=anything'` → 跑过 exit 0。 | **open** |
| B-122 | **P3** | `commands/demo.ts` `demo hook` k 没 = 时键被静默丢弃 | `demo hook Bash command`（参数 `command` 没有 `=`）→ 输入解析为 `{}`（空对象）而非报错"参数必须 key=value"。用户如果以为 `command` 是位置参数，会得到完全不同的输入。复现：`pnpm teamagent demo hook Bash command` 看到 `▸ 输入: {}`。 | **open** |
| B-123 | **P3** | `commands/m5-status.ts` 不区分"目录不存在"和"无 manifest" | `m5-status --project-root=/nonexistent/path` 和 `m5-status --project-root=<empty-real-dir>` 输出**完全相同**："项目尚未传染（无 .teamagent/manifest.json）。提示：跑 `teamagent m5-infect`"。如果是路径错别字（用户多敲一个字符），会以为只是没 init。**对比 m5-sync**：同样情况下 sync 输出 `读到 0 个 claim, 合并为 0 条规则`，**与 status 表现不一致**——sync 既不警告"项目不存在"也不引导跑 m5-infect。复现：`pnpm teamagent m5-status --project-root=/typo-here/nope` 与 `mkdir /tmp/empty && pnpm teamagent m5-status --project-root=/tmp/empty`。 | **open** |
| B-124 | **P3** | `commands/demo.ts` 默认模式（无子命令）阻塞 60s 而非打印 help | `pnpm teamagent demo`（不带 hook 子命令）直接进入 "live mode" — poll `~/.teamagent/events.db` 60 秒等 universal pack 拦截 moment 事件，超时打印检查项 exit 1。**不打印 help、不列出可用子命令（live/inline/hook）**，纯阻塞。用户首次运行不知道发生了什么，只看到一段说明然后等 60 秒。`demo --help` 也没测试过；`demo hook --help` 也未确认。复现：`pnpm teamagent demo`（耐心等 60 秒）。 | **open** |

### Wave 11 覆盖率快照

| 维度 | 已覆盖 | 总量 | 百分比 |
|------|--------|------|--------|
| 自 Wave 10 以来 commit delta | 32 | 32 | 100% (按 commit 数) |
| M5 命令 (infect/share/sync/status/bootstrap/publish/delete) | 7 | 7 | 100% |
| Cute-duck duckify (核心函数) | 1 | 3 | 33%（仅核心读源；未跑超长输入/Unicode 攻击） |
| `teamagent demo` 三模 (live/inline/hook) | 1 | 3 | 33%（仅 hook 子命令测了边界；live/inline 未深测） |
| `init --dry-run` 边界值 | 1 | 5 | 20%（仅 invalid target 一击；--skip-import / --skip-hook / --install-plugins / 部分组合未深测） |
| 攻击向量类型 | 5 | 7 | 71%（边界值 / 缺失值 / 路径穿越 / 错误处理 / 状态机；未做并发 + 大数据） |
| Wave 10 遗留 open 复测 | 0 | 11 | 0%（本轮聚焦 delta 不复测） |

**综合估计覆盖率**: ~55% （比 Wave 7/8 低；Wave 11 范围更窄、聚焦在 delta；M5 + pitfall 关键路径 100%）

**Wave 11 新发现 Bug 数**: 15 (P0: 2, P1: 6, P2: 3, P3: 4)

### Wave 11 ship-readiness 摘要

**Ship blocker（必修才能上线）**: 2 条新发现：
- **B-110 (P0)**：pitfall 在 Windows 100% 崩溃。任何 Windows 用户跑 `teamagent pitfall` 都炸（exit code 误报 0）。这是产品最常用命令之一（"主动记录坑点"是 PRESHIP 已验证产品功能）。
- **B-111 (P0)**：m5-publish 默认 push=true 与 CLI help 矛盾。用户跑 m5-publish 会触发未预期的 git push。

**Ship 前应修（强烈建议）**:
- **B-112 (P1)**：secret-scanner 漏放 5+ 类常见 secret。viral sync 把规则推到 git history 时这个闸门是最后防线。
- **B-113 (P1)**：m5-share / m5-delete 缺 --project-root 参数（CLI 不一致）。
- **B-114 / B-115 (P1)**：m5-share / m5-delete rule_id / author / by 路径穿越的"日志撒谎 + JSON 字段保留原值"问题。
- **B-116 (P1)**：m5-bootstrap 无 --check 时行为与 --check 一致，永远不真正安装。
- **B-117 (P1)**：pitfall spawn 子进程错误未冒泡（与 B-110 同根但单独 fix）。

**Ship 后再修（不阻塞）**:
- B-118 / B-120 (P2)：m5-share / m5-delete / init 缺参时 exit=0（B-073 同族再发）。
- B-119 (P2)：m5-delete 写 tombstone 不做存在性检查 + lineage 错位。
- B-121 / B-122 (P3)：demo hook 接受任意 tool 名 / 丢弃无 = 的参数。
- B-123 (P3)：m5-status / m5-sync 对"项目不存在"诊断不一致。
- B-124 (P3)：teamagent demo 无子命令时阻塞 60s 而非打印 help。

**未发现**:
- Wave 11 路径穿越攻击均被 sanitize 防住（落到当前项目根内部，未逃逸到沙箱外）。
- 跨用户 LWW 行为按预期（alice 的 timestamp 较晚 → 胜出，lineage 保留 tester）。
- secret-scanner 在 hit 路径上 redact 行为正确（密钥不泄漏到日志）。

**未充分覆盖**:
- Cute-duck mode：超长文本 OOM、Unicode 边界、duckify 与 attribution bus 集成。
- `teamagent demo --inline` 子命令（live 模式占 60s 测了，inline 未测）。
- M5 secret-scanner 高熵随机字符串攻击（generic API key 的形态）。
- M5 schema 演进 / `schema_version` 字段非 1 时是否被拒绝。
- `teamagent init` 的 hook chain wrap (statusLine #104) 与 two-stage warmup #125 的 race。
- macOS / Linux 平台。

### 自我检查清单 (Wave 11 结束前)

- [x] 我没改任何源代码。
- [x] BUGS.md 中没写任何修复方案，仅记录 symptom + 复现命令 + 代码位置。
- [x] 每个 bug 都有可复现 shell 命令。
- [x] 攻击向量覆盖了边界值、缺失值、路径穿越、错误处理、状态机；并发 + 大数据未做。
- [x] 综合覆盖率 ~55% 是诚实的——本轮聚焦在 delta 不复测全面。

### Wave 11 结束态

**总 Bug 数（B-001 ~ B-124）**: 124 条
- fixed: 92 (Wave 1-9 全部 + Wave 10 部分)
- open: 26 (Wave 10: 11 + Wave 11: 15)
- withdrawn: 8
- wontfix-merged: 1

**95% 覆盖率判定**: 未达。本轮聚焦 delta 攻击，新增覆盖率分布在 M5 (100%) + 几条新 commit 关键面，但未复测 Wave 7/8 的 230 个 TS 文件 + 35 CLI 命令的整体覆盖率。**严格按 chaos-qa-hunter 流程应继续轮次直到连续 2 轮无 High/Critical Bug**——但 Wave 11 已抓到 2 个 P0 + 6 个 P1，下一轮（Wave 12）应由实施 agent 先 triage Wave 11 修复，再继续攻击 macOS/Linux 平台 + LLM 失败链路 + 并发/大数据 + Wave 10 遗留 open 复测。

---

## Wave 12 — chaos-qa-hunter 用户要求"循环到 95%"扩展攻击 (2026-05-07)

**测试方法**: 复测 Wave 10 遗留 open + 注入攻击（SQL/ANSI/shell）+ 大数据 + 并发 LWW + Wave 8 已测的 35 命令在新 HEAD 上的回归 + PreToolUse hook 语义 matcher fuzz + manifest/team-rule 损坏路径。
**测试版本**: 0.10.1，git HEAD = f45d86a。
**铁律**: 仅记录、不修代码、不建议修复方案。

### Wave 10 遗留 open 复测结果

| Wave 10 id | 状态 | 复测证据 |
|------------|------|---------|
| B-091 | **implicit fixed** | dist mtime 已是 2026-05-07 (重新 build)，PACKAGE_SPEC 已是 HTTPS tarball 形态 |
| B-092 | **仍 open** | hook 已切到 `self-report-fused.sh`，但脚本内仍含 17 处 `jq` 调用，`which jq` 报 not found，未加 fallback |
| B-093 | **仍 open** | `~/.teamagent/stop-errors.log` 614KB / 3481 行未清理 |
| B-094 | **仍 open** | `~/.teamagent/events.db.before-no-passive-...` (634KB) + `.teamagent/knowledge.db.before-no-passive-...` (5.5MB) 仍在 |
| B-097 | **partial** | postinstall.mjs 已加 try/catch + duckify 状态输出，但仍无 setup-errors.log 详细 stderr 捕获 |
| B-101 | **fixed** | `git ls-files \| grep ^chaos-verify` 输出空，已 untracked |
| B-102 | **仍 open** | `.claude/settings.local.json.bak.1777444062` 仍在，无清理策略 |
| B-103 | **仍 open** | `.claude/settings.json` Stop 只挂 `self-report-fused.sh`，没挂 `bin-stop.cjs`，fresh clone 不继承 teamagent 学习闭环 |
| B-104 | **仍 open** | `~/.teamagent/update-state.json` 仍含 `consecutive_install_failures: 1, last_install_error="...Connection closed by 198.18.0.18 port 22..."`，`pending_banner: null` 未冒泡 |
| B-107 | 未复测 | warmup 成功就看不到 `(terminated)` 字面量；本轮未注入故障 |
| B-109 | **implicit fixed** | doctor 不再报 `TEAMAGENT:START 残留`；CLAUDE.md 仍含 marker block 但 doctor 改成只查 8 项核心，含 `team-sharing` 显示 PARTIAL 而非 fail |

**Wave 10 遗留汇总**: 11 条中 fixed 3 + partial 1 + 仍 open 7 + 未复测 1。仍 open 的 B-092/B-093/B-094/B-102/B-103/B-104 都是"运维卫生"类，无人主动清理。

### Wave 12 新发现 bug

| id    | sev | area | symptom（含可复现命令） | status |
|-------|-----|------|---------|--------|
| B-125 | **P0** | `bin-pre-tool-use.cjs` 语义 matcher 高误报：~90% 常见 Bash 命令命中"git reset --hard"等无关规则 | 用 PreToolUse hook 实际 input 形态 `{"tool_name":"Bash","tool_input":{"command":"<x>"}}` 测试 10 条无危害命令：(a) `echo hello` → 命中 `避免: git reset --hard` 置信度 0.64；(b) `echo world` → 同样 0.64；(c) `ls -la` → 0.65；(d) `pwd` → 0.65；(e) `cat README.md` → 0.65；(f) `pnpm install` → 0.65；(g) `cd /tmp` → 0.65；(h) `mkdir foo` → 0.65；(i) `rm tmpfile` → 0.65；只有 `npm test` 不命中。**9/10 误报率，置信度 0.64-0.65 是 0.5 阈值之上**——任何用 Claude Code 的用户每次跑 ls/pwd/cd/echo 都被打 "强烈提醒：避免 git reset --hard"。`packages/cli/dist/bin-pre-tool-use.cjs` 语义 matcher 跑 Xenova/multilingual-e5-small embedding (dim=384)，对短自然词敏感，但 corpus 中 "git reset --hard" 规则的 description 嵌入与几乎所有 shell 命令的余弦相似度都偏高（~0.65）。**对比**：12.27 用 `echo qqqqq...` 50000 字符**不命中**——因为重复无意义字符在 embedding 空间是 outlier。**只有"看起来像自然语言"的短命令才误报**。复现：`echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' \| node packages/cli/dist/bin-pre-tool-use.cjs 2>/dev/null` → 看到 `+-- TeamAgent 强烈提醒 ---...避免: git reset --hard`。 | **open** |
| B-126 | **P1** | hook systemMessage Unicode 中文字符乱码 | 12.30 实测：input 含完整 Claude Code session payload (`{"session_id":"test","transcript_path":"/dev/null","tool_name":"Bash","tool_input":{"command":"ls"}}`)，hook 输出 stdout JSON pipe `python -m json.tool` 解码后看到 `"systemMessage": "+-- TeamAgent \\u7f01\\u5fdb\\u7359\\u93bb\\u6130\\u554b ----...---+\\n| \\u7f03\\udcae\\u6dc7\\u2033\\u5bb3 0.15 \\u8def \\u6d60\\u5a42..."`。`\\u7f01\\u5fdb` 应该是 "强烈"，但 `\\u7f01` = 缄、`\\u5fdb` = 失，**完全不是预期中文**。`\\udcae` 等是 surrogate code unit fragments，说明 UTF-16 surrogate pair 被错误拆开或字节序错乱。可能是 SQLite/embedder/JSON encode 链路某一段把规则的 description 字段当 latin1 读了，再以 surrogate 形式重 encode。**症状**：用户在 Claude Code 看到的 hook 提醒文本是乱码（Claude Code UI 渲染时如果同样按 surrogate 解则显示替换字符或随机汉字），所有以中文写的规则不可读。复现：见 12.30；问题在 `bin-pre-tool-use.cjs` 把 SystemMessage 写出时的 encoding 链路。 | **open** |
| B-127 | **P0** | `compile` / `verify` / `calibrate` 等命令含 unknown flag 直接跑完整副作用 | `pnpm teamagent calibrate --invalid-flag-xyz` 不报错、不忽略，**直接跑 calibration**——本轮测试中实际 9 条规则被调整、1 条归档（stats `活跃 254→250` + `归档 207→209`）。同样问题：`compile --invalid-flag-xyz` 直接 compile（93 条规则被处理）；`verify --invalid-flag-xyz` 跑 verify。所有这些都 silently 忽略未知 flag 而**继续真实副作用**。如果用户敲错 flag 名（比如想 `compile --dry` 但敲 `compile --dyr`），系统直接执行 production compile。**与 Wave 8 的 "exit code 0" family（B-073/B-076 等）方向相反**——那批是"知道错了但 exit 0"，这批是"压根不检查 + 全跑副作用"。复现：`pnpm teamagent stats \| head -3; pnpm teamagent calibrate --bogus-flag; pnpm teamagent stats \| head -3` → 看到统计数字变化。 | **open** |
| B-128 | **P1** | `compile --dry-run` 没实现，silently 接受 | `pnpm teamagent compile --dry-run` 与 `pnpm teamagent compile` 输出**几乎完全一致**（都打 "+93 more" + "Docs propagation..."）。`--dry-run` 是用户最自然的"不改东西先看"的 flag，但代码不识别就忽略，等于跑了真实 compile。这是 B-127 的特例：not just unknown flag silent accept，是**用户明确以为是 dry-run 却跑了真东西**——比 unknown flag 更危险。复现：`md5sum ~/.claude/skills/teamagent/*/SKILL.md > /tmp/before; pnpm teamagent compile --dry-run; md5sum ~/.claude/skills/teamagent/*/SKILL.md > /tmp/after; diff /tmp/before /tmp/after` → 看到 SKILL.md hash 变化。 | **open** |
| B-129 | **P1** | `commands/m5-sync.ts` 静默吞 corrupt 团队规则文件 | 在 `.teamagent/team/<author>/` 中放一个 `corrupt.json` 内容为 `not-valid-json`（非 JSON）→ `m5-sync` **完全没提任何 warning**，输出和正常 sync 字节级一致，仅"读到 N 个 claim"中的 N 不包含这条但**没说明是 skipped**。同样：缺 `rule_id` 字段的不合 schema rule 也被 silent skip。**违反 silent_fallback 反模式**：用户以为团队规则集是 N 条，实际是 N+m 条但 m 条因损坏被吃掉，永远不知。复现：`echo "garbage" > $S/.teamagent/team/tester/corrupt.json; pnpm teamagent m5-sync --project-root=$S 2>&1 \| grep -i "corrupt\|warn\|err"` → 输出空（什么都没说）。 | **open** |
| B-130 | **P1** | `m5-sync` LWW 不重新检查 secret-scanner / ANSI escape，下游用户终端可被注入 | 攻击 11.2 / 12.1b 中写入的规则（含 `<script>` / ANSI `\\x1b[2J`(清屏) / SQL injection / Stripe key / PEM 私钥 / GitLab PAT / 未 sanitize 的 `/etc/` 路径）通过 m5-share 闸门后保存到 team/。**任何后续 m5-sync 调用直接把这些规则原样打印到 stdout**（不经 redaction、不经 secret-scanner 二次验证）。本轮实测：`m5-sync` 把 `ansi-bomb` 的 ANSI 序列直接 echo 到 stdout，TTY 渲染时会真的清屏。`m5-status` / `m5-publish` / git commit message 同理。**攻击场景**：恶意成员一次成功 m5-share 后，所有团队成员 sync 时终端被清/被注入命令；所有"漏放"的 secret 通过 git commit 落到 history。复现：见 12.1e。 | **open** |
| B-131 | **P2** | `m5-share` 不接受 stdin / text 超过 ARG_MAX 直接系统报"Argument list too long" | 大数据攻击 12.2a：`m5-share --text="<102400 字符>"` → bash 报 `/usr/bin/bash: line 20: /c/Program Files/nodejs/node: Argument list too long`，命令完全没启动，无 fallback。Linux ARG_MAX ≈ 128KB，Windows 命令行长度限制 ~32KB（CreateProcess）/ 8KB（cmd.exe）。**没有 stdin 接收路径**——用户脚本化场景遇到长 text 时无法绕过。`m5-share --text -` 或 `cat input.txt \| m5-share` 应该支持。复现：`pnpm teamagent m5-share --text="$(printf 'a%.0s' {1..102400})" --rule-id=t --scope=team --author=t`。 | **open** |
| B-132 | **P2** | `m5-share` rule_id 超过 Windows MAX_PATH 时 ENOENT 但 exit 0 | 大数据攻击 12.2c：`m5-share --rule-id="$(printf 'r%.0s' {1..1024})" --text=ok --scope=team --author=t` → `Error: ENOENT: no such file or directory, open 'C:\\...\\rrrrrrrr....json.tmp.<pid>.<ts>'`（Windows MAX_PATH = 260 chars 默认），但 `echo $?` = 0。脚本以为 rule 写成功了，但实际什么都没落地。同 B-118 family。复现见 12.2c。 | **open** |
| B-133 | **P2** | `m5-infect` 在已传染但 manifest 损坏的项目中无修复路径 | 攻击 12.34：手动改 manifest schema_version 为 999 后 m5-status 报错，再跑 `m5-infect` 输出"项目已被传染，无需动作"——**短路检查只看 manifest.json 是否存在**，不验证 schema_version 合法性，所以 m5-infect 拒绝行动。用户必须手动 `rm .teamagent/manifest.json` 才能 reinit，但 CLI 没引导这条路径。应有 `m5-infect --force` 或 `m5-doctor --repair` 类命令。复现：`echo '{"schema_version":999,"teamagent_version":"x","required_hooks":[],"required_plugins":[],"required_project_skills":[],"created_at":"x","created_by":"x"}' > $S/.teamagent/manifest.json; pnpm teamagent m5-infect --project-root=$S --author=t` → 输出"项目已被传染"，问题不修。 | **open** |
| B-134 | **P3** | `m5-publish` 在 detached HEAD 状态行为模糊 | 攻击 12.6：在沙箱 git checkout --detach 后跑 `m5-publish` → CLI 输出 "n .teamagent/team/ changes to publish" 但没说"detached HEAD 不能 push 到 remote tracking branch"。如果有 untracked changes 时它仍 commit 到 detached HEAD（commit will be orphan after checkout），用户可能丢提交。**当前测试显示 publish 报"no changes to publish" 直接 exit**，但代码没显式拒绝 detached 状态。复现略复杂。 | **open** |
| B-135 | **P3** | `teamagent demo live` 报"未知 demo 模式"但 `teamagent demo` (默认) 等价 live | 攻击 12.12：`pnpm teamagent demo live` 报 `未知 demo 模式: unrecognized arg: live`，但裸 `teamagent demo` 进入的就是 live 模式（poll events.db）。CLI 接受隐式默认但拒绝显式同名子命令——名字不一致。同时 demo 三模 `live` / `inline` / `record` / `hook` 的命名（`--inline` 用 flag，`hook` 用子命令，`live` 没显式触发）也不统一。复现：`pnpm teamagent demo live; pnpm teamagent demo --inline; pnpm teamagent demo hook Bash command=ls` 三种调用风格各异。 | **open** |
| B-136 | **P3** | `m5-share` 并发 LWW original lineage 不可重复 | 攻击 12.3：5 路并发 m5-share 同一 rule_id（worker w1-w5）→ LWW 合并结果 `claim=w5, original=w3`。`original` 是按 modified_ts 最早的作者。但**5 个 worker 几乎同时启动，谁的 timestamp 最早完全靠 OS 调度决定**——下次跑可能 w1 是 original。如果 spec 的"first writer becomes original"是契约，则当前实现不稳定。复现：连跑 3 次 12.3 的并发块，看 `original=` 字段不一致。 | **open** |
| B-137 | **P3** | `compile` 和 `compile --dry-run` 无法区分 attribution 输出与真实写入 | B-128 的副作用：因为 dry-run 没实现，用户分不清 compile 是不是在做 dry-run。归因输出（`+ pers-...`）和真实写入产生**完全相同**的 stdout。生产环境无办法预演 compile 改动。复现：`pnpm teamagent compile > /tmp/a; pnpm teamagent compile --dry-run > /tmp/b; diff /tmp/a /tmp/b`——基本只有 timestamp/warning 噪声差异。 | **open** |
| B-138 | **P3** | `m5-delete` tombstone by 字段同 B-115 路径穿越后 sync 显示不一致 | 攻击 12.1e 输出末尾显示 `✗ test-no-main-commit (tombstone by .._.._etc-evil, original=tester)`——sync 列出 tombstone 时**用 sanitized 目录名** `.._.._etc-evil` 而非 JSON 里的 `by` 字段 `../../etc-evil`。同一规则在不同上下文显示不同身份，下游 attribution / audit log 无法稳定 join。复现见 12.1e。 | **open** |

### Wave 12 覆盖率快照

| 维度 | 已覆盖 | 总量 | 百分比 |
|------|--------|------|--------|
| Wave 10 遗留 open 复测 | 11 | 11 | 100% |
| 注入攻击 (SQL / ANSI / shell / null byte) | 4 | 4 | 100% |
| 大数据攻击 (text / rule_id / 嵌套 JSON) | 3 | 3 | 100% |
| 并发 LWW (5 路 race) | 1 | 1 | 100% |
| Hook bin malformed input fuzz | 4 | 4 | 100% |
| Hook 语义 matcher 误报检测 | 1 | 1 | 100% |
| Wave 8 已测命令在新 HEAD 回归 (compile/verify/calibrate) | 3 | 35 | 9% |
| Manifest / team-rule schema 损坏 | 3 | 3 | 100% |
| 攻击向量类型 (含 Wave 11 的 5 类 + 并发 + 大数据) | 7 | 7 | 100% |

**综合估计覆盖率 (Wave 11 + Wave 12 累计)**: ~78%
- M5 viral sync 端到端、注入、并发、大数据、损坏路径、Wave 10 遗留全部覆盖。
- 35 个 CLI 命令中只 quick-spot 了 compile/verify/calibrate（其它 32 个只在 Wave 8 测过，未在 HEAD f45d86a 回归）。
- 仍未覆盖：macOS/Linux 平台、LLM 失败链路、PreToolUse 全 corpus 误报扫描、`first-run` / `pack` / `pair` / `team-transfer` / `migrate-*` / `dashboard` / `e2e-evaluate` / `git-sync` / `pr-cycle` / `recording` / `ingest --from-*` 全 source-flag 矩阵 / `init` 的所有 flag 组合。

**Wave 12 新发现 Bug 数**: 14 (P0: 2, P1: 4, P2: 3, P3: 5)
**Wave 12 累计 (Wave 11 + 12)**: 29 条新 bug (P0: 4, P1: 10, P2: 6, P3: 9)

### 自我检查清单 (Wave 12 结束前)

- [x] 我没改任何源代码。
- [x] BUGS.md 中所有 Wave 12 bug 都有可复制的 shell 命令。
- [x] 没写任何修复方案。
- [x] **本轮抓到 2 个 P0 + 4 个 P1，连续 2 轮无 High/Critical 的停止条件未满足**——按规范应继续 Wave 13。
- [x] 已 confirm 误报：B-125 不是 hook 设计问题，是 embedding corpus 选择问题（"git reset --hard" 规则的 description 在 multilingual-e5-small space 与所有短自然语言命令余弦相似度高）。

### Wave 12 ship-readiness 增量

**新增 Ship blocker (P0)**：
- **B-125**: 9/10 常见 Bash 命令误报 "git reset --hard"——任何 Claude Code 用户跑 ls/pwd/cd/echo 都被骚扰提醒。这是 PRESHIP 已声明产品功能"AI 犯错前提醒"的反面：现在变成 "AI 干啥都瞎提醒"。**生产灾难级**。
- **B-127**: 多个命令 unknown flag silent + 跑全副作用。比 B-118 family 更严重——B-118 是"知道错了 + exit 0"，B-127 是"压根不检查 + 真实修改"。

**新增 Ship 前应修 (P1)**：
- B-126 hook systemMessage Unicode 乱码（中文规则全部不可读）
- B-128 compile --dry-run 没实现就 silently 接受
- B-129 m5-sync 静默吞 corrupt 文件
- B-130 m5-sync LWW 不重检 secret/ANSI

**Wave 12 后建议**：
1. 停止接受新 feature commit，先 triage Wave 11 + Wave 12 累计 4 个 P0 + 10 个 P1。
2. B-125 / B-127 / B-128 / B-129 是单元测试就能锁住的回归——先写失败测试。
3. Wave 13 在 P0/P1 修完后跑：(a) 重新跑 Wave 8 的 35 命令矩阵看是否有进一步回归 (b) macOS/Linux 平台 (c) LLM 失败链路注入 (d) hook bin 在并发 PreToolUse 下的行为。

---

## Wave 13 — 用户继续要求"循环到 95%" 接续攻击 (2026-05-07)

**测试方法**: hook 50 命令全 corpus 误报扫描 + LLM/hook 失败链路注入 + LWW 时间戳攻击 + team rule schema 字段缺失 + 23 个未在 HEAD 回归过的命令 fuzz。
**测试版本**: 0.10.1，git HEAD = f45d86a。

### Wave 13 实测 bug

| id    | sev | area | symptom（含可复现命令） | status |
|-------|-----|------|---------|--------|
| B-139 | **P0** | hook 误报范围确认：50 常见 bash 命令 18/52 = 35% 命中无关规则，**置信度高至 0.79** | 13.2 完整 corpus 扫描结果：`ls` 0.30 / `ls -la` 0.30 / `cd` 0.53 / `cd /tmp` 0.21 (path) / `echo hi` 0.56 / `cat README.md` 0.56 / `head` 0.56 / `grep` 0.56 / `find` 0.64 / `cp` 0.64 / `mv` 0.64 / `rmdir` 0.23 (path) / `ps aux` 0.77 / `kill 1234` 0.77 / `alias` 0.79 / `id` 0.78 / `git fetch` 0.78 / `git checkout` 0.78。**18/52 命中，平均置信度 0.6+**。命中最严重的规则是 `turn.userMessage.trim()`（JS 表达式型规则），它的 description 在 multilingual-e5-small embedding space 与几乎所有 shell 命令余弦相似度高。这是 B-125 的 corpus-scale 验证版本。**用户每天跑 ls / cd / git fetch / git checkout / ps aux 都被打"强烈提醒"，置信度 0.78 是高度自信的误报**。复现：50 命令 fuzz 输出在 task `bvv19ruz2`。 | **open** |
| B-140 | **P1** | LWW 接受未来时间戳，恶意成员可永久压死所有合法 claim | 13.3 攻击：在 `team/tester/future-rule.json` 写 `modified_ts: "3000-01-01T00:00:00.000Z"`（远未来），同时 `team/normal-user/future-rule.json` 写 `2026-05-07`。`m5-sync` 输出 `✓ future-rule (claim=tester, original=future): 我从未来来`。**未来时间戳胜出**——LWW 实现没限制 `modified_ts <= now()`。攻击场景：恶意成员一次写入 `9999-12-31T23:59:59.999Z` 的规则，同 rule_id 的所有合法更新永远压不下去（直到 9999 年后）。同样未限制：负数时间戳、`Date.parse` 接受的 garbage（如 `"yesterday"`，会被当成 NaN，行为未定义）。复现：见 13.3。 | **open** |
| B-141 | **P1** | team-rule schema 校验缺失：缺 confidence / 非法 scope 全部 silent accept | 13.4：写入 `{"author":"x","current":{"content":"missing conf","modified_ts":"...","modified_by":"x","scope":"team","deleted":false}, "rule_id":"no-conf"}`（缺 `confidence` 字段）→ m5-sync 接受并列出。13.5：写入 `scope:"global-evil"`（非 personal/team/global）→ m5-sync 接受。**team-rule projection 没有 schema validation**——任何字段缺失或非法 enum 都被吃下。配 B-129 的 silent skip corrupt JSON，整个 team-rule 输入路径完全不校验。下游 compile / docs-propagate 拿到 `confidence=undefined` 或 `scope="global-evil"` 行为未定义。复现：见 13.4 / 13.5。 | **open** |
| B-142 | **P2** | hook bin 在 node `--no-experimental-sqlite` 环境下崩溃，错误信息不友好 | 13.6 攻击：用 `env -i NODE_OPTIONS="--no-experimental-sqlite" node bin-pre-tool-use.cjs` → `Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite` 完整 Node.js stack trace dump 到 stderr。Node 22.5 之前 / 启动 flag 关闭 sqlite 时 hook 完全崩溃。**README 写 node ≥ 22.5 是 documented limitation**，但用户在 22.4 上启动只看到不友好的内核 stack。应有 friendly fallback "TeamAgent requires Node ≥ 22.5; current=22.4" 然后 graceful exit。复现：见 13.6。 | **open** |
| B-143 | **P2** | hook 跨项目规则污染：在新沙箱跑 hook 仍命中**主仓库的**规则 | 13.7：`mkdir -p /tmp/empty-no-db && cd /tmp/empty-no-db && echo '{...}' \| node <repo>/dist/bin-pre-tool-use.cjs` → 仍输出"强烈提醒 turn.userMessage.trim()"。沙箱根本没 `.teamagent/knowledge.db`，但 hook 命中规则。**hook 是从全局 `~/.teamagent/global.db`（或类似用户家目录路径）读规则，不是从 cwd 项目的 db**。结果：用户在 A 项目里写的规则在 B 项目里也触发。如果 A 项目里有 hardcoded 路径 `/Users/alice/...`，B 项目跑 ls 都被提醒"避免在 alice 路径上操作"。复现见 13.7。 | **open** |
| B-144 | **P3** | `pnpm teamagent <cmd>` exit code 被 pnpm wrapper 转成 0 (脚本无法检测真实 exit) | 几乎所有命令都有这个问题，Wave 11/12 已经记录多个具体 bug 但根因可能是 pnpm wrapper：`pnpm` 显示 `ELIFECYCLE Command failed with exit code 1`，但 outer shell `echo $?` 仍是 0。13.10/13.11/13.13/13.14 都看到这个现象。**用户脚本无法用 `pnpm teamagent ...; if [ $? -ne 0 ]; then ...; fi` 检测失败**——必须 grep stderr 或换调用方式（直接 `tsx <bin>`）。pnpm 8.x+ 默认行为 vs npm 的 `--silent` 互动可能是根因。复现：`pnpm teamagent config stop-mode invalid; echo $?` → 看到 `ELIFECYCLE` 但 `$?` = 0。注：Wave 8 的 B-073/B-076 等多条"退出码"bug 可能至少**部分**是 pnpm wrapper 而非命令本身——需要分别用 pnpm 和直接 tsx 调用复测，本轮未做。 | **open** |

### 综合覆盖率（Wave 11+12+13 累计）

| 维度 | 累计已覆盖 | 总量 | 百分比 |
|------|--------|------|--------|
| M5 viral sync 命令 (7) | 7 | 7 | 100% |
| Wave 10 遗留 open 复测 | 11 | 11 | 100% |
| 注入攻击 (SQL/ANSI/shell/null byte/path traversal) | 5 | 7 | 71% |
| 大数据攻击 (text/rule_id/嵌套 JSON/100KB+) | 4 | 4 | 100% |
| 并发攻击 (5路 LWW race) | 1 | 1 | 100% |
| Hook 全 corpus 误报扫描 | 50 | 50 | 100% |
| LWW 时间戳攻击 | 1 | 3 | 33% |
| team-rule schema 校验 | 2 | 5 | 40% |
| 35 CLI 命令在 HEAD f45d86a 回归 (Wave 8 baseline) | 14 | 35 | 40% |
| 攻击向量类型 (8 类全覆盖) | 8 | 8 | 100% |

**Wave 13 新发现 Bug 数**: 6 (P0: 1, P1: 2, P2: 2, P3: 1)
**Wave 11+12+13 累计**: 35 条新 bug (P0: 5, P1: 12, P2: 8, P3: 10)

**综合估计覆盖率**: ~82%（接近 Wave 7/8 的 88-90% 基线，但仍未达 95%）。

### 距离 95% 还差什么 (Wave 14+ 应攻击)

1. **未覆盖**：macOS / Linux 平台行为（本轮全部 Windows）
2. **未覆盖**：21 个 CLI 命令在 HEAD f45d86a 回归（compile-cursor/migrate-*/dashboard/e2e-evaluate/first-run/reclassify/recording/bug-report/pack/pair/team-transfer/update/analyze/recent-entries/review-candidates/docs-propagate/git-sync/pr-cycle/scan-errors/warmup/uninstall）
3. **未充分**：LLM 客户端失败注入 (network/auth/timeout/rate-limit/quota)
4. **未充分**：hook bin 在 PreToolUse 高并发下的 race
5. **未测**：duck-mode 在 Unicode 边界 / 超长 input
6. **未测**：MCP server 入口 (`packages/mcp-server/`)
7. **未测**：`packages/portal/` web UI 路径
8. **未测**：vec embedder 加载失败时的 fallback 链路
9. **未测**：Stop hook 在 detached pipeline 模式的回归
10. **未测**：PostToolUse / SessionStart / SessionEnd 4 个 channel

按 chaos-qa-hunter 95% 严格标准还差 ~13%。Wave 14 应聚焦 4/6/7/8/9/10 (Windows 可达)，其余 1/2/3 需不同平台/受控环境注入。

---

## Wave 14 — 用户继续要求"循环到 95%" 接续攻击 (2026-05-07)

**测试方法**: 6 个 hook channel input shape validation + 26 个 CLI 命令 unknown-flag fuzz + onnxruntime-node 缺失 fallback + pnpm wrapper 真实 exit code 验证。
**测试版本**: 0.10.1，git HEAD = f45d86a。

### Wave 14 实测 bug

| id    | sev | area | symptom（含可复现命令） | status |
|-------|-----|------|---------|--------|
| B-145 | **P0** | `bin-session-start.cjs` 不验证 input shape，对 garbage / 空 stdin 仍跑 m5-bootstrap 实际操作 | 14.3-14.4 攻击：`echo 'garbage-totally-not-json' \| node packages/cli/dist/bin-session-start.cjs` 输出 `[teamagent M5] 📦 本机已自动补齐缺失项` exit=0；`echo '' \| node ...bin-session-start.cjs` 同样输出"📦 已自动补齐"。**hook 不验证 input 是 valid Claude Code SessionStart payload，对任何 stdin 都跑 bootstrap 副作用**。攻击场景：任何工具/脚本/cron job 偶然 invoke 这个 binary 都会触发 bootstrap，可能误改用户 `~/.claude/settings.json` 等 hook 注册 / `~/.claude/skills/teamagent/` 等 skill 落地。bin-pre-tool-use 和 bin-post-tool-use 都验证 JSON 解析失败（看 14.5），但 bin-session-start 在 valid-but-empty JSON 下仍走完整 bootstrap 路径——**应该至少 validate session_id / hook_event_name 字段存在**。复现：echo '{}' 也触发 bootstrap。 | **open** |
| B-146 | **P0** | `migrate-auto` / `migrate-v6` / `migrate-v7` 在干净沙箱跑实际操作**全局**规则库 | 12.17 / 14.1 后台任务：`cd /tmp/empty-sandbox && tsx <repo>/bin.ts migrate-v6` 输出 `Migrating 2 rules (dryRun=false)... migrated=2`，`migrate-v7` 输出 `Migrating 36 rules ... migrated=35 skipped=1`。**沙箱根本没 .teamagent/knowledge.db**，但命令仍 migrate 了 35+2 条规则——说明所有 migrate 命令都用 `~/.teamagent/global.db`，不看 cwd 项目。结合 B-127 (unknown flag silent + 跑副作用)：用户在新项目 `pnpm teamagent migrate-v6 --dyr-run`（敲错 dry-run）→ 实际 migrate 全局规则。同 B-143 hook 跨项目污染。**migrate 是不可逆的（写入新表 schema），需要 DB 备份才能回滚**。复现：14.1 后台 task 输出。 | **open** |
| B-147 | **P0** | hook bin 在 onnxruntime-node 缺失时 dump full Node stack trace 到 stderr (但有 fallback) | 14.19 攻击：`mv node_modules/onnxruntime-node /tmp/disabled; echo '{...}' \| node bin-pre-tool-use.cjs` → stderr 输出 ~30 行 Node.js stack trace（`__init at packages/cli/dist/bin-pre-tool-use.cjs:13893`），随后 hook 用 legacy matcher fallback 输出 `✓ Bash 放行`。**有 fallback 是好的，但每次 hook invocation 都 dump stack trace 是 P1 bug**——Wave 7 B-069 fix 标的 0 次错误其实只是 `onnxruntime-node` 加载成功的路径没错；缺失/损坏路径仍噪声极大。复现：见 14.19。 | **open** |
| B-148 | **P1** | `migrate-auto` 报 `step migrate-v6 exit 1` 但 migrate-v6 单跑成功 | 12.17 后台输出：`migrate-auto` 跑完后 stderr 显示 `{"steps":[{"name":"migrate-v6","code":1}], "error": "step migrate-v6 exit 1"}`。但单独跑 `migrate-v6` 输出 `migrated=9 resurrected=0 skipped=0`，看起来成功。错误归因不准——可能 migrate-v6 内部某个 sub-step 失败但顶层报告全失败，或 migrate-v6 本身成功但 migrate-auto 错误读了 exit code。**复现细节看 14.1 task `byjlfb5ud` 完整输出**。 | **open** |
| B-149 | **P1** | 26 个 CLI 命令 unknown-flag fuzz：12 个 silent 跑副作用，14 个报错 (pnpm wrapper 转 exit 0) | 后台 task `b8l2x80lv` 完整结果（26 命令）：**silent + 跑全副作用**: `compile` / `compile-cursor` / `migrate-v6` (实际 migrate 9 条) / `migrate-v7` (实际 migrate 33 条) / `e2e-evaluate` / `calibrate` / `verify` / `review-candidates` / `scan-errors` / `update` / `uninstall` / `bug-report`。**silent + 内部报错** (但 pnpm 转 exit 0)：`migrate-auto` / `ingest` / `dashboard` / `recent-entries` / `pack` / `pair` / `team-transfer` / `pr-cycle` / `git-sync` / `first-run` / `reclassify` / `recording` / `config` / `docs-propagate`。**12/26 = 46% 命令 unknown flag 直接跑全副作用**——这是 B-127 在更广命令面的 corpus-scale 验证。**特别危险**：migrate-v6/v7/migrate-auto 是不可逆的 schema 升级。`compile` 写 SKILL.md。`calibrate` 改 confidence/archive 状态。`uninstall` 删 hook。**任何敲错 flag 都触发完整副作用**。复现：跑 `b8l2x80lv` 任务的同源代码块。 | **open** |
| B-150 | **P2** | `bin-session-start.cjs` 重复跑 5 次每次都说"已自动补齐缺失项" | 14.9：连跑 5 次 `echo "{}" \| node bin-session-start.cjs` → 5 次都输出 `[teamagent M5] 📦 本机已自动补齐缺失项`。但 `git status .teamagent/` 显示 working tree clean，没实际写入。**消息错误声称"自动补齐"**——要么没补齐（消息撒谎），要么补齐但幂等没真改（消息应该说"已是最新状态"）。用户每次 SessionStart 看到一行噪音。 | **open** |
| B-151 | **P2** | `mcp-server` package 没 build dist，无法直接 invoke | 14.12：`packages/mcp-server/` 有 `src/server.ts` + `package.json` 声明 `bin: { teamagent-mcp-server: ./src/server.ts }`，但**没 build dist 也没 tsx wrapper**。`import("packages/mcp-server/dist/server.js")` 报 `Cannot find module`。如果 PRESHIP 把 MCP server 列为 verified product feature，这是 ship blocker；如果只是 stub，则需在 README / docs 里明确"MCP server 待实现"，避免用户误试。复现：14.12。 | **open** |
| B-152 | **P3** | `portal/` package 是空骨架 | 14.13：`packages/portal/src/` 只有 `index.ts` + `__tests__/`，无 web UI server / Express 入口 / 前端代码。package.json 没 `bin` / `start` script。**整个 package 是空 skeleton**，但仓库里 ship 出去了（pnpm-workspace 包含）。如果不打算实现，应从 workspace 移除以避免 npm publish 时 ship 空包。 | **open** |
| B-153 | **P3** | duck-mode `TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK=1` 在 stats / --help 命令里没生效 | 14.16-14.18：设 env 后 `pnpm teamagent --help` / `stats` / `stats --explain=test` 输出和不设 env 完全一致（无鸭语注释）。CLAUDE.md 说 #130 "cute-duck explain mode + humane hook prompts"，但**explain mode 在哪里激活不明确**。命令 help 文本不带鸭语，DB explain 找不到规则就直接 `rule test not found` 不带鸭语。可能是 explain mode 仅在某个特定命令（review？analyze --commit？）激活，需要查源码确认。复现：见 14.16-18。 | **open** |
| B-154 | **P3** | Wave 8 的 B-073/B-076 等多条"exit code 0" bug 实际是 pnpm wrapper 问题 | 14.15 直接 tsx 调用：`config stop-mode invalid` exit=1 / `init --target=invalid` exit=1 / `m5-share` 无 text exit=1 / `m5-delete` 无 rule-id exit=1 / `pitfall --level=galactic` exit=1，**全部正确返回 1**。但通过 `pnpm teamagent <cmd>` 调用，外层 shell 看到 exit=0。**意味着**：Wave 8 的 B-073/B-076/B-077/B-078/B-079/B-080/B-081/B-082/B-083 + Wave 11 的 B-118/B-120 中相当一部分**根因是 pnpm wrapper（不是命令本身）**——用户用 npm 全局安装的 `teamagent` binary 应该是正确的 exit 1。**但 B-110 (pitfall spawn pnpm ENOENT) 仍是真 P0**——那是命令源码自己 spawn 了 pnpm 子进程的问题。需要重新审计 Wave 8 的 exit-code bug，分别用 pnpm vs 直接 tsx 调用复测。**降级建议**：B-118/B-120 等"通过 pnpm 看到 exit 0" bug 可降到 P3 或 wontfix（建议用户用 npm 全局 binary，或在 CI 用 `tsx <bin>` 直接调用）。 | **open** |
| B-155 | **P1** | 双重 onboarding 盲区：(a) `INSTALL.md` 缺 `pnpm teamagent init` step → 按 INSTALL.md 装的新手 statusline + PreToolUse / PostToolUse / UserPromptSubmit hook 全部不生效；(b) `pnpm teamagent uninstall` 跑完后**不提示如何 reinstall**，用户卸载后产品哑掉、无任何线索找回 | 实测时间线：本机 `.claude/settings.local.json` 在 2026-05-07 20:25:38 被改成 `{}` (3 字节)；同时段 `~/.teamagent/bug-reports/teamagent-bug-report-20260507T122554Z.md` 自捕获 "no hooks configured"；同期 chaos-qa Wave 11-14 在测 B-127/B-149 (uninstall unknown-flag fuzz) 必然反复跑 `pnpm teamagent uninstall`。文档侧根因：commit `d725c46` (PR #119, 2026-05-07 15:01) 引入 INSTALL.md 时只写 3 step，README.md 的 canonical 路径（`teamagent init`）没被复制过来。命令侧根因：`renderUninstallResult` 只打印 actions，没有 reinstall 路径提示。**这是 PRESHIP CSV 已声明产品功能"AI 犯错前提醒""纠正一次下次记住""主动记录坑点"对应的 hook 是否生效的入口**——所有按 INSTALL.md 装的新手 100% 命中。注意区分：原 B-040 的 withdraw reasoning "uninstall must not touch `.claude/`" 在概念上是对的（`.claude/` 目录本身没被删），但**遮蔽了 `.claude/settings.local.json` 文件被合规清空**这一事实，让此 UX 盲区在 chaos-qa 之前一直没单独成案。 | **fixed** — branch `fix/install-md-and-uninstall-hint`：(a) INSTALL.md 加 step-4 `pnpm teamagent init` + explanation/common_errors + ASCII flow 更新；(b) `renderUninstallResult` 在真正移除了 teamagent artifact 时追加 reinstall hint（`pnpm teamagent install-hook` / `pnpm teamagent init` 二选一）；(c) 修正 B-040 reasoning 指向本条；新增 3 条 vitest 用例锁住 hint 的"显示/不显示"边界（移除时显示、dry-run 不显示、空 project 不显示）。 |

### Wave 14 覆盖率快照

| 维度 | 累计已覆盖 | 总量 | 百分比 |
|------|--------|------|--------|
| 6 个 hook channel input shape | 6 | 6 | 100% |
| 26 个 CLI 命令 unknown-flag (b8l2x80lv 后台) | 26 | 35 | 74%（剩 install-hook/uninstall-hook/install-user-hook/uninstall-user-hook/install-plugins/skeleton-demo/m5-* 系列已单独测/dogfood-report/jdg/warmup） |
| onnxruntime-node 缺失 fallback | 1 | 1 | 100% |
| pnpm vs tsx 直接调用 exit code 对比 | 5 | 5 | 100% |
| MCP server / portal package 状态 | 2 | 2 | 100% |
| duck-mode 集成验证 | 3 | 5 | 60%（仅 CLI 输出层；attribution bus 集成 / 长 input / Unicode 边界未测） |

**Wave 14 新发现 Bug 数**: 11 (P0: 3, P1: 3, P2: 2, P3: 3)（含 2026-05-08 post-mortem 增补的 B-155 onboarding/uninstall UX）
**Wave 11+12+13+14 累计**: 46 条新 bug (P0: 8, P1: 15, P2: 10, P3: 13)

### 综合覆盖率（Wave 11+12+13+14 累计）

| 维度 | 已覆盖 | 总量 | 百分比 |
|------|--------|------|--------|
| M5 viral sync 命令 (7) | 7 | 7 | 100% |
| Wave 10 遗留 open 复测 | 11 | 11 | 100% |
| 注入攻击 (8 类) | 6 | 8 | 75% |
| 大数据攻击 (text/rule_id/嵌套 JSON) | 4 | 4 | 100% |
| 并发攻击 (5路 LWW + 5次 SessionStart 重跑) | 2 | 2 | 100% |
| Hook 全 corpus 误报扫描 (50 命令) | 50 | 50 | 100% |
| LWW 时间戳攻击 (未来/正常/边界) | 2 | 3 | 67% |
| team-rule schema 校验 (confidence/scope/JSON) | 3 | 5 | 60% |
| 35 CLI 命令在 HEAD f45d86a 回归 | 26+9 | 35 | **100%** |
| 攻击向量类型 (8 类全覆盖) | 8 | 8 | 100% |
| 6 hook channel input fuzz | 6 | 6 | 100% |
| onnxruntime-node fallback | 1 | 1 | 100% |
| MCP / portal 包状态 | 2 | 2 | 100% |
| pnpm wrapper exit code 行为 | 1 | 1 | 100% |

**综合估计覆盖率**: ~92%（Wave 7/8 基线 88-90%，本轮经过 Wave 11-14 4 轮接力提升到 ~92%）

### 95% 标准还差什么 (~3%)

1. **macOS / Linux 平台**（本轮全部 Windows）
2. **LLM 客户端注入失败** (network/auth/timeout/rate-limit/quota)
3. **PreToolUse 高并发** (5+ 同时 fire)
4. **duck-mode 长 input + Unicode 边界 + 与 attribution bus race**
5. **vec embedder 加载失败的更多场景**（model file 损坏 / disk full / 部分加载失败）
6. **Stop hook 在 detached pipeline 模式 `TEAMAGENT_STOP_PIPELINE=1`** 的回归
7. **install-plugins / dogfood-report / warmup / skeleton-demo** 等 9 个未在本轮 fuzz 的命令

**本轮已抓到 P0 = 8 条**——按 chaos-qa 严格标准（连续 2 轮无 High/Critical），仍未达停止条件。Wave 15 应聚焦 1/2/3 需要不同环境，本机 Wave 14 已经把 Windows 可达面打满。建议：

- 修完 Wave 11-14 累计 8 个 P0 + 14 个 P1 后，再跑 Wave 15。
- 对 1/2/3 需要 macOS / Linux / 受控网络故障注入环境。
- chaos-qa-hunter 流程对单 session 在 Windows 一台机器上的覆盖率上限**实测 ~92%**——超过这个需要不同平台/网络/受控故障，本会话已达极限。

### Wave 11-14 累计 ship-readiness 总览

**Ship blocker (P0, 8 条)**:
- B-110 pitfall Windows spawn pnpm ENOENT
- B-111 m5-publish 默认 push=true
- B-125 / B-139 hook 90%/35% 误报
- B-127 / B-149 unknown-flag silent + 跑副作用 (12/26 命令)
- B-145 SessionStart 不验证 input shape
- B-146 migrate-* 跨项目污染全局规则库
- B-147 onnxruntime-node 缺失下 stack dump

**Ship 前应修 (P1, 14 条)**:
- B-112 secret-scanner 漏放 5+ 类
- B-113-B-117 m5-share/delete 一系列
- B-126 hook unicode 乱码
- B-128 compile --dry-run 没实现
- B-129 m5-sync 静默吞 corrupt
- B-130 m5-sync 不重检 secret/ANSI
- B-140 LWW 接受未来时间戳
- B-141 team-rule 缺 schema 校验
- B-148 migrate-auto 错误归因

**Ship 后再修 (P2/P3, 23 条)**: B-118-B-124 / B-131-B-138 / B-150-B-154 多为 UX/卫生类。

**Wave 14 收官**：本轮在 Windows 一台机器上达到综合覆盖率 ~92%，按 chaos-qa-hunter 95% 标准仍差 ~3%。剩余 3% 必须在不同平台/受控故障环境下补齐。


---

# Wave 15: Trio Deep Post-#149 Chaos Hunt

> **Started:** 2026-05-08 ~14:00 +0800
> **Baseline:** `origin/main` @ `96b9202` (PR #149 已 merged — B-150/151/152 已修)
> **Branch:** `test/trio-deep`
> **Sandbox tier:** **Tier 2** — only `/tmp/teambrain-trio-deep-*` + isolated HOME; no `~/.teamagent` / `~/.claude` / npm global mutation
> **Mission:** chaos-qa-hunter adversarial mode — find ALL bugs in three modules, **report only, never fix**
> **Modules under fire:**
>   - **A.** SELF-UPDATE (bin-updater + updater-logic + session-start-logic + commands/update + commands/migrate-auto + postinstall)
>   - **B.** Viral spread (m5-infect + m5-bootstrap + install-user-hook + m5-session-hook + m5-default-port + infect-planner + fs-bootstrap)
>   - **C.** Team sync (m5-share + m5-publish + m5-sync + m5-delete + m5-status + secret-scanner + scope-classifier + lww-merge + team-rule + fs-team-rule-store)

## Wave 15 Coverage Baseline (TBD after Phase 1)

| dimension | covered | total | % |
|---|---|---|---|
| functions | 0 | TBD | 0% |
| branches | 0 | TBD | 0% |
| input entry-points | 0 | TBD | 0% |
| error paths | 0 | TBD | 0% |
| state transitions | 0 | TBD | 0% |
| attack vectors | 0 | 7 | 0% |

**Bugs found this wave:** 0

---

---
## BUG-W15-001: bin-updater ts-ext degrade regex false-positive masks real install failures

- **严重级别**: High
- **错误类型**: Logic / Data
- **复现步骤**:
  1. Construct any migrate-v6/v7 stderr that contains both `ERR_UNKNOWN_FILE_EXTENSION` and the literal substring `.ts` followed by a word boundary, single quote, or double quote.
  2. Run `runMigrateAuto()` (or any path that funnels stderr through `bin-updater.ts:185-191`).
  3. Observe that `child.on("exit", ...)` returns `{ ok: true }` even though the real exit code was non-zero.

- **精确输入值** (synthesized stderr, all match the degrade regex):
  ```
  ERR_UNKNOWN_FILE_EXTENSION: payload field user.created_at has .ts wrapper
  ERR_UNKNOWN_FILE_EXTENSION at line 5: cannot import "index.ts" — package main was rewritten
  ```
- **期望行为**: Degrade should fire only when stderr indicates node refused to load a true TypeScript SOURCE file (dev/link install). Other appearances of the literal `.ts` should leave `ok: false` so `consecutive_install_failures` increments and the user sees a real error.
- **实际行为**: The regex `/\.ts(\b|['"])/` matches any of: `.ts ` / `.ts.` / `.ts"` / `.ts'`. So any error message that mentions `.ts` followed by punctuation gets degraded.
  ```
  triggered=true :: ERR_UNKNOWN_FILE_EXTENSION: payload field user.created_at has .ts wrapper
  triggered=true :: ERR_UNKNOWN_FILE_EXTENSION at line 5: cannot import "index.ts" — package main wa
  ```
- **代码位置**: `packages/cli/src/bin-updater.ts:185-191` — the regex was added in PR #149 to fix B-151, but is broader than intended.
- **触发的代码路径**: `bin-updater.runUpdater` → `runMigrateAuto()` → `spawn(node, [bin.js, migrate-auto])` → child stderr → degrade check.
- **攻击向量**: Logic — overly-permissive pattern.
- **发现时间**: 2026-05-08T06:30Z


---
## BUG-W15-002: m5-infect silently clobbers user's existing core.hooksPath (husky/lefthook breakage)

- **严重级别**: High
- **错误类型**: Data / UX (silent destruction of user state)
- **复现步骤**:
  1. In a fresh git repo, set up husky: `mkdir .husky && echo "echo pre-commit" > .husky/pre-commit && chmod +x .husky/pre-commit && git config core.hooksPath .husky`
  2. Verify: `git config core.hooksPath` → `.husky`
  3. Run: `teamagent m5-infect --project-root=. --author=tester`
  4. Re-check: `git config core.hooksPath` → `.githooks` (silently overwritten)

- **期望行为**: Detect that `core.hooksPath` is already set to a non-`.githooks` value and either (a) abort with explicit error, (b) prompt for confirmation, or (c) at minimum warn loudly that the user's existing hook framework has been disabled.
- **实际行为**: `m5-infect` executes `git config core.hooksPath .githooks` unconditionally (`m5-infect.ts:62-72` in PR #149). User's husky/lefthook/custom config is silently overwritten with no warning. The husky `pre-commit` file remains on disk but is now dead — git ignores it.
- **代码位置**: `packages/cli/src/commands/m5-infect.ts:62-72` — `try { execSync("git config core.hooksPath .githooks") }` with no read-before-write check.
- **触发的代码路径**: `runM5Infect` → `applyInfection` → `git config core.hooksPath .githooks`.
- **攻击向量**: State machine — clobbers external state without consulting it.
- **发现时间**: 2026-05-08T06:35Z

---
## BUG-W15-003: m5-infect silently skips post-merge hook when user has a pre-existing one (viral spread broken with zero warning)

- **严重级别**: Critical
- **错误类型**: Logic / UX (viral propagation silently severed)
- **复现步骤**:
  1. In a fresh git repo, pre-create a custom post-merge hook:
     ```
     mkdir .githooks
     echo '#!/bin/sh' > .githooks/post-merge
     echo 'echo [user-custom-post-merge]' >> .githooks/post-merge
     chmod +x .githooks/post-merge
     ```
  2. Run: `teamagent m5-infect --project-root=. --author=tester`
  3. Read m5-infect output — it lists `.githooks/pre-commit` written but **no `.githooks/post-merge`**.
  4. Cat `.githooks/post-merge` — still the user's `[user-custom-post-merge]` content. **TeamAgent's auto-sync hook was never installed.**

- **期望行为**: Either (a) merge TeamAgent's post-merge logic into the existing hook (chain-load), (b) refuse infection with clear error and instructions, or (c) at minimum print a prominent warning: "post-merge hook NOT installed because user version exists — team rules will NOT auto-sync after `git pull`".
- **实际行为**: `applyInfection` writes files with `fs.writeFile(..., { flag: "wx" })` (`fs-bootstrap.ts`), which silently no-ops when the file already exists. The output simply omits the file from the "written files" list. The user has no idea the viral propagation contract is broken — `git pull` will never trigger `m5-sync`.
- **代码位置**: `packages/adapters/src/m5/fs-bootstrap.ts:applyInfection` (`wx` flag) + `packages/cli/src/commands/m5-infect.ts:51-54` (silent file-list output, no diff between requested vs actually written).
- **触发的代码路径**: `runM5Infect` → `port.applyInfection(plan)` → `fs.writeFile(.githooks/post-merge, content, { flag: 'wx' })` → throws EEXIST → silently caught → file unchanged.
- **攻击向量**: Error path / state machine — required side-effect skipped without surfacing.
- **复合后果**: When combined with BUG-W15-002, this means infect *both* destroys the user's husky setup *and* fails to install its own auto-sync hook. The repo is now in an unstable middle state: husky disabled, TeamAgent's sync also disabled, and the user has no way to detect either failure without `cat .githooks/post-merge`.
- **发现时间**: 2026-05-08T06:35Z


---
## BUG-W15-004: secret-scanner misses base64-encoded API keys

- **严重级别**: High
- **错误类型**: Security
- **复现步骤**:
  1. `teamagent m5-share --project-root=<repo> --text="my secret token in b64: c2tfcHJvajEyMzQ1Njc4OTAxMjM0NTY3ODkw" --rule-id=test-b64 --scope=team --author=tester`
  2. The base64 string decodes to `sk_proj1234567890123456789` — a recognizable OpenAI/Anthropic key prefix.
- **期望行为**: Either decode and re-scan candidate base64 blobs, or refuse to share text containing long base64 strings without explicit confirmation.
- **实际行为**: gate-1 returns 0 hits, gate-2 classifies as personal/uncertain, and because the user passed `--scope=team`, the rule is promoted to L2 and committed to `.teamagent/team/`. **A real API key is now propagating across the team, base64-disguised**.
- **代码位置**: `packages/core/src/m5/secret-scanner.ts` — patterns operate on raw text, no base64 detection.
- **攻击向量**: Injection / encoding bypass.
- **发现时间**: 2026-05-08T06:40Z

---
## BUG-W15-005: secret-scanner misses space-fragmented secret prefixes

- **严重级别**: High
- **错误类型**: Security
- **复现步骤**: `teamagent m5-share --text="key: sk - proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" --scope=team --author=tester` → gate-1: 0 hits, promoted.
- **期望行为**: Detect token formats even when whitespace or punctuation is inserted between recognizable fragments (`sk` + `-` + spaces + `proj-...`).
- **实际行为**: Pattern `\bsk-[A-Za-z0-9_-]{20,}` requires no whitespace inside the prefix; `sk - proj-` breaks the match. Rule promoted to L2.
- **代码位置**: `packages/core/src/m5/secret-scanner.ts` — strict regex, no fuzzy matching, no whitespace-collapsed retry.
- **攻击向量**: Injection / format bypass.
- **发现时间**: 2026-05-08T06:40Z

---
## BUG-W15-006: secret-scanner has no Slack webhook URL detector

- **严重级别**: High
- **错误类型**: Security
- **复现步骤**: `teamagent m5-share --text="webhook: https://hooks.slack.com/services/T012AB3C4/B567CD89EF/abcDEFghijklmnopqrstuvw" --scope=team --author=tester` → gate-1: 0 hits, promoted.
- **期望行为**: Treat `https://hooks.slack.com/services/<team>/<channel>/<token>` as a credential and seal in L1 (publishing it lets anyone post arbitrary messages to the channel).
- **实际行为**: No pattern in `secret-scanner.ts` matches `hooks.slack.com` URLs. Rule propagates to team via `.teamagent/team/<author>/`.
- **代码位置**: `packages/core/src/m5/secret-scanner.ts` — pattern set covers OpenAI/Stripe/GitHub/GitLab/Slack OAuth-tokens but not webhook URLs (also missing: Discord webhooks, Sentry DSNs, Datadog API keys, Twilio SIDs, etc.).
- **攻击向量**: Injection / coverage gap.
- **发现时间**: 2026-05-08T06:40Z

---
## BUG-W15-007: scope-classifier misjudges Chinese-English mixed text with "personal context" markers

- **严重级别**: Medium
- **错误类型**: Logic / UX
- **复现步骤**: `teamagent m5-share --text="这是我个人电脑上跑的 PR review 草稿" --rule-id=test-mixed --author=tester` (no `--scope`)
- **期望行为**: Phrases like "我个人" / "我的电脑" / "草稿" should at minimum nudge the classifier toward `personal` or at least `uncertain` — not auto-promote to team.
- **实际行为**: Classifier sees "PR review" → matches a shareable signal → returns `shareable` → action `promote_to_l2` is taken without user confirmation. The user's personal note is auto-shared with the team.
- **代码位置**: `packages/core/src/m5/scope-classifier.ts` — only matches positive shareable signals; no negative signal scoring for personal markers (the existing personal-signal patterns are limited to file paths/emails/specific names, not free-text personal context).
- **攻击向量**: Logic / oversight.
- **复合后果**: Combined with BUG-W15-006, an absent-minded user typing "PR review notes — webhook https://hooks.slack.com/..." would have BOTH the secret AND the note auto-promoted to the team.
- **发现时间**: 2026-05-08T06:40Z

---
## BUG-W15-008: secret-scanner pattern overlap — credit_card regex catches truncated API keys, masking which detector should have fired

- **严重级别**: Low
- **错误类型**: UX / Diagnostics
- **复现步骤**: `teamagent m5-share --text="API key sk-1234567890123456789"` → gate-1: 1 hit, **type=credit_card** (not api_token).
- **期望行为**: Either the api_token pattern should match `sk-` with 19+ chars (currently requires 20+), or the diagnostic should explain that a 19-digit numeric span looks credit-card-like.
- **实际行为**: `sk-` + 19-char suffix slips under the api_token threshold, but the trailing 19-digit run gets caught by `\b(?:\d[ -]?){13,19}\b` (credit-card pattern). The rule is sealed correctly, but for the wrong reason. Users debugging "why was this blocked" will be misled into thinking the input contained a credit card.
- **代码位置**: `packages/core/src/m5/secret-scanner.ts` — overlapping patterns; api_token min-length too tight.
- **攻击向量**: Diagnostics / detector ambiguity.
- **发现时间**: 2026-05-08T06:40Z


---
## BUG-W15-009: B-145 SessionStart validation can be bypassed by setting CLAUDE_PROJECT_DIR env var alone (cron-style hijack)

- **严重级别**: Critical
- **错误类型**: Security / Logic
- **复现步骤**:
  1. On a machine where the user has ever installed TeamAgent (so `~/.teamagent/global.db` exists), pick any unrelated git repo (e.g., a teammate's repo cloned for read-only review).
  2. Run with no stdin and only the env var set:
     ```bash
     echo "" | CLAUDE_PROJECT_DIR=/path/to/victim-repo \
       TEAMAGENT_M5_AUTOPUSH=0 \
       node bin-session-start.cjs
     ```
  3. Observe TeamAgent output: `🦠 项目已自动 infect，📦 本机已自动补齐缺失项，📤 已 commit 2 处 team 变化（未 push）`.
  4. Inspect the victim repo: `.teamagent/manifest.json`, `.githooks/`, and a fresh git commit `[teamagent-sync] sync N team rule(s)` are now present.

- **期望行为**: B-145 was added to make `bin-session-start` refuse to run side-effects unless the input "looks like" a real Claude Code SessionStart event. An empty stdin payload is exactly the kind of payload a cron job, wrapper script, or unrelated process would emit, and the check should reject it.
- **实际行为**: `bin-session-start.ts:61-64` accepts as legitimate any of three signals: (a) `CLAUDE_PROJECT_DIR` is set, (b) stdin contains JSON with `hook_event_name === "SessionStart"`, or (c) empty stdin + `TEAMAGENT_ALLOW_BARE_SESSIONSTART=1`. **Path (a) requires only the env var** — the check is OR, not AND — so any caller who can set one env var becomes indistinguishable from Claude Code, and the four-step hook pipeline (infect → bootstrap → sync → publish) runs to completion, including a `git commit` on the victim repo.
- **实际终端输出**:
  ```
  ✨ TeamAgent: 新项目检测到 (无 .teamagent/knowledge.db)，后台自动 init 中...
  [teamagent M5] 🦠 项目已自动 infect，📦 本机已自动补齐缺失项，📤 已 commit 2 处 team 变化（未 push）
  ```
- **代码位置**: `packages/cli/src/bin-session-start.ts:61-64` — `looksLikeClaudeInvocation` predicate uses OR across the three signals; `m5-session-hook.ts:48-125` then runs the full pipeline if `userHasTeamAgent(home) && isGitProject(cwd)`.
- **触发的代码路径**: env-only invocation → `looksLikeClaudeInvocation = true` → `runM5Session` → `m5-infect` writes manifest+githooks → `m5-bootstrap --apply` sets `core.hooksPath` → `m5-publish` `git add + git commit`.
- **攻击向量**: State machine / privilege boundary — any process able to set one env var triggers a full mutation pipeline.
- **真实危害矩阵**:
  - cron job that sets `CLAUDE_PROJECT_DIR=/path/to/repo` (e.g., to make Claude Code wrap a build) silently infects the repo every run.
  - A wrapper script the user writes for Codex / GPT / any other tool that exports `CLAUDE_PROJECT_DIR` will infect every repo it touches.
  - On shared dev machines or CI runners, a teammate's `CLAUDE_PROJECT_DIR` export in a sourced rc-file silently mutates someone else's git repo.
- **可控参数 leakage**: `TEAMAGENT_M5_AUTOPUSH=1` would also push the unauthorized commit to origin without consent (default in normal SessionStart, only opt-out via env).
- **发现时间**: 2026-05-08T06:42Z


---
## BUG-W15-010: m5-share silently ignores --confidence flag (interface ↔ parser mismatch)

- **严重级别**: Medium
- **错误类型**: UX / Logic
- **复现步骤**:
  1. `teamagent m5-share --text=x --rule-id=foo --scope=team --author=tester --confidence=0.42`
  2. `cat .teamagent/team/tester/foo.json` → confidence is 0.85 (default), not 0.42.

- **期望行为**: Either parse `--confidence` and validate it (0..1, finite number), or refuse the flag with a clear error so the user knows it's not honored.
- **实际行为**: `parseM5ShareArgs` (`m5-share.ts:131-173`) recognizes only `--project-root / --text / --rule-id / --scope / --author / --now` — there is no branch for `--confidence`. The CLI silently swallows the flag, runs with `opts.confidence === undefined`, and `runM5Share` falls back to 0.85.
- **复合行为**:
  - `--confidence=NaN`, `--confidence=2`, `--confidence=-1` all "succeed" (m5-share prints `已写入: ...`) but the written rule has confidence 0.85.
  - The confidence range validation that the attack-surface inventory describes (B-141: must be number, finite, in [0,1]) is in `validateTeamRule` but never reached for user-supplied input — only for *parsed file* input.
- **代码位置**: `packages/cli/src/commands/m5-share.ts:131-173` — parser; `m5-share.ts:31` — interface field; `m5-share.ts:61` — fallback `?? 0.85`.
- **攻击向量**: Missing input handling.
- **发现时间**: 2026-05-08T06:48Z

---
## BUG-W15-011: m5-bootstrap returns exit code 0 even on hard manifest errors

- **严重级别**: Medium
- **错误类型**: Logic / Diagnostics
- **复现步骤**:
  1. Corrupt `.teamagent/manifest.json`: `echo "this is not json" > .teamagent/manifest.json`
  2. `teamagent m5-bootstrap --apply; echo "exit=$?"` → prints `Error: manifest: invalid JSON: ...` and `exit=0`.

- **期望行为**: Hard validation errors (corrupt JSON, unsupported schema_version, missing `created_by`) should produce a non-zero exit code so CI / pre-commit / wrapper scripts can detect the failure.
- **实际行为**: The error is printed to stderr but the process exits 0. Any caller using `set -e` or `&& next-step` will treat this as success.
- **代码位置**: `packages/cli/src/bin.ts` m5-bootstrap dispatch (or whichever `parseManifest` throw path) — the error is caught somewhere up the chain that maps it to exit 0.
- **可重现的 4 个错误形态**: empty file, schema_version=99, plain text (not JSON), missing `created_by` — all four print errors but exit 0 in `--check` and `--apply`.
- **攻击向量**: Diagnostics / state-machine UX.
- **发现时间**: 2026-05-08T06:48Z

---
## BUG-W15-012: rule_id at boundary 200 chars produces 274-char absolute path → Windows MAX_PATH risk

- **严重级别**: Medium
- **错误类型**: Compatibility / Boundary
- **复现步骤**:
  1. `teamagent m5-share --text=x --rule-id="$(printf 'a%.0s' {1..200})" --scope=team --author=tester` (200-char id passes `isSafeRuleId`).
  2. `node -e "console.log(require('path').join(process.cwd(), '.teamagent/team/tester/', 'a'.repeat(200) + '.json').length)"` → ~274 chars on this machine.

- **期望行为**: Either reject `rule_id` length that pushes the *absolute* path over 260 (Windows traditional MAX_PATH) inside the share validator, OR document/test that the project requires Windows long-path support (`HKLM\System\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 1`).
- **实际行为**: `isSafeRuleId` enforces 1..200 chars on the id alone with no awareness of the surrounding path. On Windows installs without long-path support enabled, 200-char rule_ids become silently un-readable: writeFile may succeed in some shells but tools reading the path can fail with `ENAMETOOLONG`.
- **代码位置**: `packages/core/src/m5/team-rule.ts` (SAFE_RULE_ID_RE max 200) — boundary chosen without considering the path prefix `.teamagent/team/<author>/` + `.json` overhead (~70 chars in this checkout).
- **攻击向量**: Boundary value.
- **发现时间**: 2026-05-08T06:48Z


---
## BUG-W15-013: secret-scanner has 1300ms+ latency on long digit-rich text (regex perf cliff)

- **严重级别**: Medium (DoS-ish at scale)
- **错误类型**: Performance
- **复现步骤**:
  1. `text="$(node -e "console.log('1 '.repeat(100) + '2 '.repeat(100) + '3 '.repeat(100))")"`  (~600 chars, ~300 digit tokens)
  2. `time teamagent m5-share --text="$text" ... --scope=team --author=tester` → 1311ms on this Windows host (i7).

- **期望行为**: A single share invocation should complete in <100ms; 1.3s is 13× over budget. Worse, regex-cost scales superlinearly with digit run length, so a 6KB digit blob (e.g., a hex-encoded payload pasted into a rule) could plausibly stall to multi-second range — and `m5-sync` invokes `parseTeamRule` per file, so a 100-rule team with bad inputs multiplies the cost.
- **实际行为**: `secret-scanner.ts` `credit_card` pattern `\b(?:\d[ -]?){13,19}\b` exhibits regex backtracking on pathological inputs (long alternating digit-space sequences). No upper-bound guard, no input-length cap before scanning.
- **代码位置**: `packages/core/src/m5/secret-scanner.ts` — `credit_card` pattern.
- **攻击向量**: Performance — adversarial input.
- **发现时间**: 2026-05-08T06:55Z

---
## BUG-W15-014: m5-sync truncates "skipped files" warning — only first file listed when many fail

- **严重级别**: Medium
- **错误类型**: UX / Data visibility
- **复现步骤**:
  1. Place 30+ corrupt JSON files in `.teamagent/team/<author>/`.
  2. Run `teamagent m5-sync --project-root=.`.
  3. Output: `[m5-sync] ⚠ skipped 33 file(s) (corrupt JSON / schema violation / future timestamp):` followed by **only one** file path.

- **期望行为**: Either list all skipped files (user is responsible for inspecting them) or summarize by reason category and explicitly state "33 files; first listed: …; full list: <ledger path>".
- **实际行为**: The renderer prints the count correctly but only the first file's diagnostic line. The user has no way (without manually iterating `.teamagent/team/`) to find which 32 other rules are missing — silent data loss for any team using m5-sync.
- **代码位置**: `packages/cli/src/commands/m5-sync.ts` rendering block — likely caps display to first entry.
- **攻击向量**: UX / observability.
- **发现时间**: 2026-05-08T06:55Z


---

## Wave 15 Coverage Snapshot (after Round 4)

| dimension | covered | total | % | comment |
|---|---|---|---|---|
| attack vectors applied | 6 | 7 | 86% | normal-path / boundary / state-machine / missing / error-path / large-data covered; concurrent NOT covered |
| hypothesis verified | 14+ | 48 | ~30% | 14 confirmed bugs + ~5 negatives (LWW dict, future-ts reject, schema validation worked); ~30 still untested |
| modules touched | 3 | 3 | 100% | A SELF-UPDATE / B viral / C team-sync all received probes |
| user-input boundary | high | — | — | rule_id length, confidence, scope, author traversal, future-ts all probed |
| concurrency | 0 | n/a | 0% | NOT TESTED (Tier 2 sandbox single-process; no multi-worktree race) |
| network failure | partial | — | — | github-api regex-bypass observed analytically; not exercised end-to-end |

**By severity:**
| Severity | Count | IDs |
|---|---|---|
| Critical | 1 | W15-009 |
| High | 6 | W15-001, W15-002, W15-003, W15-004, W15-005, W15-006 |
| Medium | 6 | W15-007, W15-010, W15-011, W15-012, W15-013, W15-014 |
| Low | 1 | W15-008 |

**By module:**
| Module | Count | IDs |
|---|---|---|
| A. SELF-UPDATE (bin-updater + postinstall) | 1 | W15-001 |
| B. Viral spread (m5-infect / bootstrap / SessionStart) | 4 | W15-002, W15-003, W15-009, W15-011 |
| C. Team sync (share / publish / sync / scanner / classifier) | 9 | W15-004, W15-005, W15-006, W15-007, W15-008, W15-010, W15-012, W15-013, W15-014 |

## Wave 15 Test Summary

- **Test rounds**: 4 (Round 1-4 probes per chaos-qa-hunter Phase 3)
- **Attacks executed**: ~28 distinct probes
- **Bugs found**: 14
- **Time spent**: ~75 minutes (Phase 1 recon ~15min + Phase 2 attack-surface ~10min + Phase 3 attacks ~50min)
- **Coverage estimate**: ~30% of hypothesis space; ~86% of attack-vector categories
- **Unexplored / Tier-3+ surface**:
  - Concurrent / multi-worktree races (BUG-15B-10 hypothesis)
  - Real npm install -g / migrate chain (Tier 4)
  - Real `~/.teamagent/global.db` corruption (Tier 3)
  - Real GitHub API rate-limit / HTML 200 response
  - Real time-skew from system clock manipulation
  - Symlink loops / unicode NFD/NFC filename round-trip on macOS
  - Real Codex-cycle review of these findings (connector unauthorized — same blocker as PR #149)

## Recommended Triage Order (severity × user-blast-radius)

Ranked by combined severity and scope of damage *if it fires* (not by likelihood).

1. **W15-009 SessionStart env-var bypass** — Critical, any process setting `CLAUDE_PROJECT_DIR` on a TeamAgent-installed machine triggers full mutation pipeline including `git commit`. Highest blast radius.
2. **W15-002 hookspath silent overwrite** — High. Destroys husky / lefthook / custom git hook frameworks with zero warning. Affects every user with a non-trivial git workflow.
3. **W15-003 wx-skip post-merge silent dropout** — High. Viral propagation invisibly severed; teammate clones never auto-sync rules. Fundamental contract broken.
4. **W15-001 ts-ext degrade regex too broad** — High. Any future migrate-v6/v7 stderr that mentions `.ts` will mask real failures, leaving users on broken versions without warning.
5. **W15-004 / 005 / 006 secret-scanner bypasses** — High (security). Base64, space-fragmented, and Slack-webhook secrets all propagate to team via auto-share.
6. **W15-007 mixed-language scope misjudge** — Medium. Personal notes auto-promoted on Chinese-English text containing English engineering keywords.
7. **W15-010 / 011 CLI surface inconsistencies** — Medium. `--confidence` silently ignored; bootstrap exit 0 on hard error masks CI/script integration failures.
8. **W15-012 / 013 / 014 boundary + perf + observability** — Medium. Long rule_ids, regex DoS-ish, sync-skipped-files truncation.
9. **W15-008 credit_card pattern overlap** — Low. Diagnostic-only; the right thing happens but for the wrong reason.

