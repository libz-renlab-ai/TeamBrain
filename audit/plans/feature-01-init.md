# Feature #1 非自证 audit 草案：`teamagent init 初始化完整流程`

## 输入证据

- 用户指定审计范围：`teamagent init` 完整流程，要求追踪 `bin.ts -> commands/init.ts -> seed/rules.jsonl -> SQLite/CLAUDE.md/settings 输出`。
- 用户约束：不运行真实 `init` 修改用户环境；可以设计临时 `HOME`/临时 `cwd` 命令；只写本文件。
- 当前未触碰的既有工作树变更：`scripts/claudefast-stream-json-tests.ts`、`scripts/out/claudefast-manual/`。

## 关键源码路径

- CLI 入口：[packages/cli/src/bin.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts:260)
  - `case "init"` 调 `parseInitArgs(rest)`、`executeInit(opts)`、`renderInitResult(result)`；失败时 `process.exit(1)`。
- Init 主流程：[packages/cli/src/commands/init.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/init.ts:112)
  - 默认路径：项目 DB 为 `<cwd>/.teamagent/knowledge.db`，用户全局 DB 为 `<home>/.teamagent/global.db`，输出 `CLAUDE.md`，安装日志为 `<home>/.teamagent/.install-log`。
  - 步骤顺序：pre-check -> detect-stack -> create-dirs -> load-preset -> load-seed -> scan/structure imports -> install-hook -> optional install-plugins -> compile-CLAUDE.md -> append install log。
- Seed 解析与写入：[packages/cli/src/commands/init.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/init.ts:295)
  - dev 模式找 `packages/teamagent/seed/rules.jsonl`；bundle 模式找 `dist/seed/rules.jsonl`。
  - 逐行 `JSON.parse` 后写入 `userGlobalDbPath`；按 `id` 幂等跳过已存在条目；单条 schema 异常只跳过该条。
- SQLite schema：[packages/adapters/src/storage/sqlite/schema.ts](/Users/liushiyu/projects/TeamBrain/packages/adapters/src/storage/sqlite/schema.ts:20)
  - 主表 `knowledge` 含 `scope_level/type/nature/trigger/wrong_pattern/correct_pattern/confidence/enforcement/status/source/channel` 等字段。
  - `openDb()` 开 WAL、foreign keys，并幂等建表/迁移到 schema v7。
- 双层 store：[packages/adapters/src/storage/sqlite/dual-layer-store.ts](/Users/liushiyu/projects/TeamBrain/packages/adapters/src/storage/sqlite/dual-layer-store.ts:12)
  - `personal` 写项目 DB；`global` 写用户全局 DB；`findActive()` 合并两层。
- CLAUDE.md 编译：[packages/adapters/src/compiler/markdown-compiler.ts](/Users/liushiyu/projects/TeamBrain/packages/adapters/src/compiler/markdown-compiler.ts:81)
  - 读取既有 `CLAUDE.md`，注入/替换 `TEAMAGENT` block，原子写临时文件后 rename。
  - 默认只编译 `canonical/enforced`，token budget 默认 3000。
- Hook/settings 输出：[packages/cli/src/commands/install-hook.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/install-hook.ts:115)
  - 写 `<cwd>/.claude/settings.local.json`。
  - PreToolUse 必需 bundle，不存在会失败；PostToolUse/UserPromptSubmit/Stop/statusLine 仅在对应 bundle 存在时注册。
  - 已有非 TeamAgent `statusLine` 不覆盖。
- 打包 seed：[packages/teamagent/tsup.config.ts](/Users/liushiyu/projects/TeamBrain/packages/teamagent/tsup.config.ts:52)
  - build 成功后复制 `seed/rules.jsonl` 到 `dist/seed/rules.jsonl`。
  - npm `files` 只发布 `dist/` 与 `postinstall.mjs`：[packages/teamagent/package.json](/Users/liushiyu/projects/TeamBrain/packages/teamagent/package.json:11)。

## 关键 JSON/JSONL

`packages/teamagent/seed/rules.jsonl` 静态校验结果：

```json
{
  "lines": 48,
  "type": { "practice": 40, "avoidance": 8 },
  "enforcement": { "warn": 32, "block": 15, "passive": 1 },
  "scope": { "global": 48 },
  "source": { "preset": 48 },
  "channel": { "tool-action": 38, "passive-knowledge": 10 }
}
```

典型 seed 行字段形状：

```json
{
  "id": "seed-pers-...",
  "scope": { "level": "global" },
  "type": "practice",
  "trigger": "...",
  "correct_pattern": "...",
  "confidence": 0.9,
  "enforcement": "warn",
  "status": "active",
  "source": "preset",
  "channel": "tool-action"
}
```

`settings.local.json` 预期关键结构：

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|Write|Edit|WebFetch",
      "_teamagentTag": "teamagent-pre-tool-use",
      "hooks": [{ "type": "command", "command": "node <dist/bin-pre-tool-use.cjs>", "timeout": 30 }]
    }],
    "PostToolUse": [{ "_teamagentTag": "teamagent-post-tool-use" }],
    "UserPromptSubmit": [{ "_teamagentTag": "teamagent-user-prompt-submit" }],
    "Stop": [{ "_teamagentTag": "teamagent-stop" }]
  },
  "statusLine": {
    "type": "command",
    "command": "node <dist/teamagent-statusline.cjs>",
    "_teamagentTag": "teamagent-statusline"
  }
}
```

`CLAUDE.md` 预期关键结构：

```md
<!-- TEAMAGENT:START - 自动管理，请勿手动编辑 -->
## TeamAgent 经验（N条活跃知识）
- ...
<!-- TEAMAGENT:END -->
```

## 已执行真实命令

只执行了不会修改真实用户 init 环境的命令。

```bash
node - <<'NODE'
const fs = require('fs');
const lines = fs.readFileSync('packages/teamagent/seed/rules.jsonl','utf8').trim().split(/\r?\n/).filter(Boolean);
const summary = { lines: lines.length, type: {}, enforcement: {}, scope: {}, source: {}, channel: {} };
for (const [i, line] of lines.entries()) {
  const j = JSON.parse(line);
  for (const k of ['id','scope','category','tags','type','nature','trigger','correct_pattern','reasoning','confidence','enforcement','status','source','current_tier']) {
    if (!(k in j)) throw new Error(`line ${i+1} missing ${k}`);
  }
  summary.type[j.type] = (summary.type[j.type] || 0) + 1;
  summary.enforcement[j.enforcement] = (summary.enforcement[j.enforcement] || 0) + 1;
  summary.scope[j.scope.level] = (summary.scope[j.scope.level] || 0) + 1;
  summary.source[j.source] = (summary.source[j.source] || 0) + 1;
  summary.channel[j.channel || '(missing)'] = (summary.channel[j.channel || '(missing)'] || 0) + 1;
}
console.log(JSON.stringify(summary, null, 2));
NODE
```

实际输出：48 行全部可解析，字段齐全；汇总见上方 JSON。

```bash
pnpm test packages/cli/src/__tests__/init.test.ts packages/cli/src/__tests__/install-hook.test.ts
```

实际输出：

```text
Test Files  2 passed (2)
Tests  39 passed (39)
```

## 外部验证命令

以下命令设计为在临时目录验证真实输出，不写真实用户 `HOME` 或当前项目。建议由 reviewer 在干净 shell 中执行。

### 1. dry-run 不应写项目 DB/CLAUDE/settings

```bash
repo=/Users/liushiyu/projects/TeamBrain
tmp="$(mktemp -d)"
mkdir -p "$tmp/home" "$tmp/project"
printf '# Project\n- Always use pnpm\n' > "$tmp/project/CLAUDE.md"

cd "$tmp/project"
HOME="$tmp/home" pnpm --dir "$repo" teamagent init --dry-run --skip-hook

find "$tmp/project" -maxdepth 3 -type f | sort
find "$tmp/home" -maxdepth 3 -type f | sort
grep -n 'TEAMAGENT:START' "$tmp/project/CLAUDE.md" || true
```

预期输出：

- 终端有“预览模式（--dry-run）”。
- `find "$tmp/project"` 只看到原始 `CLAUDE.md`，没有 `.teamagent/knowledge.db`，没有 `.claude/settings.local.json`。
- `grep TEAMAGENT:START` 无输出。
- 注意：源码 pre-check 在 dry-run 也会创建 `$HOME/.teamagent` 目录并写删 probe；这不是 DB/settings/CLAUDE 输出。

### 2. 临时目录完整 init，跳过 LLM import，验证 SQLite/CLAUDE/settings

```bash
repo=/Users/liushiyu/projects/TeamBrain
pnpm --dir "$repo" --filter teamagent build

tmp="$(mktemp -d)"
mkdir -p "$tmp/home" "$tmp/project"
printf '# Project\n\nManual notes stay above.\n' > "$tmp/project/CLAUDE.md"

cd "$tmp/project"
HOME="$tmp/home" node "$repo/packages/teamagent/dist/bin.js" init --skip-import

test -f "$tmp/project/.teamagent/knowledge.db"
test -f "$tmp/home/.teamagent/global.db"
test -f "$tmp/project/.claude/settings.local.json"
grep -n 'TEAMAGENT:START' "$tmp/project/CLAUDE.md"

node - "$tmp/home/.teamagent/global.db" <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2]);
console.log(db.prepare("select scope_level, source, count(*) as n from knowledge group by scope_level, source order by scope_level, source").all());
console.log(db.prepare("select count(*) as n from knowledge where id like 'seed-%'").get());
db.close();
NODE

node - "$tmp/project/.claude/settings.local.json" <<'NODE'
const fs = require('fs');
const s = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
console.log(Object.keys(s.hooks || {}).sort());
console.log(s.hooks.PreToolUse?.[0]?._teamagentTag);
console.log(s.statusLine?._teamagentTag || '(no statusLine)');
NODE
```

预期输出：

- `init` 成功 banner，含“TeamAgent 安装成功”。
- 项目 DB、全局 DB、settings、`CLAUDE.md` 均存在。
- 全局 DB 至少包含 8 条 meta principles + 48 条 seed；首次干净 HOME 下预期 `global/preset = 56`，`id like 'seed-%' = 48`。
- `settings.local.json` 至少有 `PreToolUse`；bundle 完整时还应有 `PostToolUse`、`UserPromptSubmit`、`Stop`、`statusLine`。
- `CLAUDE.md` 保留原手写内容，并追加/替换 `TEAMAGENT` block。

### 3. 幂等性二跑

```bash
cd "$tmp/project"
HOME="$tmp/home" node "$repo/packages/teamagent/dist/bin.js" init --skip-import

node - "$tmp/home/.teamagent/global.db" <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2]);
console.log(db.prepare("select count(*) as n from knowledge").get());
db.close();
NODE
node - "$tmp/project/.claude/settings.local.json" <<'NODE'
const fs = require('fs');
const s = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
console.log((s.hooks.PreToolUse || []).filter(h => h._teamagentTag === 'teamagent-pre-tool-use').length);
NODE
```

预期输出：

- 全局 DB count 不增加。
- TeamAgent PreToolUse hook 仍为 1 条，不重复注册。

## 预期端到端输出矩阵

| 输出 | 位置 | 触发条件 | 预期 |
| --- | --- | --- | --- |
| 项目 DB | `<cwd>/.teamagent/knowledge.db` | 非 dry-run；导入规则或最终统计打开 DualLayerStore | SQLite schema v7；imported 规则为 `scope.level=personal` |
| 用户全局 DB | `<home>/.teamagent/global.db` | 非 dry-run；load-preset/load-seed | 8 条 meta principles + 48 条 seed，均为 `scope.level=global` |
| CLAUDE.md | `<cwd>/CLAUDE.md` | 非 dry-run compile | 保留手写内容；注入/替换 `TEAMAGENT:START/END` block |
| Claude settings | `<cwd>/.claude/settings.local.json` | 非 dry-run 且未 `--skip-hook` | 注册 TeamAgent hooks；保留已有用户 hooks；不覆盖非 TeamAgent statusLine |
| install log | `<home>/.teamagent/.install-log` | 非 dry-run 且流程跑过 append | JSONL，每行含 `ts` 与 `steps` |
| plugin 安装 | 用户全局 Claude 配置 | 只有 `--install-plugins` | 默认不装；opt-in 后才执行 |

## 哪些证据不能算证明

- `renderInitResult()` 的中文成功文案不能证明文件真的写入；必须查 DB、settings、`CLAUDE.md`。
- `--dry-run` 不能证明非 dry-run 写入路径正确；它只返回“会做什么”，且 pre-check 仍会触碰临时 HOME 的 `.teamagent` 目录。
- 单元测试使用注入路径、stub LLM、fake hook entry，能证明核心分支和幂等逻辑，但不能单独证明 npm tarball 的 `dist/seed/rules.jsonl` 存在。
- 源码里的注释“Copy seed”不能证明打包产物真的包含 seed；必须 `pnpm --filter teamagent build` 后检查 `packages/teamagent/dist/seed/rules.jsonl`，或 `npm pack --dry-run`。
- 解析源文件 `packages/teamagent/seed/rules.jsonl` 只能证明源码 seed 有效；不能证明已发布 npm 包中的 seed 与源码一致。
- `settings.local.json` 存在不能证明 Claude Code 实际执行 hook；这还需要在 Claude Code 临时项目里触发 PreToolUse/PostToolUse/Stop/UserPromptSubmit 事件并查事件日志。
- `postinstall.mjs` 会尝试注册用户级 SessionStart hook，这是安装包阶段副作用，不是 `teamagent init` 本身的证明。

## 最终结论

草案结论：当前源码实现覆盖了 `teamagent init` 的完整初始化链路：CLI 入口能路由到 `executeInit`；init 会解析并写入 meta principles 与 48 条打包 seed 到全局 SQLite，按需把 `CLAUDE.md`/`.cursorrules` 规则经 LLM 结构化写入项目 SQLite，随后注册项目级 Claude settings，并把双层 active 知识编译进 `CLAUDE.md`。

非自证状态：源码追踪、seed 静态校验、39 个相关单元测试都支持该结论；最终放行前还应执行上面的临时目录“打包产物 + 真实 init”外部验证，确认 `dist/seed/rules.jsonl`、SQLite 计数、`CLAUDE.md` block、`settings.local.json` hook 条目在真实 bundle 模式下同时成立。
