# Feature #13 非自证 Audit 草案：`@teamagent/benchmark`

## 目标

验证 `@teamagent/benchmark` 不靠 Vitest fake 或包内 helper 自证，而是在真实脚本入口、真实 fixture JSON、真实临时工作区、可选真实 Claude SDK 调用，以及外部 JSON 检查下满足预期：

- 根脚本 `pnpm benchmark` 能路由到 `@teamagent/benchmark` 的 `bench` 脚本。
- task JSON 的 schema、正则表达式和 id/文件名前缀一致，且 evaluator 有明确 wrong/correct 模式。
- group 的 `settings.template.json` 是合法 JSON；`baseline` 不配置 hooks，`teamagent` 配置三个 Claude hook 并正确使用 `{{HOOK_DIR}}` 占位符。
- benchmark 调用链为 `bin.ts -> task-loader -> isolator -> sdk-runner -> runner/evaluator -> reporter`。
- 输出 `bench-report.json` 至少包含 `groups`、`comparison`、`rawResults`，每条 raw result 有 `verdict`，且 group summary 与 rawResults 可由外部脚本重算一致。
- 文档明确区分完全离线验证与真实 smoke：真实 benchmark 会调用 `@anthropic-ai/claude-agent-sdk`，需要本机 Claude/认证/网络/模型可用；`teamagent` group 还要求 hook bundle 已构建。

本 audit 的主证据来自独立 Node 脚本、shell、临时输出文件和对 `bench-report.json` 的外部重算；包内 Vitest 单测只作为辅助信号，不作为通过结论。

## 源码追踪结论

调用链：

1. 根 `package.json` 的 `scripts.benchmark` 是 `pnpm --filter @teamagent/benchmark bench`。
2. `packages/benchmark/package.json` 的 `scripts.bench` 是 `tsx src/bin.ts`。
3. `packages/benchmark/src/bin.ts`：
   - `parseArgs()` 支持 `--groups=baseline,teamagent`、`--tasks=<prefix|all>`、`--runs=<n>`、`--output-json=<path>`、`--output-md=<path>`。
   - 默认配置为 `groups=["baseline","teamagent"]`、`tasks="all"`、`runs=1`、`outputJson="bench-report.json"`、`outputMarkdown="bench-report.md"`。
   - `repoRoot` 解析到仓库根，`fixturesDir` 解析到 `packages/benchmark/fixtures`。
   - `config.tasks === "all"` 时加载 `fixtures/tasks/*.json`；否则加载 `fixtures/tasks/${tasks}*.json`。
   - group 包含 `teamagent` 时，先检查 `packages/cli/dist/bin-pre-tool-use.cjs`、`bin-post-tool-use.cjs`、`bin-user-prompt-submit.cjs`，缺失则退出并提示 `pnpm --filter @teamagent/cli build:hook`。
   - 对每个 group 创建隔离 workdir，再对每个 task/run 调用 `runTask()`，最后 `aggregate()` 并写 JSON/Markdown。
4. `packages/benchmark/src/task-loader.ts`：
   - 用 Zod 校验 task JSON：`id/name/category/prompt` 是非空字符串；`evaluator.type` 必须是 `pattern`；`wrong_patterns/correct_patterns` 是字符串数组。
   - 对每个 pattern 执行 `new RegExp(pattern)`，正则编译失败会抛错。
5. `packages/benchmark/src/isolator.ts`：
   - 每个 group 使用 `mkdtemp(/tmp/teamagent-bench-<group>-*)` 创建临时目录。
   - 写入 `.claude/settings.local.json`，把 `settings.template.json` 中的 `{{HOOK_DIR}}` 替换成 hook bundle 路径。
   - 创建 `.teamagent/knowledge.db`；如果 group fixture 有 `seed.sql`，执行 seed。
   - 结束后 `cleanupGroupWorkdir()` 删除临时 workdir。
6. `packages/benchmark/src/sdk-runner.ts`：
   - `ClaudeSdkRunner` 调用 `query()`，`cwd` 是隔离 workdir，`settingSources=["local"]`，`permissionMode="acceptEdits"`，默认 model 为 `claude-haiku-4-5-20251001`，默认超时 180 秒。
   - 收集 assistant text、usage token、cache token；SDK 异常会由上层 runner 转成 `verdict="error"`。
7. `packages/benchmark/src/runner.ts`：
   - 在 task prompt 后追加工作目录和被 hook deny 时应采用替代方案的指令。
   - SDK 结束后扫描 workdir 中的 `.ts/.tsx/.js/.jsx/.mjs/.cjs`，跳过 `.teamagent`、`.claude`、`node_modules`、`.git`、`dist`、`build`。
   - 如果生成了源码文件，优先用源码内容评价；没有文件时才用 assistant text。
   - 空输出返回 `verdict="neither"`、`reason="empty_response"`；SDK 异常返回 `verdict="error"`、`reason="sdk_error"`。
8. `packages/benchmark/src/evaluator.ts`：
   - 先匹配 `compiledWrongRegex`，任一命中即 `wrong`。
   - 只有没有 wrong 命中时才检查 correct，命中则 `correct`。
   - 两类都不命中则 `neither`。
9. `packages/benchmark/src/reporter.ts`：
   - `aggregate()` 生成 `groups`、`comparison`、`rawResults`。
   - 每个 group 统计 `wrongCount/correctCount/neitherCount/errorCount`、总 token、cache token、平均时长。
   - `comparison.prr = (baseline.wrongCount - teamagent.wrongCount) / baseline.wrongCount`；baseline wrong 为 0 时 PRR 为 0。
   - `tokenDeltaPercent` 使用 in/out/cache read/cache creation 全部 token；`durationDeltaPercent` 使用平均时长。

## 关键 JSON 事实

task fixture 路径：`packages/benchmark/fixtures/tasks/*.json`。

当前任务集：

- `001-moment-vs-dayjs`：wrong 为 `moment` import/require，correct 为 `dayjs`。
- `002-axios-cancel`：wrong 为 `CancelToken` / `axios.Cancel`，correct 为 `AbortController` / `AbortSignal`。
- `003-react-key`：wrong 为 `key={index|i|idx}`，correct 为稳定 key，例如 `item.id`、`name`、`user`。
- `004-multi-trap-todo`：组合命中 moment、CancelToken、index key；correct 要覆盖 dayjs、AbortController/AbortSignal、stable id key。
- `005-xhr-vs-fetch`：wrong 为 XHR API，correct 为 `fetch()`、`await fetch`、`response.json()`。
- `006-react-class-component`：wrong 为 class component，correct 为 hooks/function component 形态。
- `007-verify-loop`：要求先写 legacy，再根据 grep 自修复；wrong 覆盖 moment、CancelToken、index key，correct 覆盖现代替代实现。

group fixture 路径：

- `packages/benchmark/fixtures/groups/baseline/settings.template.json`
  - `permissions.allow` 包含 `Write/Edit/MultiEdit/Read/Bash/Glob/Grep`。
  - `hooks` 是空对象。
- `packages/benchmark/fixtures/groups/teamagent/settings.template.json`
  - 同样允许常用工具。
  - 配置 `PreToolUse`、`PostToolUse`、`UserPromptSubmit` 三类 hooks。
  - hook command 使用 `node {{HOOK_DIR}}/bin-*.cjs`。
- `packages/benchmark/fixtures/groups/teamagent/seed.sql`
  - seed `knowledge` 规则：moment -> dayjs、CancelToken -> AbortController、React class -> hooks、XHR -> fetch、index key -> stable id。
  - seed `wiki_meta` 包含 axios CancelToken deprecated 证据。

预期 `bench-report.json` 顶层字段：

```json
{
  "generatedAt": "ISO timestamp",
  "config": {
    "groups": ["baseline", "teamagent"],
    "tasks": "all or prefix",
    "runs": 1,
    "outputJson": "bench-report.json",
    "outputMarkdown": "bench-report.md"
  },
  "groups": [
    {
      "group": "baseline",
      "wrongCount": 0,
      "correctCount": 0,
      "neitherCount": 0,
      "errorCount": 0,
      "totalTokensIn": 0,
      "totalTokensOut": 0,
      "totalCacheReadTokens": 0,
      "totalCacheCreationTokens": 0,
      "avgDurationMs": 0
    }
  ],
  "comparison": {
    "prr": 0,
    "tokenDeltaPercent": 0,
    "durationDeltaPercent": 0
  },
  "rawResults": [
    {
      "group": "baseline",
      "taskId": "001-moment-vs-dayjs",
      "run": 1,
      "verdict": "correct|wrong|neither|error",
      "reason": "optional",
      "tokensIn": 0,
      "tokensOut": 0,
      "cacheReadTokens": 0,
      "cacheCreationTokens": 0,
      "durationMs": 0,
      "output": "assistant/source text",
      "errorMsg": "optional"
    }
  ]
}
```

## Audit 工作区

所有输出写入临时目录；仓库内除本草案外不需要创建或修改文件。

```bash
cd /Users/liushiyu/projects/TeamBrain

REPO=/Users/liushiyu/projects/TeamBrain
ROOT="$(mktemp -d /tmp/teamagent-benchmark-audit.XXXXXX)"
OUT="$ROOT/out"
mkdir -p "$OUT"

export REPO ROOT OUT
```

## 场景 A：离线 schema-check task JSON 和 group template

这个场景不 import `@teamagent/benchmark`，不调用 Claude SDK。

命令：

```bash
node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";

const repo = "/Users/liushiyu/projects/TeamBrain";
const tasksDir = path.join(repo, "packages/benchmark/fixtures/tasks");
const groupsDir = path.join(repo, "packages/benchmark/fixtures/groups");
const taskFiles = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".json")).sort();
const errors = [];
const taskIds = new Set();

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

for (const file of taskFiles) {
  const full = path.join(tasksDir, file);
  let task;
  try {
    task = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (e) {
    errors.push(`${file}: invalid JSON: ${e.message}`);
    continue;
  }

  for (const key of ["id", "name", "category", "prompt"]) {
    assert(typeof task[key] === "string" && task[key].trim().length > 0, `${file}: ${key} must be non-empty string`);
  }
  assert(file.startsWith(task.id), `${file}: filename should start with id ${task.id}`);
  assert(!taskIds.has(task.id), `${file}: duplicate task id ${task.id}`);
  taskIds.add(task.id);

  assert(task.evaluator && task.evaluator.type === "pattern", `${file}: evaluator.type must be pattern`);
  for (const kind of ["wrong_patterns", "correct_patterns"]) {
    const arr = task.evaluator?.[kind];
    assert(Array.isArray(arr) && arr.length > 0, `${file}: ${kind} must be non-empty array`);
    if (Array.isArray(arr)) {
      for (const [i, pattern] of arr.entries()) {
        assert(typeof pattern === "string" && pattern.length > 0, `${file}: ${kind}[${i}] must be non-empty string`);
        try {
          new RegExp(pattern);
        } catch (e) {
          errors.push(`${file}: ${kind}[${i}] regex compile failed: ${e.message}`);
        }
      }
    }
  }
}

for (const group of ["baseline", "teamagent"]) {
  const templatePath = path.join(groupsDir, group, "settings.template.json");
  assert(fs.existsSync(templatePath), `${group}: missing settings.template.json`);
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  } catch (e) {
    errors.push(`${group}: invalid settings.template.json: ${e.message}`);
    continue;
  }
  const allow = settings.permissions?.allow;
  assert(Array.isArray(allow) && ["Write", "Edit", "Read", "Bash"].every((x) => allow.includes(x)), `${group}: permissions.allow missing expected tools`);
  if (group === "baseline") {
    assert(settings.hooks && Object.keys(settings.hooks).length === 0, "baseline: hooks must be empty");
  } else {
    for (const hook of ["PreToolUse", "PostToolUse", "UserPromptSubmit"]) {
      const command = settings.hooks?.[hook]?.[0]?.hooks?.[0]?.command;
      assert(typeof command === "string" && command.includes("{{HOOK_DIR}}/bin-"), `teamagent: ${hook} command must use {{HOOK_DIR}}`);
    }
    assert(fs.existsSync(path.join(groupsDir, group, "seed.sql")), "teamagent: missing seed.sql");
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  taskCount: taskFiles.length,
  taskIds: [...taskIds],
  groups: ["baseline", "teamagent"]
}, null, 2));
NODE
```

预期输出：

```json
{
  "ok": true,
  "taskCount": 7,
  "taskIds": [
    "001-moment-vs-dayjs",
    "002-axios-cancel",
    "003-react-key",
    "004-multi-trap-todo",
    "005-xhr-vs-fetch",
    "006-react-class-component",
    "007-verify-loop"
  ],
  "groups": ["baseline", "teamagent"]
}
```

通过标准：

- 命令 exit code 为 0。
- 所有 task JSON 可 parse。
- 所有 wrong/correct pattern 可由 `new RegExp()` 编译。
- baseline template 无 hooks。
- teamagent template 的三个 hook 都引用 `{{HOOK_DIR}}`。
- teamagent seed.sql 存在。

## 场景 B：离线 evaluator 语义外部检查

这个场景不 import `evaluatePatterns()`，而是用独立脚本复刻判定契约：wrong 优先于 correct。

命令：

```bash
node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";

const repo = "/Users/liushiyu/projects/TeamBrain";
const tasksDir = path.join(repo, "packages/benchmark/fixtures/tasks");
const checks = [
  ["001-moment-vs-dayjs", "import moment from 'moment'", "wrong"],
  ["001-moment-vs-dayjs", "import dayjs from 'dayjs'", "correct"],
  ["002-axios-cancel", "const source = axios.CancelToken.source()", "wrong"],
  ["002-axios-cancel", "const c = new AbortController(); axios.get(url, { signal: c.signal })", "correct"],
  ["003-react-key", "<li key={index}>{name}</li>", "wrong"],
  ["003-react-key", "<li key={name}>{name}</li>", "correct"],
  ["005-xhr-vs-fetch", "const xhr = new XMLHttpRequest(); xhr.open('GET', url); xhr.send();", "wrong"],
  ["005-xhr-vs-fetch", "const response = await fetch(url); return response.json();", "correct"],
  ["006-react-class-component", "class CounterPanel extends React.Component<Props, State> {}", "wrong"],
  ["006-react-class-component", "function CounterPanel(){ const [count,setCount] = useState(0); useEffect(()=>{}, []); }", "correct"],
  ["007-verify-loop", "import moment from 'moment'; key={index}; axios.CancelToken.source();", "wrong"],
  ["007-verify-loop", "import dayjs from 'dayjs'; const c = new AbortController(); key={item.id}", "correct"]
];

function verdict(task, text) {
  for (const p of task.evaluator.wrong_patterns) if (new RegExp(p).test(text)) return "wrong";
  for (const p of task.evaluator.correct_patterns) if (new RegExp(p).test(text)) return "correct";
  return "neither";
}

const byId = new Map();
for (const file of fs.readdirSync(tasksDir).filter((f) => f.endsWith(".json"))) {
  const task = JSON.parse(fs.readFileSync(path.join(tasksDir, file), "utf8"));
  byId.set(task.id, task);
}

const failures = [];
for (const [id, text, expected] of checks) {
  const actual = verdict(byId.get(id), text);
  if (actual !== expected) failures.push({ id, expected, actual, text });
}

const both = verdict(byId.get("001-moment-vs-dayjs"), "import moment from 'moment'; import dayjs from 'dayjs';");
if (both !== "wrong") failures.push({ id: "001-moment-vs-dayjs", expected: "wrong priority", actual: both });

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: checks.length, wrongPriority: true }, null, 2));
NODE
```

预期输出：

```json
{
  "ok": true,
  "checked": 12,
  "wrongPriority": true
}
```

通过标准：

- 每个 fixture 的代表性 wrong/correct 文本被判为预期 verdict。
- 同时命中 wrong 和 correct 时，结果必须是 wrong。

## 场景 C：离线 `bench-report.json` 字段契约和聚合重算

这个场景检查一个已生成或真实 smoke 生成的 report。脚本不 import `reporter.ts`，而是从 `rawResults` 外部重算 `groups` 和 `comparison`。

如果暂时没有真实 report，可先创建一个最小契约 fixture 到临时目录，用于验证外部检查器本身：

```bash
cat > "$OUT/bench-report.synthetic.json" <<'JSON'
{
  "generatedAt": "2026-04-28T00:00:00.000Z",
  "config": {
    "groups": ["baseline", "teamagent"],
    "tasks": "001",
    "runs": 1,
    "outputJson": "bench-report.json",
    "outputMarkdown": "bench-report.md"
  },
  "groups": [
    {
      "group": "baseline",
      "wrongCount": 1,
      "correctCount": 0,
      "neitherCount": 0,
      "errorCount": 0,
      "totalTokensIn": 10,
      "totalTokensOut": 20,
      "totalCacheReadTokens": 0,
      "totalCacheCreationTokens": 0,
      "avgDurationMs": 1000
    },
    {
      "group": "teamagent",
      "wrongCount": 0,
      "correctCount": 1,
      "neitherCount": 0,
      "errorCount": 0,
      "totalTokensIn": 15,
      "totalTokensOut": 25,
      "totalCacheReadTokens": 0,
      "totalCacheCreationTokens": 0,
      "avgDurationMs": 1500
    }
  ],
  "comparison": {
    "prr": 1,
    "tokenDeltaPercent": 0.3333333333333333,
    "durationDeltaPercent": 0.5
  },
  "rawResults": [
    {
      "group": "baseline",
      "taskId": "001-moment-vs-dayjs",
      "run": 1,
      "verdict": "wrong",
      "tokensIn": 10,
      "tokensOut": 20,
      "cacheReadTokens": 0,
      "cacheCreationTokens": 0,
      "durationMs": 1000,
      "output": "import moment from 'moment'"
    },
    {
      "group": "teamagent",
      "taskId": "001-moment-vs-dayjs",
      "run": 1,
      "verdict": "correct",
      "tokensIn": 15,
      "tokensOut": 25,
      "cacheReadTokens": 0,
      "cacheCreationTokens": 0,
      "durationMs": 1500,
      "output": "import dayjs from 'dayjs'"
    }
  ]
}
JSON
```

外部 report 检查器：

```bash
REPORT="$OUT/bench-report.synthetic.json"

node --input-type=module - "$REPORT" <<'NODE'
import fs from "node:fs";
const reportPath = process.argv[2];
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const errors = [];
const verdicts = new Set(["correct", "wrong", "neither", "error"]);

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

assert(typeof report.generatedAt === "string" && !Number.isNaN(Date.parse(report.generatedAt)), "generatedAt must be ISO-like timestamp");
assert(report.config && Array.isArray(report.config.groups), "config.groups missing");
assert(Array.isArray(report.groups), "groups missing");
assert(report.comparison && typeof report.comparison === "object", "comparison missing");
assert(Array.isArray(report.rawResults), "rawResults missing");

for (const r of report.rawResults ?? []) {
  assert(typeof r.group === "string" && r.group, "rawResults[].group missing");
  assert(typeof r.taskId === "string" && r.taskId, "rawResults[].taskId missing");
  assert(Number.isInteger(r.run) && r.run >= 1, "rawResults[].run invalid");
  assert(verdicts.has(r.verdict), `rawResults[].verdict invalid: ${r.verdict}`);
  for (const k of ["tokensIn", "tokensOut", "cacheReadTokens", "cacheCreationTokens", "durationMs"]) {
    assert(typeof r[k] === "number" && r[k] >= 0, `rawResults[].${k} invalid`);
  }
  assert(typeof r.output === "string", "rawResults[].output must be string");
}

const recomputed = new Map();
for (const r of report.rawResults ?? []) {
  const g = recomputed.get(r.group) ?? {
    group: r.group,
    wrongCount: 0,
    correctCount: 0,
    neitherCount: 0,
    errorCount: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    durationTotal: 0,
    rows: 0
  };
  g[`${r.verdict}Count`]++;
  g.totalTokensIn += r.tokensIn;
  g.totalTokensOut += r.tokensOut;
  g.totalCacheReadTokens += r.cacheReadTokens;
  g.totalCacheCreationTokens += r.cacheCreationTokens;
  g.durationTotal += r.durationMs;
  g.rows++;
  recomputed.set(r.group, g);
}

for (const g of report.groups ?? []) {
  const expected = recomputed.get(g.group);
  assert(expected, `group summary has no rawResults: ${g.group}`);
  if (!expected) continue;
  for (const k of ["wrongCount", "correctCount", "neitherCount", "errorCount", "totalTokensIn", "totalTokensOut", "totalCacheReadTokens", "totalCacheCreationTokens"]) {
    assert(g[k] === expected[k], `${g.group}.${k} mismatch: got ${g[k]}, expected ${expected[k]}`);
  }
  const avg = expected.rows ? expected.durationTotal / expected.rows : 0;
  assert(Math.abs(g.avgDurationMs - avg) < 1e-9, `${g.group}.avgDurationMs mismatch`);
}

const baseline = report.groups.find((g) => g.group === "baseline");
const teamagent = report.groups.find((g) => g.group === "teamagent");
if (baseline && teamagent) {
  const expectedPrr = baseline.wrongCount > 0 ? (baseline.wrongCount - teamagent.wrongCount) / baseline.wrongCount : 0;
  assert(Math.abs(report.comparison.prr - expectedPrr) < 1e-9, "comparison.prr mismatch");

  const baseTokens = baseline.totalTokensIn + baseline.totalTokensOut + baseline.totalCacheReadTokens + baseline.totalCacheCreationTokens;
  const teamTokens = teamagent.totalTokensIn + teamagent.totalTokensOut + teamagent.totalCacheReadTokens + teamagent.totalCacheCreationTokens;
  const expectedTokenDelta = baseTokens > 0 ? (teamTokens - baseTokens) / baseTokens : 0;
  assert(Math.abs(report.comparison.tokenDeltaPercent - expectedTokenDelta) < 1e-9, "comparison.tokenDeltaPercent mismatch");

  const expectedDurationDelta = baseline.avgDurationMs > 0 ? (teamagent.avgDurationMs - baseline.avgDurationMs) / baseline.avgDurationMs : 0;
  assert(Math.abs(report.comparison.durationDeltaPercent - expectedDurationDelta) < 1e-9, "comparison.durationDeltaPercent mismatch");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  groups: report.groups.map((g) => g.group),
  rawResults: report.rawResults.length,
  verdicts: [...new Set(report.rawResults.map((r) => r.verdict))],
  comparison: report.comparison
}, null, 2));
NODE
```

预期 synthetic 输出：

```json
{
  "ok": true,
  "groups": ["baseline", "teamagent"],
  "rawResults": 2,
  "verdicts": ["wrong", "correct"],
  "comparison": {
    "prr": 1,
    "tokenDeltaPercent": 0.3333333333333333,
    "durationDeltaPercent": 0.5
  }
}
```

通过标准：

- 顶层字段 `generatedAt/config/groups/comparison/rawResults` 存在且类型正确。
- `rawResults[].verdict` 只能是 `correct|wrong|neither|error`。
- `groups` 的四类 verdict count、token 汇总、平均时长能由 rawResults 重算一致。
- `comparison.prr/tokenDeltaPercent/durationDeltaPercent` 能由 baseline/teamagent summary 重算一致。

对真实 benchmark 产出的 report，也使用同一个检查器，把 `REPORT` 指向真实 `bench-report.json`。

## 场景 D：可选真实 smoke，baseline 单任务

这个场景会真实调用 Claude SDK，但不需要 TeamAgent hook bundle。适合验证脚本入口、task-loader、isolator、sdk-runner、runner/evaluator、reporter 的最小闭环。

前置条件：

- `pnpm install` 已完成。
- 本机 Claude SDK 可用，认证、网络、模型权限正常。
- 接受会产生一次真实模型调用和 token 成本。

命令：

```bash
cd /Users/liushiyu/projects/TeamBrain
mkdir -p "$OUT/baseline"

BENCH_NO_COLOR=1 BENCH_QUIET=1 \
  pnpm benchmark -- --groups=baseline --tasks=001 --runs=1 \
  --output-json="$OUT/baseline/bench-report.json" \
  --output-md="$OUT/baseline/bench-report.md" \
  >"$OUT/baseline/stdout.txt" 2>"$OUT/baseline/stderr.txt"

STATUS=$?
cat "$OUT/baseline/stdout.txt"
cat "$OUT/baseline/stderr.txt"
echo "status=$STATUS"
```

预期输出要点：

- stdout 包含 `Loaded 1 tasks; 1 groups × 1 runs = 1 invocations`。
- stdout 包含 `Group baseline workdir: /tmp/teamagent-bench-baseline-...`。
- stdout 包含 `[1/1] 001-moment-vs-dayjs run=1`。
- stdout 最后包含 `Report written: ...bench-report.json + ...bench-report.md` 和 `PRR:`。
- exit code 通常为 0；如果 SDK 失败但产出了 report，raw result 可能是 `verdict="error"`。当前 `bin.ts` 在所有 result 都是 error 时会 exit 2。

真实 report 外部断言：

```bash
REPORT="$OUT/baseline/bench-report.json"
test -f "$REPORT"
test -f "$OUT/baseline/bench-report.md"

node --input-type=module - "$REPORT" <<'NODE'
import fs from "node:fs";
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (report.config.tasks !== "001") throw new Error(`unexpected tasks: ${report.config.tasks}`);
if (JSON.stringify(report.config.groups) !== JSON.stringify(["baseline"])) throw new Error("unexpected groups");
if (report.config.runs !== 1) throw new Error("unexpected runs");
if (report.rawResults.length !== 1) throw new Error(`unexpected rawResults length: ${report.rawResults.length}`);
const r = report.rawResults[0];
if (r.group !== "baseline") throw new Error(`unexpected group: ${r.group}`);
if (r.taskId !== "001-moment-vs-dayjs") throw new Error(`unexpected taskId: ${r.taskId}`);
if (!["correct", "wrong", "neither", "error"].includes(r.verdict)) throw new Error(`bad verdict: ${r.verdict}`);
for (const key of ["tokensIn", "tokensOut", "cacheReadTokens", "cacheCreationTokens", "durationMs"]) {
  if (typeof r[key] !== "number" || r[key] < 0) throw new Error(`bad numeric field ${key}`);
}
if (typeof r.output !== "string") throw new Error("output must be string");
if (!Array.isArray(report.groups) || report.groups.length !== 1) throw new Error("expected one group summary");
if (report.groups[0].group !== "baseline") throw new Error("missing baseline summary");
if (!report.comparison || typeof report.comparison.prr !== "number") throw new Error("missing comparison.prr");
console.log(JSON.stringify({ ok: true, verdict: r.verdict, groups: report.groups, comparison: report.comparison }, null, 2));
NODE
```

通过标准：

- 如果 SDK 可用，命令应完成并写出 JSON/Markdown report。
- report 的 `config/groups/rawResults` 与命令参数一致。
- raw result 有合法 `verdict`。
- 即使模型输出质量导致 `wrong/neither`，脚本闭环仍可视为 smoke 通过；如果 `verdict="error"`，需要查看 `errorMsg` 区分 SDK 环境问题和代码问题。

## 场景 E：可选真实 smoke，baseline vs teamagent 单任务

这个场景会真实调用 Claude SDK，并启用 TeamAgent hooks。适合验证 `teamagent` group 的 hook bundle 检查、template 替换、seed DB、report comparison。

前置条件：

- 满足场景 D 的所有条件。
- 先构建 hook bundle：

```bash
pnpm --filter @teamagent/cli build:hook
test -f packages/cli/dist/bin-pre-tool-use.cjs
test -f packages/cli/dist/bin-post-tool-use.cjs
test -f packages/cli/dist/bin-user-prompt-submit.cjs
```

真实 smoke 命令：

```bash
mkdir -p "$OUT/teamagent"

BENCH_NO_COLOR=1 BENCH_QUIET=1 \
  pnpm benchmark -- --groups=baseline,teamagent --tasks=001 --runs=1 \
  --output-json="$OUT/teamagent/bench-report.json" \
  --output-md="$OUT/teamagent/bench-report.md" \
  >"$OUT/teamagent/stdout.txt" 2>"$OUT/teamagent/stderr.txt"

STATUS=$?
cat "$OUT/teamagent/stdout.txt"
cat "$OUT/teamagent/stderr.txt"
echo "status=$STATUS"
```

预期输出要点：

- stdout 包含 `Loaded 1 tasks; 2 groups × 1 runs = 2 invocations`。
- stdout 分别出现 `Group baseline workdir:` 和 `Group teamagent workdir:`。
- stdout 出现 baseline 与 teamagent 两次 `001-moment-vs-dayjs run=1`。
- report 写入 `$OUT/teamagent/bench-report.json` 和 `$OUT/teamagent/bench-report.md`。

真实 report 外部断言：

```bash
REPORT="$OUT/teamagent/bench-report.json"

node --input-type=module - "$REPORT" <<'NODE'
import fs from "node:fs";
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const errors = [];
const verdicts = new Set(["correct", "wrong", "neither", "error"]);
function assert(cond, msg) { if (!cond) errors.push(msg); }

assert(JSON.stringify(report.config.groups) === JSON.stringify(["baseline", "teamagent"]), "config.groups mismatch");
assert(report.config.tasks === "001", "config.tasks mismatch");
assert(report.config.runs === 1, "config.runs mismatch");
assert(report.rawResults.length === 2, "expected 2 rawResults");

const keys = report.rawResults.map((r) => `${r.group}:${r.taskId}:${r.run}`).sort();
assert(JSON.stringify(keys) === JSON.stringify([
  "baseline:001-moment-vs-dayjs:1",
  "teamagent:001-moment-vs-dayjs:1"
]), `raw result keys mismatch: ${JSON.stringify(keys)}`);

for (const r of report.rawResults) {
  assert(verdicts.has(r.verdict), `invalid verdict ${r.verdict}`);
  assert(typeof r.output === "string", "output must be string");
  assert(typeof r.durationMs === "number" && r.durationMs >= 0, "durationMs invalid");
}

const baseline = report.groups.find((g) => g.group === "baseline");
const teamagent = report.groups.find((g) => g.group === "teamagent");
assert(Boolean(baseline), "missing baseline summary");
assert(Boolean(teamagent), "missing teamagent summary");

if (baseline && teamagent) {
  const expectedPrr = baseline.wrongCount > 0 ? (baseline.wrongCount - teamagent.wrongCount) / baseline.wrongCount : 0;
  assert(Math.abs(report.comparison.prr - expectedPrr) < 1e-9, "prr mismatch");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  verdictByGroup: Object.fromEntries(report.rawResults.map((r) => [r.group, r.verdict])),
  comparison: report.comparison
}, null, 2));
NODE
```

通过标准：

- 两个 group 都产生 raw result。
- `bench-report.json` 的 `groups/comparison/rawResults/verdict` 字段完整且可外部重算。
- `teamagent` 的 verdict 不要求绝对为 correct；真实模型行为可能波动。但如果 baseline 是 wrong 且 teamagent 仍 wrong，需要结合 stdout 中 hook deny/allow 记录和 raw output 判断是 hook 未生效、seed 未命中，还是模型绕过/未写文件。
- 如果启动前缺少 hook bundle，预期应快速失败并输出 `ERROR: hook bundle missing: ... Run: pnpm --filter @teamagent/cli build:hook`；这属于前置条件失败，不是 benchmark 结果失败。

## 场景 F：失败路径，teamagent 缺 hook bundle

只在当前工作树确定没有 `packages/cli/dist/bin-pre-tool-use.cjs` 等 bundle 时运行；如果 bundle 已存在，可跳过。此场景不应删除已有 dist 文件。

命令：

```bash
if [ ! -f packages/cli/dist/bin-pre-tool-use.cjs ] || \
   [ ! -f packages/cli/dist/bin-post-tool-use.cjs ] || \
   [ ! -f packages/cli/dist/bin-user-prompt-submit.cjs ]; then
  BENCH_NO_COLOR=1 BENCH_QUIET=1 \
    pnpm benchmark -- --groups=teamagent --tasks=001 --runs=1 \
    --output-json="$OUT/missing-hook.json" \
    --output-md="$OUT/missing-hook.md" \
    >"$OUT/missing-hook.stdout.txt" 2>"$OUT/missing-hook.stderr.txt"
  STATUS=$?
  cat "$OUT/missing-hook.stdout.txt"
  cat "$OUT/missing-hook.stderr.txt"
  echo "status=$STATUS"
fi
```

预期：

- exit code 为 1。
- stderr 包含 `ERROR: hook bundle missing:`。
- stderr 包含 `Run: pnpm --filter @teamagent/cli build:hook`。
- 不应生成有效 `missing-hook.json` report。

通过标准：

- `teamagent` group 不在缺少 hook bundle 时静默跑 baseline-like 环境。

## 判定标准

Feature #13 audit 通过需要满足：

- 场景 A 通过：所有 fixture JSON、settings template、seed 文件结构可被外部 schema-check 验证。
- 场景 B 通过：外部 evaluator 契约验证 wrong/correct pattern 与 wrong 优先级。
- 场景 C 通过：外部 report checker 能验证 `groups/comparison/rawResults/verdict` 字段和聚合公式。
- 至少执行场景 D 或 E 中一个真实 smoke，并明确记录环境：
  - 如果 Claude SDK 可用，真实 smoke 必须产出 `bench-report.json` 和 `bench-report.md`。
  - 如果 Claude SDK 不可用，不能宣称真实 benchmark 通过，只能记录离线验证通过和 smoke blocked，blocked 原因来自 stderr / `rawResults[].errorMsg`。
- 若执行场景 E，必须先确认 hook bundle 存在或运行 `pnpm --filter @teamagent/cli build:hook`。不能把缺 hook 的失败当作 benchmark 逻辑失败。
- 对真实 report，必须用场景 C 的外部 checker 重算 summary/comparison；不能只看 reporter 自己写出的 Markdown。

不通过或需调查的信号：

- task JSON 能 parse 但 pattern 编译失败。
- baseline settings 出现 hooks，或 teamagent settings 缺少任一 hook。
- `bench-report.json` 缺少 `groups`、`comparison`、`rawResults`，或 raw result 缺少合法 `verdict`。
- group summary 与 rawResults 外部重算不一致。
- `comparison.prr` 与 baseline/teamagent wrongCount 公式不一致。
- `teamagent` group 在 hook bundle 缺失时继续运行。
- 所有真实 smoke rawResults 都是 `error`，且 `errorMsg` 指向代码路径而非认证/网络/模型环境问题。

## 建议记录模板

执行 audit 时把结果记录到临时目录即可，不写入仓库：

```bash
{
  echo "root=$ROOT"
  echo "node=$(node --version)"
  echo "pnpm=$(pnpm --version)"
  echo "date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee "$OUT/env.txt"
```

最终报告应附：

- 场景 A/B/C 的 stdout。
- 真实 smoke 的 stdout/stderr/status。
- 真实 `bench-report.json` 的外部 checker 输出。
- 如果真实 smoke blocked，附明确 blocked 原因。
