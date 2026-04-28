# Feature #19 非自证 Audit 草案：`StatusLine 基础能力`

## 目标

验证 TeamAgent statusLine 的两个基础能力：

1. `scripts/teamagent-statusline.cjs` 在 Claude Code statusLine 运行模型下，以当前项目 `cwd` 和当前 `HOME` 为边界，读取 project/global SQLite DB，并输出可见状态文本。
2. `installHook()` 只在可安全接管时写入 `<cwd>/.claude/settings.local.json.statusLine`；已有非 TeamAgent statusLine 时必须保留，不覆盖。

本 audit 不把 Vitest 断言或源码注释当作充分证据。结论必须来自隔离临时 `cwd`、隔离临时 `HOME`、外部创建的 SQLite `knowledge.db/global.db`、真实执行 `node scripts/teamagent-statusline.cjs` 的 stdout，以及独立读取 `.claude/settings.local.json` 的 JSON 检查。

## 源码追踪结论

statusLine 运行链路：

1. [scripts/teamagent-statusline.cjs](/Users/liushiyu/projects/TeamBrain/scripts/teamagent-statusline.cjs:1) 是独立 CJS 脚本，直接由 Claude Code statusLine command 执行。
2. 脚本启动时 `require("node:sqlite")`；不可用则输出 `TeamAgent正在运行 · (sqlite不可用)` 并退出 0。
3. project DB 固定为 `path.resolve(process.cwd(), ".teamagent/knowledge.db")`，global DB 固定为 `path.join(os.homedir(), ".teamagent", "global.db")`。这意味着审计必须控制 `cwd` 和 `HOME`，不能用当前开发仓库或真实 HOME。
4. 若 project DB 缺失且 `cwd` 像项目目录（存在 `.git`、`package.json`、`pyproject.toml`、`pnpm-workspace.yaml` 等 marker），脚本先输出 `⚠️  TeamAgent 未初始化本项目 · 运行 \`teamagent init\` 启用`，不会继续读取 global DB。
5. 若 project/global DB 都打不开，输出 `TeamAgent 未安装 · 运行 \`npm install -g teamagent-X.Y.Z.tgz\``。
6. 打开 DB 后执行的关键查询是：

```sql
SELECT COUNT(*) AS n
FROM knowledge
WHERE status = 'active' AND (type IS NULL OR type != 'wiki');

SELECT COUNT(*) AS n
FROM knowledge
WHERE status = 'active' AND type = 'wiki';

SELECT MAX(created_at) AS d
FROM knowledge
WHERE status = 'active';
```

当前可见输出只使用非 wiki active 规则数：`TeamAgent正在运行 · 规则库：<count>条`。`wikiCount`、`lastDate`、`lastWikiDate` 会被计算但尚未渲染；audit 应记录这一点，避免把不可见字段当成已交付能力。

install-hook 注册链路：

1. [packages/cli/src/commands/install-hook.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/install-hook.ts:115) 的 `installHook()` 写 `<cwd>/.claude/settings.local.json`。
2. PreToolUse bundle 是硬依赖；`hookEntry` 不存在时抛错。PostToolUse/UserPromptSubmit/Stop/statusLine 都是软依赖，只有对应 entry 文件存在才注册。
3. statusLine 默认 entry 是 `path.join(cliRoot(), "dist", "teamagent-statusline.cjs")`；也可通过 `statusLineEntry` 显式传入。
4. statusLine 只有一个槽位。`settings.statusLine` 缺失、空对象，或 `_teamagentTag === "teamagent-statusline"` 时，TeamAgent 写入：

```json
{
  "type": "command",
  "command": "node <statusLineEntry>",
  "_teamagentTag": "teamagent-statusline"
}
```

5. 若已有 statusLine 但没有 TeamAgent tag，`installHook()` 设置 `statusLineSkipped=true`，并保留原 JSON，不覆盖用户配置。
6. 发布包构建在 [packages/teamagent/tsup.config.ts](/Users/liushiyu/projects/TeamBrain/packages/teamagent/tsup.config.ts:91) 中把 raw `scripts/teamagent-statusline.cjs` 复制到 `dist/teamagent-statusline.cjs`，因为 bundle 会破坏 `require("node:sqlite")`。

## Audit 工作区设计

所有文件写到临时目录；只读取仓库源码，不改真实 `.claude`、真实 `~/.teamagent` 或受保护文件。

```bash
cd /Users/liushiyu/projects/TeamBrain

ROOT="$(mktemp -d /tmp/teamagent-statusline-audit.XXXXXX)"
AUDIT_HOME="$ROOT/home"
PROJECT="$ROOT/project"
NON_PROJECT="$ROOT/non-project"
OUT="$ROOT/out"
REPO="/Users/liushiyu/projects/TeamBrain"
STATUSLINE="$REPO/scripts/teamagent-statusline.cjs"
TSX="$REPO/node_modules/.bin/tsx"

mkdir -p "$AUDIT_HOME/.teamagent" "$PROJECT/.teamagent" "$NON_PROJECT" "$OUT"
export ROOT AUDIT_HOME PROJECT NON_PROJECT OUT REPO STATUSLINE TSX
```

创建外部 DB seed 工具。表结构只包含 statusLine 查询需要的字段，证明脚本没有依赖测试 fixture 或仓库 DB：

```bash
cat > "$ROOT/make-statusline-db.cjs" <<'EOF'
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

const [dbPath, rowsJson] = process.argv.slice(2);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.rmSync(dbPath, { force: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE knowledge (
    status TEXT,
    type TEXT,
    created_at TEXT
  );
`);
const insert = db.prepare(
  "INSERT INTO knowledge (status, type, created_at) VALUES (?, ?, ?)",
);
for (const r of JSON.parse(rowsJson)) {
  insert.run(r.status, r.type ?? null, r.created_at);
}
db.close();
EOF
```

运行包装：

```bash
run_statusline() {
  local cwd="$1"
  local name="$2"
  (
    cd "$cwd"
    HOME="$AUDIT_HOME" node "$STATUSLINE"
  ) >"$OUT/$name.stdout.txt" 2>"$OUT/$name.stderr.txt"
  printf "%s" "$?" >"$OUT/$name.exit-code.txt"
}

assert_no_unexpected_stderr() {
  local file="$1"
  if [ ! -s "$file" ]; then
    return 0
  fi
  if grep -Fq "ExperimentalWarning: SQLite is an experimental feature" "$file"; then
    return 0
  fi
  cat "$file" >&2
  return 1
}
```

## 核查场景 A：project/global SQLite 聚合

命令：

```bash
touch "$PROJECT/package.json"

node "$ROOT/make-statusline-db.cjs" "$PROJECT/.teamagent/knowledge.db" '[
  {"status":"active","type":"avoidance","created_at":"2026-04-20T00:00:00Z"},
  {"status":"active","type":"practice","created_at":"2026-04-21T00:00:00Z"},
  {"status":"active","type":"wiki","created_at":"2026-04-22T00:00:00Z"},
  {"status":"archived","type":"avoidance","created_at":"2026-04-23T00:00:00Z"}
]'

node "$ROOT/make-statusline-db.cjs" "$AUDIT_HOME/.teamagent/global.db" '[
  {"status":"active","type":null,"created_at":"2026-04-24T00:00:00Z"},
  {"status":"active","type":"avoidance","created_at":"2026-04-25T00:00:00Z"},
  {"status":"active","type":"practice","created_at":"2026-04-26T00:00:00Z"},
  {"status":"active","type":"wiki","created_at":"2026-04-27T00:00:00Z"}
]'

run_statusline "$PROJECT" project-and-global
cat "$OUT/project-and-global.stdout.txt"
cat "$OUT/project-and-global.stderr.txt"
cat "$OUT/project-and-global.exit-code.txt"
```

预期输出：

```text
TeamAgent正在运行 · 规则库：5条
```

外部断言：

```bash
test "$(cat "$OUT/project-and-global.exit-code.txt")" = "0"
test "$(cat "$OUT/project-and-global.stdout.txt")" = "TeamAgent正在运行 · 规则库：5条"
assert_no_unexpected_stderr "$OUT/project-and-global.stderr.txt"
```

判定标准：

- 2 条 project active 非 wiki + 3 条 global active 非 wiki = `5条`。
- project/global 的 active wiki 行不计入当前可见规则数。
- archived 行不计入。
- stdout 来自真实脚本，不来自测试 mock。
- stderr 为空或仅包含 Node 对 `node:sqlite` 的 `ExperimentalWarning`；其他 stderr 视为失败。若产品要求 statusLine command 完全无 stderr，应把该 warning 记录为待修复风险。

## 核查场景 B：project DB 缺失时的项目初始化提醒

命令：

```bash
PROJECT_MISSING="$ROOT/project-missing-db"
mkdir -p "$PROJECT_MISSING"
touch "$PROJECT_MISSING/package.json"

run_statusline "$PROJECT_MISSING" missing-project-db
cat "$OUT/missing-project-db.stdout.txt"
cat "$OUT/missing-project-db.stderr.txt"
cat "$OUT/missing-project-db.exit-code.txt"
```

预期输出：

```text
⚠️  TeamAgent 未初始化本项目 · 运行 `teamagent init` 启用
```

外部断言：

```bash
test "$(cat "$OUT/missing-project-db.exit-code.txt")" = "0"
grep -Fq "TeamAgent 未初始化本项目" "$OUT/missing-project-db.stdout.txt"
assert_no_unexpected_stderr "$OUT/missing-project-db.stderr.txt"
```

判定标准：

- 即使 `$AUDIT_HOME/.teamagent/global.db` 存在，项目 marker 存在但 project DB 缺失时仍优先提醒 `teamagent init`。
- 这证明脚本按 `cwd` 判断项目初始化状态，不是只读 global DB。

## 核查场景 C：非项目目录只读 global DB

命令：

```bash
rm -rf "$NON_PROJECT/.teamagent"
run_statusline "$NON_PROJECT" global-only
cat "$OUT/global-only.stdout.txt"
cat "$OUT/global-only.stderr.txt"
cat "$OUT/global-only.exit-code.txt"
```

预期输出：

```text
TeamAgent正在运行 · 规则库：3条
```

外部断言：

```bash
test "$(cat "$OUT/global-only.exit-code.txt")" = "0"
test "$(cat "$OUT/global-only.stdout.txt")" = "TeamAgent正在运行 · 规则库：3条"
assert_no_unexpected_stderr "$OUT/global-only.stderr.txt"
```

判定标准：

- 非项目目录没有 project marker，所以不会触发“未初始化本项目”。
- 只统计 global DB 中 3 条 active 非 wiki。

## 核查场景 D：无 DB 的安装缺失提示

命令：

```bash
EMPTY_HOME="$ROOT/empty-home"
EMPTY_DIR="$ROOT/empty-non-project"
mkdir -p "$EMPTY_HOME" "$EMPTY_DIR"
(
  cd "$EMPTY_DIR"
  HOME="$EMPTY_HOME" node "$STATUSLINE"
) >"$OUT/no-db.stdout.txt" 2>"$OUT/no-db.stderr.txt"
printf "%s" "$?" >"$OUT/no-db.exit-code.txt"

cat "$OUT/no-db.stdout.txt"
cat "$OUT/no-db.stderr.txt"
cat "$OUT/no-db.exit-code.txt"
```

预期输出：

```text
TeamAgent 未安装 · 运行 `npm install -g teamagent-X.Y.Z.tgz`
```

外部断言：

```bash
test "$(cat "$OUT/no-db.exit-code.txt")" = "0"
grep -Fq "TeamAgent 未安装" "$OUT/no-db.stdout.txt"
assert_no_unexpected_stderr "$OUT/no-db.stderr.txt"
```

判定标准：

- project/global DB 都不存在且 cwd 不是项目目录时，输出安装缺失提示。

## 核查场景 E：installHook 写入 TeamAgent statusLine

用生产 `installHook()` 写临时项目，但显式传入存在的 `hookEntry/statusLineEntry`，避免依赖当前仓库是否已 build。JSON 断言用独立 Node 读取 settings 文件。

```bash
INSTALL_PROJECT="$ROOT/install-project"
FAKE_HOOK="$ROOT/fake-pre-tool-use.cjs"
mkdir -p "$INSTALL_PROJECT"
printf 'process.exit(0)\n' > "$FAKE_HOOK"

cat > "$ROOT/install-hook-driver.mjs" <<'EOF'
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
const cwd = process.env.INSTALL_PROJECT;
const hookEntry = process.env.FAKE_HOOK;
const statusLineEntry = process.env.STATUSLINE;
const mode = process.argv[2];

const { installHook } = await import(
  pathToFileURL(path.join(repo, "packages/cli/src/commands/install-hook.ts")).href
);

const settingsPath = path.join(cwd, ".claude", "settings.local.json");
if (mode === "user-statusline") {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({
    statusLine: { type: "command", command: "node /custom/user/statusline.js" }
  }, null, 2));
}
if (mode === "tagged-statusline") {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({
    statusLine: {
      type: "command",
      command: "node /old/teamagent-statusline.cjs",
      _teamagentTag: "teamagent-statusline"
    }
  }, null, 2));
}

const result = installHook({ cwd, hookEntry, statusLineEntry });
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
console.log(JSON.stringify({ result, settings }, null, 2));
EOF

INSTALL_PROJECT="$INSTALL_PROJECT" FAKE_HOOK="$FAKE_HOOK" \
  "$TSX" "$ROOT/install-hook-driver.mjs" fresh \
  >"$OUT/install-fresh.json"

cat "$OUT/install-fresh.json"
```

外部断言：

```bash
node - "$OUT/install-fresh.json" "$STATUSLINE" <<'NODE'
const fs = require("node:fs");
const [file, statusLineEntry] = process.argv.slice(2);
const got = JSON.parse(fs.readFileSync(file, "utf8"));
const s = got.settings.statusLine;
if (got.result.statusLineSkipped !== false) throw new Error("statusLineSkipped should be false");
if (!s) throw new Error("statusLine missing");
if (s.type !== "command") throw new Error("statusLine.type mismatch");
if (s._teamagentTag !== "teamagent-statusline") throw new Error("statusLine tag mismatch");
if (!s.command.startsWith("node ")) throw new Error("statusLine command should invoke node");
if (!s.command.includes(statusLineEntry.replace(/\\/g, "/"))) {
  throw new Error(`statusLine command does not include entry: ${s.command}`);
}
if (!got.settings.hooks?.PreToolUse?.some((h) => h._teamagentTag === "teamagent-pre-tool-use")) {
  throw new Error("PreToolUse TeamAgent hook missing");
}
NODE
```

预期 settings 关键 JSON：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /Users/liushiyu/projects/TeamBrain/scripts/teamagent-statusline.cjs",
    "_teamagentTag": "teamagent-statusline"
  }
}
```

判定标准：

- `.claude/settings.local.json.statusLine` 存在。
- `type` 是 `command`，`_teamagentTag` 是 `teamagent-statusline`。
- `command` 用 `node` 执行 statusLine 脚本路径。
- `statusLineSkipped=false`。

## 核查场景 F：不覆盖用户非 TeamAgent statusLine

命令：

```bash
INSTALL_PROJECT="$ROOT/install-project-user-existing"
mkdir -p "$INSTALL_PROJECT"

INSTALL_PROJECT="$INSTALL_PROJECT" FAKE_HOOK="$FAKE_HOOK" \
  "$TSX" "$ROOT/install-hook-driver.mjs" user-statusline \
  >"$OUT/install-user-existing.json"

cat "$OUT/install-user-existing.json"
```

外部断言：

```bash
node - "$OUT/install-user-existing.json" <<'NODE'
const fs = require("node:fs");
const got = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const s = got.settings.statusLine;
if (got.result.statusLineSkipped !== true) throw new Error("statusLineSkipped should be true");
if (s.command !== "node /custom/user/statusline.js") throw new Error(`user command overwritten: ${s.command}`);
if (s._teamagentTag !== undefined) throw new Error("user statusLine should not gain TeamAgent tag");
if (!got.settings.hooks?.PreToolUse?.some((h) => h._teamagentTag === "teamagent-pre-tool-use")) {
  throw new Error("PreToolUse TeamAgent hook missing");
}
NODE
```

预期 settings 关键 JSON：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /custom/user/statusline.js"
  }
}
```

判定标准：

- 用户原有 statusLine command 完全不变。
- 没有追加 `_teamagentTag`。
- `statusLineSkipped=true`，证明 install-hook 识别到冲突并跳过。
- PreToolUse 仍可注册；statusLine 冲突不应阻断其他 hook。

## 核查场景 G：可更新旧 TeamAgent statusLine

命令：

```bash
INSTALL_PROJECT="$ROOT/install-project-tagged-existing"
mkdir -p "$INSTALL_PROJECT"

INSTALL_PROJECT="$INSTALL_PROJECT" FAKE_HOOK="$FAKE_HOOK" \
  "$TSX" "$ROOT/install-hook-driver.mjs" tagged-statusline \
  >"$OUT/install-tagged-existing.json"

cat "$OUT/install-tagged-existing.json"
```

外部断言：

```bash
node - "$OUT/install-tagged-existing.json" "$STATUSLINE" <<'NODE'
const fs = require("node:fs");
const [file, statusLineEntry] = process.argv.slice(2);
const got = JSON.parse(fs.readFileSync(file, "utf8"));
const s = got.settings.statusLine;
if (got.result.statusLineSkipped !== false) throw new Error("tagged TeamAgent statusLine should be updatable");
if (s._teamagentTag !== "teamagent-statusline") throw new Error("TeamAgent tag missing");
if (s.command.includes("/old/teamagent-statusline.cjs")) throw new Error("old TeamAgent command was not replaced");
if (!s.command.includes(statusLineEntry.replace(/\\/g, "/"))) throw new Error(`new command missing: ${s.command}`);
NODE
```

判定标准：

- 已打 `_teamagentTag: "teamagent-statusline"` 的旧配置会被更新。
- `statusLineSkipped=false`。
- 更新只针对 TeamAgent 自己的 statusLine，不证明可以覆盖用户 statusLine；用户覆盖保护由场景 F 单独证明。

## 总判定标准

Feature #19 通过 audit 需要同时满足：

- statusLine 脚本在隔离 `cwd/HOME` 下退出码为 0，stderr 为空或仅包含 `node:sqlite` 的 experimental warning；其他 stderr 失败。
- project/global SQLite 查询结果与 seed 行数严格一致：active 非 wiki 才进入可见规则数。
- project marker 存在但 project DB 缺失时，输出初始化提醒，并且该提醒优先于 global DB 聚合。
- 非项目目录可以只读取 global DB。
- 无任何 DB 时输出安装缺失提示。
- install-hook 写入 `.claude/settings.local.json.statusLine` 的 JSON 结构正确。
- 已有非 TeamAgent statusLine 时不覆盖、不打 tag，并返回 `statusLineSkipped=true`。
- 已有 TeamAgent tagged statusLine 时可更新为当前 entry。

## 风险与边界

- `wikiCount` 和最近日期当前没有渲染到 stdout；若产品定义要求显示 wiki 或更新时间，本 feature 只能算基础能力，不算完整状态栏体验。
- 当前 Node 可能对 `require("node:sqlite")` 输出 `ExperimentalWarning` 到 stderr；stdout 功能不受影响，但如果 Claude Code statusLine 对 stderr 敏感，需要后续把 command 包装为无 warning 形式或改用稳定 SQLite 入口。
- `installHook()` 的 source/dev 模式若不显式传 `statusLineEntry`，会依赖 `cliRoot()/dist/teamagent-statusline.cjs` 是否存在；发布包构建通过 `packages/teamagent/tsup.config.ts` 复制 raw CJS。若要审发布包默认路径，应在独立 unpack 的 tarball 中重复场景 E/F/G，不应只审 source import。
- 本 audit 没有启动真实 Claude Code UI；它验证的是 statusLine command 与 settings 注册语义，不验证 Claude Code 是否实际渲染该文本。
