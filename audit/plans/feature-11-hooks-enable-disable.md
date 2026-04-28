# Feature #11: install-hook / uninstall-hook / enable / disable 非自证 audit 草案

## 目标

验证 TeamAgent hook 生命周期命令在真实 CLI 入口下正确改写当前项目的 `.claude/settings.local.json`：

1. `teamagent install-hook` 注册 TeamAgent 的 `PreToolUse`、`PostToolUse`、`UserPromptSubmit`、`Stop` hook，以及可用时的 `statusLine`。
2. `teamagent disable` 只移除 TeamAgent 自己的 hook/statusLine 注册，保留知识数据和用户自定义 hook/statusLine。
3. `teamagent enable` 等价于重新 `install-hook`，能恢复 TeamAgent hook，且不重复写入。
4. `teamagent uninstall-hook` 只移除 TeamAgent 自己打 tag 的条目，不删除用户自定义 hook/statusLine。
5. 验证方式必须是非自证：不 import `installHook()` / `uninstallHook()` / `enable()` / `disable()`，而是构造临时项目、运行真实 CLI、用外部 JSON parser 读取 settings 并断言结构。

## 源码追踪

### CLI 路由

入口：[packages/cli/src/bin.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts:13)

- `install-hook`：直接调用 `installHook()`；输出已注册或已安装无变化。
- `uninstall-hook`：直接调用 `uninstallHook()`；输出已移除或未找到。
- `disable`：调用 `disable()`；成功时提示“数据保留；用 'teamagent enable' 恢复”。
- `enable`：调用 `enable()`；成功时提示重新启用或无变化。

对应分发点：

- `install-hook`：[packages/cli/src/bin.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts:188)
- `uninstall-hook`：[packages/cli/src/bin.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts:201)
- `disable`：[packages/cli/src/bin.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts:267)
- `enable`：[packages/cli/src/bin.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts:276)

### install-hook 写入逻辑

实现：[packages/cli/src/commands/install-hook.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/install-hook.ts:5)

TeamAgent 通过 `_teamagentTag` 标记自身写入项：

| 位置 | tag | 条件 | 关键字段 |
|---|---|---|---|
| `hooks.PreToolUse[]` | `teamagent-pre-tool-use` | `bin-pre-tool-use.cjs` 必须存在，否则命令抛错 | `matcher: "Bash|Write|Edit|WebFetch"`，`timeout: 30` |
| `hooks.PostToolUse[]` | `teamagent-post-tool-use` | `bin-post-tool-use.cjs` 存在才写；不存在不阻断 | `matcher: "Bash|Write|Edit|WebFetch"`，`timeout: 30` |
| `hooks.UserPromptSubmit[]` | `teamagent-user-prompt-submit` | `bin-user-prompt-submit.cjs` 存在才写 | 无 `matcher`，`timeout: 10` |
| `hooks.Stop[]` | `teamagent-stop` | `bin-stop.cjs` 存在才写 | 无 `matcher`，`timeout: 60` |
| `statusLine` | `teamagent-statusline` | `teamagent-statusline.cjs` 存在，且没有用户自定义 statusLine，或已有的是 TeamAgent statusLine | `type: "command"` |

重要行为：

- `installHook()` 只要求 PreToolUse bundle 必须存在：[packages/cli/src/commands/install-hook.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/install-hook.ts:129)
- PostToolUse / UserPromptSubmit / Stop / statusLine 都是“bundle 存在才注册”的软能力。
- 对数组型 hook，安装前按 tag 查重；已有 TeamAgent tag 时不再追加，保证幂等。
- 对 `statusLine`，Claude Code 只有单槽位；已有非 TeamAgent `statusLine` 时设置 `statusLineSkipped = true` 并保留原值：[packages/cli/src/commands/install-hook.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/install-hook.ts:222)
- CLI 的“已安装（无变化）”只看 `PreToolUse` 的 `alreadyInstalled`；Post/UserPrompt/Stop/statusLine 是否补写，必须以 JSON parser 结果为准，不能只看终端文案。

### uninstall-hook / disable 删除逻辑

实现：[packages/cli/src/commands/install-hook.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/install-hook.ts:257)

`uninstallHook()` 对四类 hook 数组逐个过滤，只删除 `_teamagentTag` 等于对应 tag 的条目：

- `hooks.PreToolUse[]` 删除 `teamagent-pre-tool-use`
- `hooks.PostToolUse[]` 删除 `teamagent-post-tool-use`
- `hooks.UserPromptSubmit[]` 删除 `teamagent-user-prompt-submit`
- `hooks.Stop[]` 删除 `teamagent-stop`

数组删空后删除该 hook key；`hooks` 对象删空后删除 `hooks`。`statusLine` 只有在 `_teamagentTag === "teamagent-statusline"` 时才删除，避免误删用户状态栏：[packages/cli/src/commands/install-hook.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/install-hook.ts:316)

`disable()` 是 `uninstallHook()` 的薄包装：[packages/cli/src/commands/uninstall.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/uninstall.ts:29)

`enable()` 是 `installHook()` 的薄包装：[packages/cli/src/commands/uninstall.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/uninstall.ts:37)

因此 Feature #11 的核心风险不是业务数据删除，而是 settings JSON 的 tag 过滤是否过宽、是否覆盖用户自定义 statusLine、是否重复追加 TeamAgent hook。

## 关键 settings JSON

完整 bundle 可用且无用户 statusLine 时，安装后应出现类似结构：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit|WebFetch",
        "_teamagentTag": "teamagent-pre-tool-use",
        "hooks": [
          {
            "type": "command",
            "command": "node /abs/path/dist/bin-pre-tool-use.cjs",
            "timeout": 30
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash|Write|Edit|WebFetch",
        "_teamagentTag": "teamagent-post-tool-use",
        "hooks": [
          {
            "type": "command",
            "command": "node /abs/path/dist/bin-post-tool-use.cjs",
            "timeout": 30
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "_teamagentTag": "teamagent-user-prompt-submit",
        "hooks": [
          {
            "type": "command",
            "command": "node /abs/path/dist/bin-user-prompt-submit.cjs",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "_teamagentTag": "teamagent-stop",
        "hooks": [
          {
            "type": "command",
            "command": "node /abs/path/dist/bin-stop.cjs",
            "timeout": 60
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "node /abs/path/dist/teamagent-statusline.cjs",
    "_teamagentTag": "teamagent-statusline"
  }
}
```

已有用户自定义 statusLine 时，安装后应保留：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /custom/user/status.cjs"
  }
}
```

## 非自证验证命令

推荐用发布包构建产物验证，因为 [packages/teamagent/tsup.config.ts](/Users/liushiyu/projects/TeamBrain/packages/teamagent/tsup.config.ts:91) 会把 `scripts/teamagent-statusline.cjs` 复制到 `packages/teamagent/dist/teamagent-statusline.cjs`。这样可以覆盖 statusLine 注册/删除路径。

### 0. 构建真实 CLI + hook bundles

```bash
cd /Users/liushiyu/projects/TeamBrain
pnpm --filter teamagent build
test -f packages/teamagent/dist/bin.js
test -f packages/teamagent/dist/bin-pre-tool-use.cjs
test -f packages/teamagent/dist/bin-post-tool-use.cjs
test -f packages/teamagent/dist/bin-user-prompt-submit.cjs
test -f packages/teamagent/dist/bin-stop.cjs
test -f packages/teamagent/dist/teamagent-statusline.cjs
```

预期：所有 `test -f` 退出码为 0。若只跑 `pnpm --filter @teamagent/cli build:hook`，需要额外确保 `packages/cli/dist/teamagent-statusline.cjs` 存在，否则无法覆盖 statusLine 路径。

### 1. 场景 A：已有用户 hook + 用户 statusLine，不应被覆盖或删除

```bash
set -euo pipefail

REPO=/Users/liushiyu/projects/TeamBrain
CLI="$REPO/packages/teamagent/dist/bin.js"
TMP="$(mktemp -d)"
cd "$TMP"
mkdir -p .claude

cat > .claude/settings.local.json <<'JSON'
{
  "someUserSetting": "keep-me",
  "hooks": {
    "PreToolUse": [
      { "matcher": "Read", "hooks": [{ "type": "command", "command": "user-pre.sh" }] }
    ],
    "PostToolUse": [
      { "matcher": "Read", "hooks": [{ "type": "command", "command": "user-post.sh" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "user-prompt.sh" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "user-stop.sh" }] }
    ]
  },
  "statusLine": { "type": "command", "command": "node /custom/user/status.cjs" }
}
JSON

node "$CLI" install-hook

node <<'NODE'
const fs = require("node:fs");
const assert = require("node:assert/strict");
const s = JSON.parse(fs.readFileSync(".claude/settings.local.json", "utf8"));
const tags = {
  PreToolUse: "teamagent-pre-tool-use",
  PostToolUse: "teamagent-post-tool-use",
  UserPromptSubmit: "teamagent-user-prompt-submit",
  Stop: "teamagent-stop",
};
for (const [name, tag] of Object.entries(tags)) {
  const arr = s.hooks?.[name] ?? [];
  assert.equal(arr.filter((h) => h._teamagentTag === tag).length, 1, `${name} teamagent tag count`);
}
assert.equal(s.someUserSetting, "keep-me");
assert.equal(s.hooks.PreToolUse.some((h) => h.hooks?.[0]?.command === "user-pre.sh"), true);
assert.equal(s.hooks.PostToolUse.some((h) => h.hooks?.[0]?.command === "user-post.sh"), true);
assert.equal(s.hooks.UserPromptSubmit.some((h) => h.hooks?.[0]?.command === "user-prompt.sh"), true);
assert.equal(s.hooks.Stop.some((h) => h.hooks?.[0]?.command === "user-stop.sh"), true);
assert.equal(s.statusLine.command, "node /custom/user/status.cjs");
assert.equal(s.statusLine._teamagentTag, undefined);
console.log("install preserves user hooks/statusLine: ok");
NODE

node "$CLI" install-hook

node <<'NODE'
const fs = require("node:fs");
const assert = require("node:assert/strict");
const s = JSON.parse(fs.readFileSync(".claude/settings.local.json", "utf8"));
const expected = {
  PreToolUse: "teamagent-pre-tool-use",
  PostToolUse: "teamagent-post-tool-use",
  UserPromptSubmit: "teamagent-user-prompt-submit",
  Stop: "teamagent-stop",
};
for (const [name, tag] of Object.entries(expected)) {
  const n = (s.hooks?.[name] ?? []).filter((h) => h._teamagentTag === tag).length;
  assert.equal(n, 1, `${name} duplicated`);
}
assert.equal(s.statusLine.command, "node /custom/user/status.cjs");
console.log("install idempotent with custom statusLine: ok");
NODE

node "$CLI" disable

node <<'NODE'
const fs = require("node:fs");
const assert = require("node:assert/strict");
const s = JSON.parse(fs.readFileSync(".claude/settings.local.json", "utf8"));
const all = Object.values(s.hooks ?? {}).flat();
assert.equal(all.some((h) => String(h._teamagentTag ?? "").startsWith("teamagent-")), false);
assert.equal(s.hooks.PreToolUse.some((h) => h.hooks?.[0]?.command === "user-pre.sh"), true);
assert.equal(s.hooks.PostToolUse.some((h) => h.hooks?.[0]?.command === "user-post.sh"), true);
assert.equal(s.hooks.UserPromptSubmit.some((h) => h.hooks?.[0]?.command === "user-prompt.sh"), true);
assert.equal(s.hooks.Stop.some((h) => h.hooks?.[0]?.command === "user-stop.sh"), true);
assert.equal(s.statusLine.command, "node /custom/user/status.cjs");
console.log("disable removes only teamagent entries: ok");
NODE

node "$CLI" enable

node <<'NODE'
const fs = require("node:fs");
const assert = require("node:assert/strict");
const s = JSON.parse(fs.readFileSync(".claude/settings.local.json", "utf8"));
const expected = {
  PreToolUse: "teamagent-pre-tool-use",
  PostToolUse: "teamagent-post-tool-use",
  UserPromptSubmit: "teamagent-user-prompt-submit",
  Stop: "teamagent-stop",
};
for (const [name, tag] of Object.entries(expected)) {
  assert.equal((s.hooks?.[name] ?? []).filter((h) => h._teamagentTag === tag).length, 1);
}
assert.equal(s.statusLine.command, "node /custom/user/status.cjs");
console.log("enable restores hooks and preserves custom statusLine: ok");
NODE

node "$CLI" uninstall-hook

node <<'NODE'
const fs = require("node:fs");
const assert = require("node:assert/strict");
const s = JSON.parse(fs.readFileSync(".claude/settings.local.json", "utf8"));
const all = Object.values(s.hooks ?? {}).flat();
assert.equal(all.some((h) => String(h._teamagentTag ?? "").startsWith("teamagent-")), false);
assert.equal(s.statusLine.command, "node /custom/user/status.cjs");
console.log("uninstall-hook removes only teamagent entries: ok");
NODE

echo "$TMP"
```

预期 CLI 输出包含：

- 第一次安装：`Hook 已注册到 Claude Code`
- 第二次安装：`Hook 已安装（无变化）`
- disable：`Hook 已禁用`
- enable：`Hook 已重新启用`
- uninstall-hook：`Hook 已移除`

预期 parser 输出：

```text
install preserves user hooks/statusLine: ok
install idempotent with custom statusLine: ok
disable removes only teamagent entries: ok
enable restores hooks and preserves custom statusLine: ok
uninstall-hook removes only teamagent entries: ok
```

### 2. 场景 B：无用户 statusLine，TeamAgent statusLine 应安装并随 disable/uninstall-hook 删除

```bash
set -euo pipefail

REPO=/Users/liushiyu/projects/TeamBrain
CLI="$REPO/packages/teamagent/dist/bin.js"
TMP="$(mktemp -d)"
cd "$TMP"

node "$CLI" install-hook

node <<'NODE'
const fs = require("node:fs");
const assert = require("node:assert/strict");
const s = JSON.parse(fs.readFileSync(".claude/settings.local.json", "utf8"));
assert.equal(s.statusLine?._teamagentTag, "teamagent-statusline");
assert.equal(s.statusLine?.type, "command");
assert.match(s.statusLine?.command ?? "", /teamagent-statusline\.cjs/);
assert.equal((s.hooks?.PreToolUse ?? []).filter((h) => h._teamagentTag === "teamagent-pre-tool-use").length, 1);
assert.equal((s.hooks?.PostToolUse ?? []).filter((h) => h._teamagentTag === "teamagent-post-tool-use").length, 1);
assert.equal((s.hooks?.UserPromptSubmit ?? []).filter((h) => h._teamagentTag === "teamagent-user-prompt-submit").length, 1);
assert.equal((s.hooks?.Stop ?? []).filter((h) => h._teamagentTag === "teamagent-stop").length, 1);
console.log("fresh install includes all teamagent hooks/statusLine: ok");
NODE

node "$CLI" disable

node <<'NODE'
const fs = require("node:fs");
const assert = require("node:assert/strict");
const s = JSON.parse(fs.readFileSync(".claude/settings.local.json", "utf8"));
assert.equal(s.hooks, undefined);
assert.equal(s.statusLine, undefined);
console.log("disable removes teamagent-only settings: ok");
NODE

node "$CLI" enable

node <<'NODE'
const fs = require("node:fs");
const assert = require("node:assert/strict");
const s = JSON.parse(fs.readFileSync(".claude/settings.local.json", "utf8"));
assert.equal(s.statusLine?._teamagentTag, "teamagent-statusline");
assert.equal((s.hooks?.PreToolUse ?? []).filter((h) => h._teamagentTag === "teamagent-pre-tool-use").length, 1);
assert.equal((s.hooks?.PostToolUse ?? []).filter((h) => h._teamagentTag === "teamagent-post-tool-use").length, 1);
assert.equal((s.hooks?.UserPromptSubmit ?? []).filter((h) => h._teamagentTag === "teamagent-user-prompt-submit").length, 1);
assert.equal((s.hooks?.Stop ?? []).filter((h) => h._teamagentTag === "teamagent-stop").length, 1);
console.log("enable restores teamagent-only settings: ok");
NODE

node "$CLI" uninstall-hook

node <<'NODE'
const fs = require("node:fs");
const assert = require("node:assert/strict");
const s = JSON.parse(fs.readFileSync(".claude/settings.local.json", "utf8"));
assert.deepEqual(s, {});
console.log("uninstall-hook clears teamagent-only settings object: ok");
NODE

echo "$TMP"
```

预期 parser 输出：

```text
fresh install includes all teamagent hooks/statusLine: ok
disable removes teamagent-only settings: ok
enable restores teamagent-only settings: ok
uninstall-hook clears teamagent-only settings object: ok
```

### 3. 可选变体：只验证 @teamagent/cli 源码入口

如果 audit 必须直接跑 `packages/cli/src/bin.ts`，可用：

```bash
cd /Users/liushiyu/projects/TeamBrain
pnpm --filter @teamagent/cli build:hook
cp scripts/teamagent-statusline.cjs packages/cli/dist/teamagent-statusline.cjs

TMP="$(mktemp -d)"
cd "$TMP"
/Users/liushiyu/projects/TeamBrain/node_modules/.bin/tsx \
  /Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts install-hook
```

这个变体能追到同一个 `bin.ts -> commands/install-hook.ts` 源码路径，但会临时补齐 `packages/cli/dist/teamagent-statusline.cjs`。如果复制前该文件不存在，验证结束后应按审计环境约定清理生成物，避免把临时构造误认为源码改动。

## 判定标准

通过条件：

1. 所有命令退出码为 0。
2. `install-hook` 在完整 bundle 存在时写入 4 类 hook tag：`teamagent-pre-tool-use`、`teamagent-post-tool-use`、`teamagent-user-prompt-submit`、`teamagent-stop`。
3. 无用户 statusLine 时，`install-hook` 写入 `_teamagentTag: "teamagent-statusline"`；已有非 TeamAgent statusLine 时不覆盖。
4. 连续执行 `install-hook` 不重复追加任何 TeamAgent tag。
5. `disable` 删除所有 TeamAgent tag 和 TeamAgent statusLine，但保留用户 hook、用户 statusLine、非 hook settings。
6. `enable` 在 `disable` 后恢复 TeamAgent hook；若仍有用户 statusLine，继续保留用户 statusLine。
7. `uninstall-hook` 删除 TeamAgent tag；用户 hook/statusLine 不被删除。

失败判定：

- 任一 hook tag 缺失，且对应 dist 文件存在。
- 任一 TeamAgent tag 数量大于 1。
- 用户 hook command 被删除、改写或重排为无法识别。
- 用户自定义 `statusLine` 被覆盖为 TeamAgent statusLine，或在 `disable` / `uninstall-hook` 后消失。
- TeamAgent-only 场景下 `disable` / `uninstall-hook` 后仍残留 `_teamagentTag`。

## 当前单测覆盖与缺口

已有单测覆盖函数级行为：

- [packages/cli/src/__tests__/install-hook.test.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/__tests__/install-hook.test.ts:30) 覆盖注册、幂等、保留用户 hook、UserPromptSubmit、Stop、statusLine。
- [packages/cli/src/__tests__/uninstall.test.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/__tests__/uninstall.test.ts:80) 覆盖 `disable` / `enable` 函数薄包装和完整 `uninstall`。

非自证缺口：

- 单测直接 import 函数，不能证明真实 CLI 路由、默认 `cliRoot()`、发布包 dist 布局、statusLine 复制产物一起工作。
- 单测多用 fake hook entry，不能证明默认 dist 文件名与命令字符串匹配。
- `bin.ts install-hook` 当前不展示 `statusLineSkipped`，所以必须靠 JSON parser 验证用户 statusLine 未被覆盖。
