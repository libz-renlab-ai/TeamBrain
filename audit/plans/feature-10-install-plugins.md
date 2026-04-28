# Feature #10 非自证 Audit 草案：`teamagent install-plugins`

## 目标

验证 `teamagent install-plugins` 在真实 CLI 入口、真实 PATH 查找、真实子进程 spawn 下，按团队默认插件 bundle 正确编排外部 Claude Code 命令：

- 先执行 `claude plugin marketplace add <owner/repo>` 注册必要 marketplace。
- 再执行 `claude plugin install <plugin>@<marketplace>` 安装插件。
- `--only=` 只安装指定默认插件，并只注册这些插件需要的 marketplace。
- `--scope=user|project|local` 只透传到 plugin install，不传给 marketplace add。
- `--dry-run` 不调用外部 `claude`。
- 未知插件产生失败结果，且不会对未知插件发起外部 install。

本 audit 关注外部 `claude plugin marketplace add/install` 调用编排，不验证插件本体是否真的可用，也不把 Vitest 的 fake installer 结果当作充分证据。结论必须来自 fake `claude` binary 记录的 JSONL command log、真实运行的 `teamagent` CLI stdout/stderr/exit code，以及对日志内容的外部检查。

## 源码追踪结论

调用链：

1. `packages/cli/src/bin.ts` 导入 `executeInstallPlugins`、`parseInstallPluginsArgs`、`renderInstallPluginsResult`。
2. `packages/cli/src/bin.ts:502` 的 `install-plugins` 分支调用 `parseInstallPluginsArgs(rest)`，随后 `executeInstallPlugins(opts)`，渲染结果；`result.ok === false` 时 `process.exit(1)`。
3. `packages/cli/src/commands/install-plugins.ts` 解析参数：
   - `--dry-run` 设置 `dryRun=true`。
   - `--only=a,b` 按逗号拆成 plugin name 列表。
   - `--scope=user|project|local` 记录 scope；其他 scope 当前会被忽略。
4. `executeInstallPlugins()` 使用 `DEFAULT_PLUGINS` 和 `DEFAULT_MARKETPLACES` 解析待安装集合；没有传入测试 installer 时创建 `new ClaudePluginInstaller()`。
5. 非 dry-run 时，先遍历 marketplaces 调用 `installer.addMarketplace(m)`，再遍历 plugins 调用 `installer.installPlugin(p, scopeOpt)`。
6. `packages/adapters/src/plugins/claude-plugin-installer.ts` 的 `addMarketplace()` 组装 argv：`["plugin", "marketplace", "add", m.repo]`。
7. `installPlugin()` 组装 argv：`["plugin", "install", "<plugin>@<marketplace>"]`；有 scope 时追加 `["--scope", scope]`。
8. 默认 spawner 调用 `node:child_process.spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })`，因此 audit 可以通过临时 PATH 前置 fake `claude` 捕获真实 argv。
9. `interpretCmd()` 用 exit code、stdout/stderr 中的 `✔`、`Successfully`、`already`、`✘`、`Failed` 判定 added/already/failed；fake binary 必须输出可被生产解释器识别的成功文本。

默认 bundle 来自 `packages/core/src/init/default-plugins.ts`：

```json
{
  "marketplaces": [
    { "name": "claude-plugins-official", "repo": "anthropics/claude-plugins-official" },
    { "name": "knowledge-work-plugins", "repo": "anthropics/knowledge-work-plugins" },
    { "name": "caveman", "repo": "JuliusBrussee/caveman" }
  ],
  "plugins": [
    "superpowers@claude-plugins-official",
    "playground@claude-plugins-official",
    "sales@knowledge-work-plugins",
    "caveman@caveman"
  ]
}
```

## Audit 工作区设计

所有写入限制在临时目录。fake `claude` 只记录 argv，不触碰真实 `~/.claude`。

```bash
cd /Users/liushiyu/projects/TeamBrain

ROOT="$(mktemp -d /tmp/teamagent-install-plugins-audit.XXXXXX)"
AUDIT_HOME="$ROOT/home"
AUDIT_BIN="$ROOT/bin"
AUDIT_OUT="$ROOT/out"
CLAUDE_LOG="$AUDIT_OUT/claude-commands.jsonl"
TEAMAGENT_TSX="/Users/liushiyu/projects/TeamBrain/node_modules/.bin/tsx"
TEAMAGENT_BIN="/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts"

mkdir -p "$AUDIT_HOME" "$AUDIT_BIN" "$AUDIT_OUT"
export ROOT AUDIT_HOME AUDIT_BIN AUDIT_OUT CLAUDE_LOG TEAMAGENT_TSX TEAMAGENT_BIN
```

创建 fake `claude`：

```bash
cat > "$AUDIT_BIN/claude" <<'EOF'
#!/usr/bin/env node
const fs = require("node:fs");

const log = process.env.CLAUDE_FAKE_LOG;
const argv = process.argv.slice(2);
const record = {
  argv,
  cwd: process.cwd(),
  home: process.env.HOME || "",
  pathHead: (process.env.PATH || "").split(":").slice(0, 3),
  ts: new Date().toISOString()
};

if (!log) {
  console.error("CLAUDE_FAKE_LOG is required");
  process.exit(70);
}

fs.appendFileSync(log, JSON.stringify(record) + "\n");

if (argv[0] === "plugin" && argv[1] === "marketplace" && argv[2] === "add") {
  console.log(`✔ Successfully added marketplace: ${argv[3]}`);
  process.exit(0);
}

if (argv[0] === "plugin" && argv[1] === "install") {
  const scopeIdx = argv.indexOf("--scope");
  const scope = scopeIdx >= 0 ? argv[scopeIdx + 1] : "default";
  console.log(`✔ Successfully installed plugin: ${argv[2]} (scope: ${scope})`);
  process.exit(0);
}

console.log(`✘ Failed: unexpected argv ${argv.join(" ")}`);
process.exit(0);
EOF
chmod +x "$AUDIT_BIN/claude"
```

基础运行包装：

```bash
run_teamagent_install_plugins() {
  rm -f "$CLAUDE_LOG" "$AUDIT_OUT/stdout.txt" "$AUDIT_OUT/stderr.txt"
  (
    cd "$ROOT"
    HOME="$AUDIT_HOME" \
    PATH="$AUDIT_BIN:$PATH" \
    CLAUDE_FAKE_LOG="$CLAUDE_LOG" \
    "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" install-plugins "$@"
  ) >"$AUDIT_OUT/stdout.txt" 2>"$AUDIT_OUT/stderr.txt"
}
```

JSONL 查看工具：

```bash
show_log() {
  if [ -f "$CLAUDE_LOG" ]; then
    node -e 'const fs=require("fs"); for (const l of fs.readFileSync(process.argv[1],"utf8").trim().split(/\n/).filter(Boolean)) console.log(JSON.stringify(JSON.parse(l)))' "$CLAUDE_LOG"
  else
    echo "(no claude log)"
  fi
}
```

## 关键 JSONL command log 形态

默认安装成功时，`$CLAUDE_LOG` 必须是 7 行 JSONL。关键字段示例：

```jsonl
{"argv":["plugin","marketplace","add","anthropics/claude-plugins-official"],"home":"/tmp/teamagent-install-plugins-audit.X/home"}
{"argv":["plugin","marketplace","add","anthropics/knowledge-work-plugins"],"home":"/tmp/teamagent-install-plugins-audit.X/home"}
{"argv":["plugin","marketplace","add","JuliusBrussee/caveman"],"home":"/tmp/teamagent-install-plugins-audit.X/home"}
{"argv":["plugin","install","superpowers@claude-plugins-official"],"home":"/tmp/teamagent-install-plugins-audit.X/home"}
{"argv":["plugin","install","playground@claude-plugins-official"],"home":"/tmp/teamagent-install-plugins-audit.X/home"}
{"argv":["plugin","install","sales@knowledge-work-plugins"],"home":"/tmp/teamagent-install-plugins-audit.X/home"}
{"argv":["plugin","install","caveman@caveman"],"home":"/tmp/teamagent-install-plugins-audit.X/home"}
```

`pathHead[0]` 应该等于 `$AUDIT_BIN`，证明命中的是 fake `claude`。`home` 应该等于 `$AUDIT_HOME`，证明没有使用真实 HOME。

## 核查场景

### A. 默认行为：3 个 marketplace + 4 个 plugin

命令：

```bash
run_teamagent_install_plugins
STATUS=$?
cat "$AUDIT_OUT/stdout.txt"
cat "$AUDIT_OUT/stderr.txt"
show_log
echo "status=$STATUS"
```

外部断言：

```bash
test "$STATUS" -eq 0
test "$(wc -l < "$CLAUDE_LOG" | tr -d ' ')" = "7"

node - "$CLAUDE_LOG" <<'NODE'
const fs = require("fs");
const rows = fs.readFileSync(process.argv[2], "utf8").trim().split(/\n/).map(JSON.parse);
const actual = rows.map((r) => r.argv);
const expected = [
  ["plugin", "marketplace", "add", "anthropics/claude-plugins-official"],
  ["plugin", "marketplace", "add", "anthropics/knowledge-work-plugins"],
  ["plugin", "marketplace", "add", "JuliusBrussee/caveman"],
  ["plugin", "install", "superpowers@claude-plugins-official"],
  ["plugin", "install", "playground@claude-plugins-official"],
  ["plugin", "install", "sales@knowledge-work-plugins"],
  ["plugin", "install", "caveman@caveman"],
];
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error(JSON.stringify(actual, null, 2));
  process.exit(1);
}
if (!rows.every((r) => r.home === process.env.AUDIT_HOME)) {
  console.error("HOME was not isolated");
  process.exit(1);
}
if (!rows.every((r) => r.pathHead[0] === process.env.AUDIT_BIN)) {
  console.error("fake claude was not first in PATH");
  process.exit(1);
}
NODE

grep -q "Marketplaces:" "$AUDIT_OUT/stdout.txt"
grep -q "Plugins:" "$AUDIT_OUT/stdout.txt"
grep -q "7 新装" "$AUDIT_OUT/stdout.txt"
grep -q "重启 Claude Code" "$AUDIT_OUT/stdout.txt"
test ! -s "$AUDIT_OUT/stderr.txt"
```

预期输出要点：

- stdout 有 `Marketplaces:`、`Plugins:`，列出 3 个 marketplace 和 4 个 plugin。
- 汇总为 `7 新装`。
- stderr 为空。
- JSONL 顺序严格为「全部 marketplace add」之后「全部 plugin install」。
- plugin install 默认不带 `--scope`；这是把 scope 留给 Claude CLI 默认值，不是显式 user scope。

通过标准：

- 7 条外部调用全部命中 fake `claude`。
- 3 条 marketplace add 的 repo 与 default specs 完全一致。
- 4 条 plugin install 的 `<plugin>@<marketplace>` 与 default specs 完全一致。
- 调用顺序与源码编排一致，不能交错 marketplace/plugin。

### B. `--scope=project`：scope 只传给 plugin install

命令：

```bash
run_teamagent_install_plugins --scope=project
STATUS=$?
show_log
echo "status=$STATUS"
```

外部断言：

```bash
test "$STATUS" -eq 0

node - "$CLAUDE_LOG" <<'NODE'
const fs = require("fs");
const rows = fs.readFileSync(process.argv[2], "utf8").trim().split(/\n/).map(JSON.parse);
const marketplaceRows = rows.filter((r) => r.argv[1] === "marketplace");
const pluginRows = rows.filter((r) => r.argv[1] === "install");
if (marketplaceRows.length !== 3 || pluginRows.length !== 4) process.exit(1);
if (marketplaceRows.some((r) => r.argv.includes("--scope"))) {
  console.error("marketplace add unexpectedly received --scope");
  process.exit(1);
}
for (const r of pluginRows) {
  const tail = r.argv.slice(-2);
  if (tail[0] !== "--scope" || tail[1] !== "project") {
    console.error(`plugin install missing project scope: ${JSON.stringify(r.argv)}`);
    process.exit(1);
  }
}
NODE

grep -q "7 新装" "$AUDIT_OUT/stdout.txt"
```

预期 JSONL plugin 行示例：

```jsonl
{"argv":["plugin","install","superpowers@claude-plugins-official","--scope","project"]}
{"argv":["plugin","install","caveman@caveman","--scope","project"]}
```

通过标准：

- marketplace 行没有 `--scope`。
- 每条 plugin install 行都以 `--scope project` 结尾。
- stdout 成功汇总仍为 7 新装。

### C. `--only=caveman`：过滤 plugin 且只注册必要 marketplace

命令：

```bash
run_teamagent_install_plugins --only=caveman --scope=local
STATUS=$?
cat "$AUDIT_OUT/stdout.txt"
show_log
echo "status=$STATUS"
```

外部断言：

```bash
test "$STATUS" -eq 0
test "$(wc -l < "$CLAUDE_LOG" | tr -d ' ')" = "2"

node - "$CLAUDE_LOG" <<'NODE'
const fs = require("fs");
const actual = fs.readFileSync(process.argv[2], "utf8").trim().split(/\n/).map((l) => JSON.parse(l).argv);
const expected = [
  ["plugin", "marketplace", "add", "JuliusBrussee/caveman"],
  ["plugin", "install", "caveman@caveman", "--scope", "local"],
];
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error(JSON.stringify(actual, null, 2));
  process.exit(1);
}
NODE

grep -q "caveman@caveman" "$AUDIT_OUT/stdout.txt"
! grep -q "superpowers@claude-plugins-official" "$AUDIT_OUT/stdout.txt"
! grep -q "sales@knowledge-work-plugins" "$AUDIT_OUT/stdout.txt"
grep -q "2 新装" "$AUDIT_OUT/stdout.txt"
```

通过标准：

- command log 只有 2 行。
- 没有注册 official / knowledge-work marketplaces。
- 没有安装 superpowers / playground / sales。
- `--scope=local` 透传到唯一 plugin install。

### D. `--only=superpowers,playground`：同 marketplace 去重

命令：

```bash
run_teamagent_install_plugins --only=superpowers,playground --scope=user
STATUS=$?
show_log
echo "status=$STATUS"
```

外部断言：

```bash
test "$STATUS" -eq 0
test "$(wc -l < "$CLAUDE_LOG" | tr -d ' ')" = "3"

node - "$CLAUDE_LOG" <<'NODE'
const fs = require("fs");
const actual = fs.readFileSync(process.argv[2], "utf8").trim().split(/\n/).map((l) => JSON.parse(l).argv);
const expected = [
  ["plugin", "marketplace", "add", "anthropics/claude-plugins-official"],
  ["plugin", "install", "superpowers@claude-plugins-official", "--scope", "user"],
  ["plugin", "install", "playground@claude-plugins-official", "--scope", "user"],
];
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error(JSON.stringify(actual, null, 2));
  process.exit(1);
}
NODE
```

通过标准：

- official marketplace 只 add 一次。
- 两个 plugin 均安装，且都带 `--scope user`。

### E. `--dry-run`：不调用 fake `claude`

命令：

```bash
run_teamagent_install_plugins --dry-run --scope=project
STATUS=$?
cat "$AUDIT_OUT/stdout.txt"
cat "$AUDIT_OUT/stderr.txt"
show_log
echo "status=$STATUS"
```

外部断言：

```bash
test "$STATUS" -eq 0
test ! -e "$CLAUDE_LOG"
grep -q "预览模式" "$AUDIT_OUT/stdout.txt"
grep -q "dry-run" "$AUDIT_OUT/stdout.txt"
grep -q "7 将执行" "$AUDIT_OUT/stdout.txt"
test ! -s "$AUDIT_OUT/stderr.txt"
```

通过标准：

- 没有 `$CLAUDE_LOG`，或者文件不存在。
- stdout 明确是预览模式，列出 would add / would install。
- 即使传入 `--scope=project`，dry-run 也不能产生任何外部 `claude` 调用。

### F. 未知 plugin：失败退出且不安装未知项

命令：

```bash
set +e
run_teamagent_install_plugins --only=ghost
STATUS=$?
set -e
cat "$AUDIT_OUT/stdout.txt"
cat "$AUDIT_OUT/stderr.txt"
show_log
echo "status=$STATUS"
```

外部断言：

```bash
test "$STATUS" -eq 1
test ! -e "$CLAUDE_LOG"
grep -q "unknown plugin" "$AUDIT_OUT/stdout.txt"
grep -q "ghost" "$AUDIT_OUT/stdout.txt"
grep -q "1 失败" "$AUDIT_OUT/stdout.txt"
test ! -s "$AUDIT_OUT/stderr.txt"
```

通过标准：

- CLI 退出码为 1。
- 没有任何 fake `claude` 记录，证明 unknown-only 不会注册 marketplace 或安装插件。
- stdout 包含 unknown plugin 失败项。

### G. 混合 known + unknown：先执行已知项，再报告未知项

命令：

```bash
set +e
run_teamagent_install_plugins --only=caveman,ghost --scope=project
STATUS=$?
set -e
cat "$AUDIT_OUT/stdout.txt"
show_log
echo "status=$STATUS"
```

外部断言：

```bash
test "$STATUS" -eq 1
test "$(wc -l < "$CLAUDE_LOG" | tr -d ' ')" = "2"

node - "$CLAUDE_LOG" <<'NODE'
const fs = require("fs");
const actual = fs.readFileSync(process.argv[2], "utf8").trim().split(/\n/).map((l) => JSON.parse(l).argv);
const expected = [
  ["plugin", "marketplace", "add", "JuliusBrussee/caveman"],
  ["plugin", "install", "caveman@caveman", "--scope", "project"],
];
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error(JSON.stringify(actual, null, 2));
  process.exit(1);
}
NODE

grep -q "caveman@caveman" "$AUDIT_OUT/stdout.txt"
grep -q "unknown plugin" "$AUDIT_OUT/stdout.txt"
grep -q "ghost" "$AUDIT_OUT/stdout.txt"
grep -q "1 新装" "$AUDIT_OUT/stdout.txt"
grep -q "1 失败" "$AUDIT_OUT/stdout.txt"
```

通过标准：

- 已知 `caveman` 的 marketplace/plugin 调用照常发生。
- 未知 `ghost` 不出现在 command log 的 argv 中。
- 由于 summary.failed > 0，CLI 最终退出 1。

## 判定标准汇总

通过 Feature #10 非自证 audit 需要同时满足：

- 使用真实 `packages/cli/src/bin.ts install-plugins` 入口运行，不直接调用 `executeInstallPlugins()`。
- fake `claude` 位于临时 PATH 首位，JSONL 中每条记录的 `pathHead[0]` 为 `$AUDIT_BIN`。
- 每次运行的 `HOME` 为 `$AUDIT_HOME`，不使用真实用户目录。
- 默认场景恰好 7 次外部调用，顺序为 3 次 marketplace add 后 4 次 plugin install。
- `--only` 只影响默认 bundle 内的 plugin name，且 marketplace 集合按 filtered plugins 去重。
- `--scope` 只进入 plugin install argv，不进入 marketplace add argv。
- `--dry-run` 没有任何外部 `claude` 调用。
- unknown-only 场景没有外部调用且退出 1；mixed known/unknown 场景只对 known 项调用外部命令并最终退出 1。
- stdout 的渲染结果与 command log 一致；stderr 在这些 fake 成功/unknown 场景中为空。

## 风险与补充观察

- 当前 `parseInstallPluginsArgs()` 对非法 `--scope=bad` 静默忽略，不报错。若产品预期是严格参数校验，应另开缺陷；本 audit 只记录现状。
- 默认未传 `--scope` 时，生产代码不显式传 `--scope user`，而是依赖 Claude CLI 默认 scope。文档和判定标准应避免误写成“默认 argv 带 user”。
- `interpretCmd()` 依赖 Claude CLI 输出文本识别状态；fake binary 必须输出 `✔ Successfully...`，否则会影响渲染汇总。
- 此 audit 不验证真实 marketplace 仓库是否存在、网络是否可达、插件能否加载；这些属于集成/线上依赖验证，不适合在非自证本地 audit 中直接执行。
