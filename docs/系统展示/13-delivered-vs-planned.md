# TeamAgent 系统展示: 十三、已交付 vs 规划边界（诚实表）

Source index: [系统展示.md](../系统展示.md)

## 十三、已交付 vs 规划边界（诚实表）

| Phase | 目标 | 状态 | 版本 |
|---|---|---|---|
| **Phase 1** — Walking Skeleton | 单人本地被动拦截 | ✅ **已完成** 2026-04-15 | v0.1.0 |
| **Phase 2** — 单人本地无可挑剔 + Wiki | Calibrator v2、多源摄入、Wiki inline 注入、benchmark v1 | ✅ **SP-1/SP-2/SP-3 主干完成**，benchmark v2/v3/v4 与 30 天长期 dogfood 未完成 | v0.3.0 |
| **Phase 3** — Ready for User #2 | 陌生人可安装、`teamagent doctor`、npm 发布包 | ✅ **已完成** 2026-04-19 | v0.5.0 |
| **Phase 4** — 团队层真正落地 | scope=team 真正工作、git-synced 知识共享 | ❌ **未实现**（`DualLayerStore` 当前 team scope 抛错）| v0.7.0 |
| **Phase 5** — 前沿 + 主动补充深化 | RAG 前沿、taste、全语义 Matcher v3 | ❌ 规划中 | v0.9.0 |
| **Phase 6** — 多 AI 工具 (MCP) | Cursor / Windsurf / ... 通过 MCP 接入 | ❌ 规划中 | v1.0.0（公开发布）|

**关键诚实披露**：
- **团队层还没跑通**。Phase 1-3 全是"单人本地"。向用户介绍时请不要把 Phase 4 当已完成；`teamagent doctor --json` 会把 `team-sharing` 明确标为 `PARTIAL`，直到 git transport、privacy redaction、review gates 都存在。
- **自动更新不是自证已完成**。`teamagent update --status` 是只读检查，会显示 `updater_binary` 是否存在；missing 时只能说明当前 checkout 还没 build updater，不代表真实全局安装已经验证。
- **MCP Server（实时顾问）未实现**。AI 在思考过程中主动 `check_pitfall` 查规则库还不行，只能靠 PreToolUse hook 被动拦截。
- **Phase 2 退出标准的 7 条量化门槛尚有 2 条未达**（30 天连续 dogfood、benchmark 超过 Auto-Memory + Codacy）。

---
