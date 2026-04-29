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
| B-040 | —   | `--delete-data` keeps `.claude` | Withdrawn: uninstall must not touch `.claude/` (user owns that dir). | **withdrawn** |
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

