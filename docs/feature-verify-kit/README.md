# Claude Stream-JSON + tmux 固定验收脚本

这套脚本是 TeamAgent 的固定 1+2+3 验证模板，满足：

1. `claude -p --model haiku`（通过本机 `claudefast` wrapper 走 MiniMax API）
2. 先运行 `claudefast -h`，再使用 `stream-json` 产出原始 transcript，并用
   `--debug hooks --debug-file <path>` 产出 hook evidence
3. 对「产品特性清单」做硬编码 JSON schema + value hard-match，并拒绝空白说明文字
4. 用 `tmux + claudefast` 交互模式执行同一验证并 `/export`

## 产品特性（硬编码，必须全部命中）

- `positioning`
- `metrics`
- `market_gap`
- `delivered_vs_planned`
- `hooks`
- `knowledge_delivery`
- `self_evolution`

## 一次性运行

```bash
bash docs/feature-verify-kit/run-all.sh
```

## 逐步运行

```bash
bash docs/feature-verify-kit/verify-claude-stream-json.sh
bash docs/feature-verify-kit/hardmatch-features.sh
bash docs/feature-verify-kit/verify-dashboard-health.sh
bash docs/feature-verify-kit/verify-tmux-interactive.sh
```

`verify-claude-stream-json.sh` 会把 help 输出写到
`runs/claudefast-help.txt`，把实际采用的 flags 写到
`runs/claudefast-stream-json-flags.txt`，并把 hook debug log 写到
`runs/claude-hooks.debug.log`。`claudefast -p` 必须带 prompt 参数或 stdin；
脚本使用显式 prompt 参数。不要把 `--include-hook-events` 作为活跃 recipe。

## 目标问句（文档对齐）

必须能稳定回答以下提示：

```text
EXPLAIN ONLY: how do we use claude stream json and tmux + interactive claude to verify if our features work ?
```

若回答漂移，先更新 `docs/feature-verification.md` 与本目录脚本，再重复 1+2+3 直到 hard-match 通过。
