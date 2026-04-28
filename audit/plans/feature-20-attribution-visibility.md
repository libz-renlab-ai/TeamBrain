# Feature #20 非自证 Audit 草案：Attribution silent/smart/verbose 核心渲染

## 目标

验证 Attribution 可见性不是只靠单元测试自证，而是在真实 stdout / hook JSON 输出层面可观察：

- 同一类 `AttributionEvent` 在 `TEAMAGENT_VISIBILITY=silent|smart|verbose` 下产生不同 stdout。
- `pitfall` 路径真实经过 `parseVisibilityMode()`、`InMemoryAttributionBus`、`StdoutRenderer`，而不是测试里手写字符串。
- `StdoutRenderer` 的 smart 模式只显示 `highlight` / `warning`，不显示 `info`、`counterfactual`、raw events。
- verbose 模式显示 `counterfactual`，并在末尾附加 `--- raw events ---` 与原始 JSON。
- PreToolUse hook SDK 的 clean pass 在 verbose 下返回 `systemMessage`，在 smart/silent 下不返回；warn/block 命中不属于 clean-pass attribution 静默范围。

结论必须来自临时 cwd/home 下的真实命令输出、JSON parser、grep 断言；Vitest 只能作为补充。

## 源码追踪结论

调用链：

1. `packages/types/src/attribution.ts:7` 定义 `AttributionEvent`，其中 `userFacingValue` 是用户可见价值，`counterfactual` 注释明确“仅 verbose 模式显示”。
2. `packages/types/src/attribution.ts:44` 定义 `VisibilityMode = "silent" | "smart" | "verbose"`；`packages/types/src/attribution.ts:49` 默认值是 `verbose`。
3. `packages/types/src/attribution.ts:52` 的 `parseVisibilityMode()` 只接受三个合法值，无效值或未设置回退 `DEFAULT_VISIBILITY`。
4. `packages/ports/src/renderer.ts:7` 定义 `Renderer.render(events, mode)`，silent 模式应返回空串。
5. `packages/adapters/src/attribution/stdout-renderer.ts:53` 是核心渲染实现：`silent` 直接返回 `""`。
6. `packages/adapters/src/attribution/stdout-renderer.ts:56` smart 模式过滤 `severity === "info"`；verbose 模式保留所有事件。
7. `packages/adapters/src/attribution/stdout-renderer.ts:76` 只有 verbose 渲染 `counterfactual`。
8. `packages/adapters/src/attribution/stdout-renderer.ts:83` 只有 verbose 附加 `--- raw events ---` 和 `JSON.stringify(events, null, 2)`。
9. `packages/cli/src/commands/pitfall.ts:131` 在 `executePitfall()` 内从 `opts.env ?? process.env` 读取 `TEAMAGENT_VISIBILITY`。
10. `packages/cli/src/commands/pitfall.ts:181` 发出 `source: "pitfall"`、`severity: "highlight"` 的归因事件，包含 `before/after`、`userFacingValue`、`counterfactual`。
11. `packages/cli/src/commands/pitfall.ts:200` 创建 `StdoutRenderer`，把 bus drain 后的事件按 visibility 渲染为返回字符串。
12. `packages/cli/src/bin.ts:133` 的 `pitfall` 分支调用 `executePitfall()` / `runPitfallInteractive()`；`packages/cli/src/bin.ts:148` 只有返回字符串非空才写 stdout，所以 silent 的真实 stdout 应为空。

Hook SDK 调用链：

1. `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts:27` 的 `PreToolUseDeps.visibility` 接收 `silent|smart|verbose`。
2. `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts:46` clean pass 分支在无 matched 规则时落 `hook-pre.passed`。
3. `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts:67` 只有 `visibility === "verbose"` 时返回 clean-pass `systemMessage`，内容包含工具名、规则数、可选语义命中。
4. `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts:77` smart/silent clean pass 只返回 `{ permissionDecision: "allow" }`。
5. `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts:91` block 命中返回 `permissionDecisionReason`，`packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts:104` warn/suggest 命中返回 `systemMessage`。这不是 clean-pass attribution 展示，不能用 silent 期望它消失。
6. `packages/cli/src/bin-pre-tool-use.ts:193` 真实 PreToolUse 入口读取 `TEAMAGENT_VISIBILITY`；`silent|smart` 保留原值，其它值默认 verbose。
7. `packages/cli/src/bin-pre-tool-use.ts:211` 把 SDK 结果包进 `hookSpecificOutput`，并仅在存在 `systemMessage` 时写入顶层 `systemMessage`。

## 关键输出矩阵

同一条 highlight pitfall attribution：

| 模式 | stdout | 应出现 | 不应出现 |
| --- | --- | --- | --- |
| `silent` | 空 | 无 | `TeamAgent`、`添加知识条目`、`如果没有 TeamAgent`、`raw events` |
| `smart` | 归因块 | `TeamAgent`、`添加知识条目`、`知识库变化`、`传播到`、`下次体验` | `如果没有 TeamAgent`、`--- raw events ---`、JSON 字段名 |
| `verbose` | 归因块 + raw JSON | smart 全部内容、`如果没有 TeamAgent`、`--- raw events ---`、`"source": "pitfall"`、`"counterfactual"` | 无 |

同一条 info + highlight 混合 renderer 事件：

| 模式 | 判定 |
| --- | --- |
| `silent` | 输出长度为 0 |
| `smart` | 只出现 highlight 事件；不出现 info-only sentinel |
| `verbose` | highlight 和 info 都出现，并包含 raw events |

同一 clean-pass PreToolUse SDK 输入：

| visibility | JSON 判定 |
| --- | --- |
| `silent` | `permissionDecision === "allow"`，没有 `systemMessage` |
| `smart` | `permissionDecision === "allow"`，没有 `systemMessage` |
| `verbose` | `permissionDecision === "allow"`，`systemMessage` 包含 `TeamAgent`、工具名、`放行`、规则数；有 semantic hits 时包含命中详情 |

## Audit 工作区

所有写入放到 `/tmp`，不要在真实仓库根目录运行会写盘的 pitfall。

```bash
cd /Users/liushiyu/projects/TeamBrain

ROOT="$(mktemp -d /tmp/teamagent-attr-audit.XXXXXX)"
AUDIT_HOME="$ROOT/home"
AUDIT_CWD="$ROOT/repo"
AUDIT_OUT="$ROOT/out"
TEAMAGENT_TSX="/Users/liushiyu/projects/TeamBrain/node_modules/.bin/tsx"
TEAMAGENT_BIN="/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts"

mkdir -p "$AUDIT_HOME" "$AUDIT_CWD" "$AUDIT_OUT"
cat > "$AUDIT_CWD/CLAUDE.md" <<'EOF'
# Attribution audit

sentinel before
EOF
```

隔离规则：

- 始终设置 `HOME="$AUDIT_HOME"`，避免读写真实 `~/.teamagent/global.db` / `events.db`。
- 始终在临时 repo 里运行 pitfall：`cd "$AUDIT_CWD"`。
- 三个 visibility 模式最好各用一个独立 cwd/home 子目录，避免第二次运行的 `knowledgeCount` 因前一次写入而变化。
- 不写 `scripts/out/`，不运行 `scripts/claudefast-stream-json-tests.ts`。

## 路径 A：真实 CLI 跑 pitfall 三次

这条路径最接近用户命令，但会走真实 embedder best-effort。若本机没有模型缓存，可能触发模型加载/下载；失败不会阻断 pitfall，但运行时间会波动。

```bash
run_pitfall_mode() {
  mode="$1"
  mode_root="$ROOT/pitfall-$mode"
  mode_home="$mode_root/home"
  mode_cwd="$mode_root/repo"
  mkdir -p "$mode_home" "$mode_cwd"
  cat > "$mode_cwd/CLAUDE.md" <<'EOF'
# Attribution audit

sentinel before
EOF

  (
    cd "$mode_cwd"
    HOME="$mode_home" \
    TEAMAGENT_VISIBILITY="$mode" \
    "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" pitfall --non-interactive \
      --trigger='audit same trigger' \
      --wrong='use moment for tiny formatting' \
      --correct='use Intl.DateTimeFormat' \
      --reason='project avoids moment bundle cost' \
      --category=E \
      --tags=visibility
  ) > "$AUDIT_OUT/pitfall-$mode.stdout" 2> "$AUDIT_OUT/pitfall-$mode.stderr"
}

run_pitfall_mode silent
run_pitfall_mode smart
run_pitfall_mode verbose
```

外部断言：

```bash
test ! -s "$AUDIT_OUT/pitfall-silent.stdout"

grep -q 'TeamAgent' "$AUDIT_OUT/pitfall-smart.stdout"
grep -q '添加知识条目' "$AUDIT_OUT/pitfall-smart.stdout"
grep -q '知识库变化: 0 → 1 条' "$AUDIT_OUT/pitfall-smart.stdout"
grep -q '传播到:' "$AUDIT_OUT/pitfall-smart.stdout"
grep -q '下次体验:' "$AUDIT_OUT/pitfall-smart.stdout"
! grep -q '如果没有 TeamAgent' "$AUDIT_OUT/pitfall-smart.stdout"
! grep -q -- '--- raw events ---' "$AUDIT_OUT/pitfall-smart.stdout"
! grep -q '"counterfactual"' "$AUDIT_OUT/pitfall-smart.stdout"

grep -q 'TeamAgent' "$AUDIT_OUT/pitfall-verbose.stdout"
grep -q '添加知识条目' "$AUDIT_OUT/pitfall-verbose.stdout"
grep -q '如果没有 TeamAgent: 你会看到 AI 第二次再踩同一个坑' "$AUDIT_OUT/pitfall-verbose.stdout"
grep -q -- '--- raw events ---' "$AUDIT_OUT/pitfall-verbose.stdout"
grep -q '"source": "pitfall"' "$AUDIT_OUT/pitfall-verbose.stdout"
grep -q '"counterfactual": "你会看到 AI 第二次再踩同一个坑"' "$AUDIT_OUT/pitfall-verbose.stdout"
```

预期输出摘要：

```text
# silent
<empty stdout>

# smart
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ TeamAgent · 本次操作归因
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▸ 做了什么: 添加知识条目 pers-... (E/visibility)
▸ 知识库变化: 0 → 1 条 (personal/E/visibility)
▸ 传播到: .../CLAUDE.md 第 0 行
▸ 下次体验: AI 遇到 "use moment for tiny formatting" 时会改用 "use Intl.DateTimeFormat"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# verbose
<smart block>
▸ 如果没有 TeamAgent: 你会看到 AI 第二次再踩同一个坑

--- raw events ---
[
  {
    "source": "pitfall",
    ...
    "counterfactual": "你会看到 AI 第二次再踩同一个坑"
  }
]
```

补充落盘检查：

```bash
for mode in silent smart verbose; do
  test -f "$ROOT/pitfall-$mode/repo/.teamagent/knowledge.db"
  test -f "$ROOT/pitfall-$mode/repo/CLAUDE.md"
  grep -q 'use Intl.DateTimeFormat' "$ROOT/pitfall-$mode/repo/CLAUDE.md"
done
```

这证明 silent 只是 stdout 静默，不代表 pitfall 没有写 DB 或编译 CLAUDE.md。

## 路径 B：灰盒 pitfall runner，稳定绕过 embedder 外部性

如果 audit 需要稳定 CI，不希望模型下载影响结果，可用独立 Node runner 导入 `executePitfall()`，注入 stub embedder，并仍然使用临时 cwd/home、真实 SQLite、真实 CLAUDE.md 写入。这属于灰盒：覆盖 `pitfall.ts -> renderer` 主链路，但不是完整 CLI 进程。

```bash
cat > "$ROOT/pitfall-runner.mjs" <<'EOF'
import fs from "node:fs";
import path from "node:path";
import { executePitfall } from "/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/pitfall.ts";

const [mode, root] = process.argv.slice(2);
const cwd = path.join(root, `grey-pitfall-${mode}`, "repo");
const home = path.join(root, `grey-pitfall-${mode}`, "home");
fs.mkdirSync(cwd, { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(path.join(cwd, "CLAUDE.md"), "# Attribution audit\n\nsentinel before\n");

const out = await executePitfall(
  {
    trigger: "audit same trigger",
    wrong: "use moment for tiny formatting",
    correct: "use Intl.DateTimeFormat",
    reason: "project avoids moment bundle cost",
    category: "E",
    tags: ["visibility"],
    level: "personal",
    nature: "subjective",
  },
  {
    cwd,
    homeDir: home,
    now: () => "2026-04-28T00:00:00.000Z",
    env: { TEAMAGENT_VISIBILITY: mode },
    embedder: { embed: async (texts) => texts.map(() => [0.1, 0.2, 0.3]) },
  },
);

process.stdout.write(out);
if (out) process.stdout.write("\n");
EOF

for mode in silent smart verbose; do
  "$TEAMAGENT_TSX" "$ROOT/pitfall-runner.mjs" "$mode" "$ROOT" \
    > "$AUDIT_OUT/grey-pitfall-$mode.stdout" \
    2> "$AUDIT_OUT/grey-pitfall-$mode.stderr"
done
```

断言同路径 A，只把文件名前缀换成 `grey-pitfall-`。该路径的通过标准是 stdout visibility 差异和落盘行为同时成立。

## 路径 C：灰盒 renderer 直接事件矩阵

这条路径直接构造同一组 `AttributionEvent` 导入 `StdoutRenderer`，专门验证 `info` 过滤、`counterfactual`、raw events。它不覆盖 pitfall 写盘，因此只能作为 renderer 核心语义证据，不能替代路径 A/B。

```bash
cat > "$ROOT/renderer-matrix.mjs" <<'EOF'
import { StdoutRenderer } from "/Users/liushiyu/projects/TeamBrain/packages/adapters/src/attribution/stdout-renderer.ts";

const renderer = new StdoutRenderer();
const events = [
  {
    source: "detector",
    action: "INFO_SENTINEL_SHOULD_ONLY_APPEAR_IN_VERBOSE",
    severity: "info",
    timestamp: "2026-04-28T00:00:00.000Z",
    userFacingValue: "info value",
    counterfactual: "info counterfactual",
  },
  {
    source: "pitfall",
    action: "添加知识条目 fixed-rule (E/visibility)",
    severity: "highlight",
    timestamp: "2026-04-28T00:00:00.000Z",
    before: { knowledgeCount: 0 },
    after: { knowledgeCount: 1, categoryTag: "personal/E/visibility" },
    target: { file: "/tmp/audit/CLAUDE.md", count: 0 },
    userFacingValue: 'AI 遇到 "use moment" 时会改用 "Intl.DateTimeFormat"',
    counterfactual: "你会看到 AI 第二次再踩同一个坑",
  },
];

for (const mode of ["silent", "smart", "verbose"]) {
  const out = renderer.render(events, mode);
  console.log(`=== ${mode} length=${out.length} ===`);
  if (out) console.log(out);
}
EOF

"$TEAMAGENT_TSX" "$ROOT/renderer-matrix.mjs" > "$AUDIT_OUT/renderer-matrix.stdout"
```

外部断言：

```bash
grep -q '=== silent length=0 ===' "$AUDIT_OUT/renderer-matrix.stdout"

awk '/=== smart/{flag=1; next} /=== verbose/{flag=0} flag' "$AUDIT_OUT/renderer-matrix.stdout" > "$AUDIT_OUT/renderer-smart.block"
grep -q '添加知识条目 fixed-rule' "$AUDIT_OUT/renderer-smart.block"
! grep -q 'INFO_SENTINEL_SHOULD_ONLY_APPEAR_IN_VERBOSE' "$AUDIT_OUT/renderer-smart.block"
! grep -q '如果没有 TeamAgent' "$AUDIT_OUT/renderer-smart.block"
! grep -q -- '--- raw events ---' "$AUDIT_OUT/renderer-smart.block"

awk '/=== verbose/{flag=1; next} flag' "$AUDIT_OUT/renderer-matrix.stdout" > "$AUDIT_OUT/renderer-verbose.block"
grep -q 'INFO_SENTINEL_SHOULD_ONLY_APPEAR_IN_VERBOSE' "$AUDIT_OUT/renderer-verbose.block"
grep -q '如果没有 TeamAgent: 你会看到 AI 第二次再踩同一个坑' "$AUDIT_OUT/renderer-verbose.block"
grep -q -- '--- raw events ---' "$AUDIT_OUT/renderer-verbose.block"
grep -q '"severity": "info"' "$AUDIT_OUT/renderer-verbose.block"
grep -q '"counterfactual"' "$AUDIT_OUT/renderer-verbose.block"
```

## 路径 D：Hook PreToolUse SDK visibility

这条路径构造独立 runner 导入 `createPreToolUseHandler()`。它是灰盒 SDK 验证，不依赖真实 Claude Code 终端，也不依赖 SQLite；目标是精确验证 SDK visibility contract。

```bash
cat > "$ROOT/pretooluse-sdk-visibility.mjs" <<'EOF'
import { createPreToolUseHandler } from "/Users/liushiyu/projects/TeamBrain/packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts";

async function runCleanPass(visibility) {
  const appended = [];
  const handler = createPreToolUseHandler({
    matcher: {
      match: async () => ({
        matched: [],
        semanticHits: [
          { id: "rule-semantic-1", trigger: "写测试前先确认断言", score: 0.78 },
        ],
      }),
    },
    eventLog: {
      append: (e) => appended.push(e),
      readLast: () => [],
    },
    visibility,
    ruleCount: 42,
  });

  const result = await handler({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "pnpm test" },
    tool_use_id: `tu-clean-${visibility}`,
  });

  return { visibility, result, appended };
}

async function runWarn(visibility) {
  const appended = [];
  const handler = createPreToolUseHandler({
    matcher: {
      match: async () => ({
        matched: [{
          id: "rule-warn",
          enforcement: "warn",
          trigger: "avoid axios",
          wrong_pattern: "axios.get(url)",
          correct_pattern: "fetch(url)",
          reasoning: "project standard",
          confidence: 0.92,
          created_at: "2026-04-27T00:00:00.000Z",
          hit_count: 1,
        }],
      }),
    },
    eventLog: {
      append: (e) => appended.push(e),
      readLast: () => [],
    },
    visibility,
    ruleCount: 42,
  });

  const result = await handler({
    hook_event_name: "PreToolUse",
    tool_name: "Edit",
    tool_input: { file_path: "/tmp/a.ts", new_string: "axios.get(url)" },
    tool_use_id: `tu-warn-${visibility}`,
  });

  return { visibility, result, appended };
}

const clean = [];
for (const vis of ["silent", "smart", "verbose"]) clean.push(await runCleanPass(vis));

const warn = [];
for (const vis of ["silent", "smart", "verbose"]) warn.push(await runWarn(vis));

console.log(JSON.stringify({ clean, warn }, null, 2));
EOF

"$TEAMAGENT_TSX" "$ROOT/pretooluse-sdk-visibility.mjs" > "$AUDIT_OUT/pretooluse-sdk-visibility.json"
```

JSON parser 断言：

```bash
node - "$AUDIT_OUT/pretooluse-sdk-visibility.json" <<'EOF'
const fs = require("node:fs");
const data = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

for (const vis of ["silent", "smart"]) {
  const row = data.clean.find((r) => r.visibility === vis);
  if (row.result.permissionDecision !== "allow") throw new Error(`${vis} clean not allow`);
  if ("systemMessage" in row.result) throw new Error(`${vis} clean should not have systemMessage`);
  if (!row.appended.some((e) => e.kind === "hook-pre.passed")) throw new Error(`${vis} missing passed event`);
}

const verbose = data.clean.find((r) => r.visibility === "verbose");
if (verbose.result.permissionDecision !== "allow") throw new Error("verbose clean not allow");
if (!verbose.result.systemMessage?.includes("TeamAgent")) throw new Error("verbose missing TeamAgent message");
if (!verbose.result.systemMessage?.includes("Bash 放行")) throw new Error("verbose missing tool/pass message");
if (!verbose.result.systemMessage?.includes("检查 42 条规则")) throw new Error("verbose missing rule count");
if (!verbose.result.systemMessage?.includes("语义命中 1 条")) throw new Error("verbose missing semantic hit count");
if (!verbose.result.systemMessage?.includes("rule-semantic-1")) throw new Error("verbose missing semantic hit detail");

for (const vis of ["silent", "smart", "verbose"]) {
  const row = data.warn.find((r) => r.visibility === vis);
  if (row.result.permissionDecision !== "allow") throw new Error(`${vis} warn not allow`);
  if (!row.result.systemMessage?.includes("TeamAgent 经验提醒")) throw new Error(`${vis} warn should still show warning`);
  if (!row.appended.some((e) => e.kind === "hook-pre.warned" && e.tool_name === "Edit")) {
    throw new Error(`${vis} missing warned event`);
  }
}
EOF
```

预期差异：

- clean/silent 和 clean/smart：结果 JSON 没有 `systemMessage`。
- clean/verbose：结果 JSON 有 `systemMessage`，包含 `◈ TeamAgent: ✓ Bash 放行 (检查 42 条规则, 语义命中 1 条)` 和命中详情。
- warn 三种 visibility 都有 `systemMessage`，因为这是规则提醒，不是 clean-pass attribution。

## 可选：真实 PreToolUse 入口 JSON

这条路径覆盖 `bin-pre-tool-use.ts` 的 JSON 包装，但需要临时 knowledge DB 与 matcher 环境。为避免语义 embedder 外部性，强制 legacy matcher；空库 clean pass 即可验证 visibility 对顶层 `systemMessage` 的影响。

```bash
PRE_INPUT="$ROOT/pretooluse-input.json"
cat > "$PRE_INPUT" <<EOF
{
  "hook_event_name": "PreToolUse",
  "cwd": "$AUDIT_CWD",
  "tool_name": "Bash",
  "tool_input": { "command": "pwd" },
  "tool_use_id": "tu-real-clean"
}
EOF

for mode in silent smart verbose; do
  HOME="$AUDIT_HOME" \
  TEAMAGENT_MATCHER=legacy \
  TEAMAGENT_VISIBILITY="$mode" \
  "$TEAMAGENT_TSX" packages/cli/src/bin-pre-tool-use.ts \
    < "$PRE_INPUT" \
    > "$AUDIT_OUT/pretooluse-real-$mode.json" \
    2> "$AUDIT_OUT/pretooluse-real-$mode.stderr"
done
```

断言：

```bash
node - "$AUDIT_OUT" <<'EOF'
const fs = require("node:fs");
const dir = process.argv[2];
for (const vis of ["silent", "smart", "verbose"]) {
  const data = JSON.parse(fs.readFileSync(`${dir}/pretooluse-real-${vis}.json`, "utf8"));
  if (data.hookSpecificOutput?.permissionDecision !== "allow") throw new Error(`${vis} not allow`);
  if (vis === "verbose") {
    if (!data.systemMessage?.includes("TeamAgent")) throw new Error("verbose missing systemMessage");
  } else {
    if ("systemMessage" in data) throw new Error(`${vis} should not expose systemMessage`);
  }
}
EOF
```

## 判定标准

Feature #20 通过：

- `silent` pitfall stdout 为空，但临时 DB 和 `CLAUDE.md` 仍被写入。
- `smart` pitfall stdout 包含 attribution block、知识库变化、传播目标、下次体验；不包含 counterfactual 和 raw JSON。
- `verbose` pitfall stdout 包含 smart 的内容，并额外包含 counterfactual、`--- raw events ---`、原始事件 JSON。
- 直接 renderer 矩阵证明 smart 会过滤 `info` severity，而 verbose 不过滤。
- PreToolUse SDK clean pass 证明 verbose 有 `systemMessage`，smart/silent 没有。
- PreToolUse warn/block 边界被明确验证：visibility 不应压掉真实规则提醒或阻断原因。
- 所有命令只写 `/tmp` 下的 cwd/home/out，不污染真实 repo、真实 home、`scripts/out/`。

Feature #20 不通过：

- silent stdout 出现任何 attribution 文本。
- smart stdout 出现 `如果没有 TeamAgent`、`--- raw events ---`、`"counterfactual"`，或丢失 highlight attribution block。
- verbose stdout 没有 raw events，或 raw JSON 中缺少原始 `source/action/counterfactual` 字段。
- renderer smart 没有过滤 info event。
- PreToolUse clean verbose 没有 `systemMessage`，或 clean smart/silent 暴露了 `systemMessage`。
- 实测只能通过 Vitest，缺少外部 stdout/JSON parser 证据。

## 真实 Claude 终端 UX 的限制

- Claude Code 是否展示 hook `systemMessage`、展示位置、折叠策略、颜色和时序，取决于 Claude Code 客户端；本 audit 只能证明 TeamAgent hook stdout JSON 是否正确返回。
- `bin-pre-tool-use.ts` 已把结果包进 `hookSpecificOutput`，audit 可验证 JSON shape，但不能仅凭本地 runner 证明 Claude 终端一定逐字显示。
- `pitfall` CLI 的 stdout 是可直接验证的真实终端输出；hook 的真实 UX 还需要人工在 Claude Code 里安装 hook 后观察一次。
- semantic matcher / embedder 可能引入模型缓存、下载、耗时和 fallback stderr；visibility 核心判定应尽量使用 legacy 或 SDK 灰盒路径隔离这些外部性。
- `executePitfall()` 会 fire-and-forget 生成 `tool_context_description`，可能产生异步 LLM 尝试；由于它失败不阻塞，audit 不应把这部分作为 Feature #20 通过/失败标准。

## 最小汇报模板

```text
Feature #20 Attribution visibility audit:
- pitfall silent/smart/verbose: PASS/FAIL
- renderer info/counterfactual/raw-events matrix: PASS/FAIL
- PreToolUse SDK clean-pass visibility: PASS/FAIL
- PreToolUse warn boundary: PASS/FAIL
- 临时工作区: /tmp/teamagent-attr-audit....
- 真实 Claude 终端 UX: 未覆盖/已人工观察，原因...
```
