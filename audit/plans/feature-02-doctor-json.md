# Feature #2: `teamagent doctor --json` 非自证 audit 草案

审计日期：2026-04-28  
工作目录：`/Users/liushiyu/projects/TeamBrain`

## 输入

目标功能是 `teamagent doctor --json`。本 audit 不把终端文案当作结论，而是从 CLI 入口追到实现，再用外部 JSON parser 校验 stdout 是否真是机器可读 JSON。

只检查以下源码路径：

- `packages/cli/src/bin.ts`
- `packages/cli/src/commands/doctor.ts`
- 辅助确认：`packages/adapters/src/storage/sqlite/schema.ts`

## 源码追踪

`packages/cli/src/bin.ts` 在顶部导入 doctor command：

```ts
import {
  executeDoctor,
  parseDoctorArgs,
  renderDoctorResult,
} from "./commands/doctor.js";
```

`doctor` 分支的实际数据流是：

```ts
case "doctor": {
  const opts = parseDoctorArgs(rest);
  const result = await executeDoctor({ ...opts, cwd: process.cwd() });
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (!opts.postinstall || !result.allPassed) {
    process.stdout.write(renderDoctorResult(result));
  }
  if (!result.allPassed) process.exit(1);
  return;
}
```

结论：

- `--json` 不是由 `renderDoctorResult()` 渲染出来的文案，而是直接 `JSON.stringify(result, null, 2)`。
- JSON 失败时仍会写 stdout，然后因为 `!result.allPassed` 退出码为 `1`。
- `cwd` 固定传入 `process.cwd()`，所以项目级检查都绑定当前工作目录。

`packages/cli/src/commands/doctor.ts` 的 `parseDoctorArgs()` 只识别三个布尔开关：

```ts
return {
  fix: argv.includes("--fix"),
  json: argv.includes("--json"),
  postinstall: argv.includes("--postinstall"),
};
```

`executeDoctor()` 顺序构造 `checks`，最后 `finalize()` 生成汇总字段：

```ts
return { checks, passed, failed, skipped, allPassed: failed === 0 && !earlyExit };
```

因此 JSON 顶层字段只来自 `DoctorResult`：

- `checks`: 每个检查项数组。
- `passed`: `checks` 中 `status === "pass"` 的数量。
- `failed`: `checks` 中 `status === "fail"` 的数量。
- `skipped`: `checks` 中 `status === "skip"` 的数量。
- `allPassed`: `failed === 0 && !earlyExit`。

每个 `checks[]` 项只来自 `DoctorCheckResult`：

- `name`: 检查名。
- `status`: `"pass" | "fail" | "skip"`。
- `detail`: 细节字符串。
- `fix`: 可选修复建议，仅部分失败项存在。

## 环境检查真实性

| 检查名 | 源码行为 | 是否是真检查 | 注意点 |
| --- | --- | --- | --- |
| `node-version` | 读取 `process.version`，解析 major，要求 `>= 22`。 | 是 | 根 package 的 `engines.node` 是 `>=22.5.0`，但 doctor 只检查 major >= 22，低于 22.5 的 Node 22 也会通过。 |
| `claude-code` | 执行 `claude --version`，取第一行 stdout。 | 是 | 证明 PATH 上存在可执行 `claude`，但不验证登录状态、模型权限或 hook 能否运行。 |
| `sqlite-vec` | 先 `_require("sqlite-vec")`，失败后用 sibling package 路径做 `_require.resolve()`。 | 部分是 | 证明包可解析/可 require；不等价于在当前 SQLite 连接中成功创建 vec0 表。 |
| `home-dir` | 创建 `~/.teamagent`，写入并删除 `.doctor-probe-${pid}`。 | 是 | 这是实际文件系统写入探针。会产生目录副作用。 |
| `knowledge-db` | 检查 `${cwd}/.teamagent/knowledge.db` 存在，然后 `openDb(dbPath)` 并 close。 | 是 | `openDb()` 会执行 schema 初始化/迁移和 PRAGMA，检查不是只读的。 |
| `hook-registered` | 读取 `${cwd}/.claude/settings.local.json`，解析 JSON，查 `hooks.PreToolUse[]` 里 `_teamagentTag === "teamagent-pre-tool-use"`。 | 部分是 | 证明配置里有 tag，不验证 command 是否能执行。 |
| `hook-script` | 再读 settings，取 tagged hook 的 `hooks[0].command`，用正则 `node\s+"?([^"]+)"?` 抽路径并 `fs.existsSync()`。 | 是 | 当前正则对无引号 Windows 路径也能抽出整段；只验证文件存在，不验证 Node 能运行脚本。 |
| `claude-md` | 检查 `${cwd}/CLAUDE.md` 存在，并包含 `TEAMAGENT:START`。 | 部分是 | 只验证 marker，不验证区块内容是否新鲜或与 DB 一致。 |

依赖链也是真实影响 JSON 的一部分：

- `node-version` 失败会提前返回，只包含该检查。
- `claude-code` 失败会提前返回，只包含 Node 与 Claude 检查。
- `home-dir` 失败会提前返回。
- `knowledge-db` 失败且没有 `--fix` 时，`hook-registered`、`hook-script`、`claude-md` 会被加入为 `skip`。
- `hook-registered` 失败且没有 `--fix` 时，`hook-script`、`claude-md` 会被加入为 `skip`。
- `sqlite-vec` 失败不会提前返回。

## 命令

不要用 `pnpm teamagent doctor --json` 作为纯 JSON 验证命令。它走 package script，pnpm 会把 script banner 和 `ELIFECYCLE` 写进 stdout，导致整体 stdout 不是 JSON。

失败示例：

```bash
set +e
OUT=$(mktemp /tmp/teamagent-doctor-pnpm-script.XXXXXX)
ERR=$(mktemp /tmp/teamagent-doctor-pnpm-script-err.XXXXXX)
pnpm teamagent doctor --json >"$OUT" 2>"$ERR"
STATUS=$?
node -e 'const fs=require("fs"); JSON.parse(fs.readFileSync(process.argv[1],"utf8"))' "$OUT"
```

本机结果：

```text
status=1
parse=fail Unexpected token '>', "
> teamagen"... is not valid JSON
```

用于验证 CLI 自身 stdout 的命令：

```bash
set +e
OUT=$(mktemp /tmp/teamagent-doctor-direct.XXXXXX)
ERR=$(mktemp /tmp/teamagent-doctor-direct-err.XXXXXX)
pnpm exec tsx packages/cli/src/bin.ts doctor --json >"$OUT" 2>"$ERR"
STATUS=$?
```

本机结果：

```text
status=1
stderr 为空
stdout 是单个 JSON object
```

退出码为 `1` 是预期行为，因为当前 `hook-script` 检查失败，`allPassed=false`。

## 外部验证

`jq` 验证：

```bash
jq -r '[type, (.checks|type), (.checks|length|tostring), (.passed|tostring), (.failed|tostring), (.skipped|tostring), (.allPassed|tostring)] | @tsv' "$OUT"
```

本机输出：

```text
object	array	8	7	1	0	false
```

Node `JSON.parse` + schema/count 校验：

```bash
node -e '
const fs=require("fs");
const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
if(!Array.isArray(d.checks)) throw new Error("checks not array");
for (const c of d.checks) {
  if(typeof c.name!=="string") throw new Error("bad name");
  if(!["pass","fail","skip"].includes(c.status)) throw new Error("bad status");
  if(typeof c.detail!=="string") throw new Error("bad detail");
  if(c.fix!==undefined && typeof c.fix!=="string") throw new Error("bad fix");
}
const passed=d.checks.filter(c=>c.status==="pass").length;
const failed=d.checks.filter(c=>c.status==="fail").length;
const skipped=d.checks.filter(c=>c.status==="skip").length;
if(d.passed!==passed||d.failed!==failed||d.skipped!==skipped) throw new Error("bad counts");
if(d.allPassed !== (failed===0)) throw new Error("bad allPassed for non-early path");
console.log(JSON.stringify({ok:true, checks:d.checks.map(c=>c.name), counts:{passed,failed,skipped}, allPassed:d.allPassed}));
' "$OUT"
```

本机输出：

```json
{"ok":true,"checks":["node-version","claude-code","sqlite-vec","home-dir","knowledge-db","hook-registered","hook-script","claude-md"],"counts":{"passed":7,"failed":1,"skipped":0},"allPassed":false}
```

额外实物验证：

```bash
node - <<'NODE'
const fs = require('fs');
const p = '.claude/settings.local.json';
const settings = JSON.parse(fs.readFileSync(p, 'utf8'));
const pre = settings.hooks?.PreToolUse ?? [];
const entry = pre.find(h => h?._teamagentTag === 'teamagent-pre-tool-use');
console.log(JSON.stringify({exists: fs.existsSync(p), hasTaggedHook: !!entry, command: entry?.hooks?.[0]?.command ?? null}, null, 2));
NODE
```

本机输出：

```json
{
  "exists": true,
  "hasTaggedHook": true,
  "command": "node C:/bzli/teamagent/packages/cli/dist/bin-pre-tool-use.cjs"
}
```

这解释了当前 JSON 中 `hook-registered=pass` 但 `hook-script=fail`：配置 tag 存在，配置里的脚本路径不存在。

## 预期 JSON

当前工作目录下，直接运行 CLI 入口得到的 JSON 形态如下：

```json
{
  "checks": [
    {
      "name": "node-version",
      "status": "pass",
      "detail": "v24.3.0  (需要 ≥ 22)"
    },
    {
      "name": "claude-code",
      "status": "pass",
      "detail": "2.1.118 (Claude Code)"
    },
    {
      "name": "sqlite-vec",
      "status": "pass",
      "detail": "加载成功"
    },
    {
      "name": "home-dir",
      "status": "pass",
      "detail": "/Users/liushiyu/.teamagent 可读写"
    },
    {
      "name": "knowledge-db",
      "status": "pass",
      "detail": "/Users/liushiyu/projects/TeamBrain/.teamagent/knowledge.db"
    },
    {
      "name": "hook-registered",
      "status": "pass",
      "detail": "PreToolUse Hook 已注册"
    },
    {
      "name": "hook-script",
      "status": "fail",
      "detail": "Hook 脚本不存在: C:/bzli/teamagent/packages/cli/dist/bin-pre-tool-use.cjs",
      "fix": "npm install -g teamagent  （重装）"
    },
    {
      "name": "claude-md",
      "status": "pass",
      "detail": "TEAMAGENT 区块已存在"
    }
  ],
  "passed": 7,
  "failed": 1,
  "skipped": 0,
  "allPassed": false
}
```

机器消费方应按字段消费，不应依赖 `detail` 的中文文案稳定。更稳的断言是：

- 顶层是 object。
- `checks` 是 array。
- 每个 `status` 属于 `pass | fail | skip`。
- `passed/failed/skipped` 与 `checks` 计数一致。
- 失败场景允许退出码为 `1`，但 stdout 仍应可解析为 JSON。

## 局限

- 通过 package script 运行的 `pnpm teamagent doctor --json` 不是纯 JSON stdout；这不是 doctor 分支本身的问题，而是 pnpm script wrapper 的输出污染。CI 若要验证 JSON，应直接执行二进制入口、built CLI，或用不会打印 script banner 的执行方式。
- 当前测试文件 `packages/cli/src/__tests__/doctor.test.ts` 只覆盖 `renderDoctorResult()` 和 `parseDoctorArgs()`，没有覆盖 CLI `--json` stdout 可解析性，也没有覆盖顶层 count 与 `checks` 的一致性。
- `--fix` 是 best-effort，且当前实现对某些检查是在 auto-fix 后继续使用旧的 `check.status`，没有重新跑该检查；因此 `--fix --json` 的 JSON 可能反映修复前状态。
- `knowledge-db` 检查会调用 `openDb()`，而 `openDb()` 会执行 PRAGMA、schema 初始化和迁移；这不是只读健康检查。
- `sqlite-vec` 检查主要证明 Node 包可解析/加载，不完整证明当前 DB 中 vec0 virtual table 可用。
- `claude-code` 检查只证明 `claude --version` 可执行，不证明 Claude Code 会话、认证、权限模式或 hooks 生命周期正常。

## 结论

`teamagent doctor --json` 的 CLI 分支自身确实输出结构化 JSON，字段来自 `executeDoctor()` 的 `DoctorResult`，而不是从人类可读文案反推。当前本机直接执行入口时，外部 `jq` 和 `JSON.parse` 都能解析 stdout，并能验证 count 与 `checks` 一致。

当前环境没有全部通过：`hook-script` 失败，因为 `.claude/settings.local.json` 中注册的 TeamAgent hook 指向 `C:/bzli/teamagent/packages/cli/dist/bin-pre-tool-use.cjs`，该路径在本机不存在。因此预期退出码是 `1`，预期 JSON 中 `allPassed=false`。
