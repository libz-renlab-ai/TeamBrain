# Claude Stream-JSON + tmux 固定验收脚本

这套脚本是 TeamAgent 的固定 1+2+3 验证模板，满足：

1. `claude -p --model haiku`（通过本机 `claudefast` wrapper 走 MiniMax API）
2. `--output-format stream-json` 产出原始事件流
3. 对「产品特性清单」做硬编码 JSON schema + key hard-match，并保留非空说明文字作证据
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
bash docs/feature-verify-kit/verify-tmux-interactive.sh
```

## 目标问句（文档对齐）

必须能稳定回答以下提示：

```text
EXPLAIN ONLY: how do we use claude stream json and tmux + interactive claude to verify if our features work ?
```

若回答漂移，先更新 `docs/feature-verification.md` 与本目录脚本，再重复 1+2+3 直到 hard-match 通过。
