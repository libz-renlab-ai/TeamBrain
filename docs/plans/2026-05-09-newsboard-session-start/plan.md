# Plan — TeamBrain Newsboard SessionStart Hook (demo)

```
              __                                         __
             /  \____      呷呷~                        /  \____
            ( o    o )    welcome to TeamBrain         ( o    o )
             \______/                                   \______/
                ^^                                         ^^
   ┌──────────────────────────────────────────────────────────────┐
   │  research → plan → annotate → implement → report             │
   │            ▲ you are here                                    │
   │                                                              │
   │   ┌───────────────────────┐         ┌──────────────────┐     │
   │   │ SessionStart hook     │  >&2    │  4-section MOTD  │     │
   │   │  (.claude/hooks/      │ ──────► │   to user only   │     │
   │   │   newsboard-          │         │  (NOT to Claude) │     │
   │   │   session-start.sh)   │         └──────────────────┘     │
   │   └───────────────────────┘                                  │
   │                                                              │
   │     (1) install/update   (3) just shipped                    │
   │     (2) new + try it     (4) random feature                  │
   └──────────────────────────────────────────────────────────────┘
```

> 鸭鸭 TL;DR (>ω<) — 给 TeamBrain 仓库装一块 SessionStart 时弹给用户看的"报刊栏"，
> 4 格内容：install/update / 刚 push 的 PR / 新且没试过的 feature / 今日随机彩蛋。
> **走 stderr，不进 Claude 上下文，永不阻塞**。每 session 都打。
> 这是一个 **demo**，不上 telemetry，不要求精确 unused 检测。

---

## 1. Task description

### 做什么
- 在 `.claude/hooks/newsboard-session-start.sh` 添一个新 bash hook（项目级，git 跟踪）
- 在 `.claude/settings.json` 注册到 `SessionStart` 事件
- 启动 Claude Code 在 TeamBrain checkout 内时，每次 session 开头，hook 把 ASCII
  鸭主题 newsboard 写到 **stderr**（用户可见，Claude 上下文不可见）
- 报刊栏 4 格按固定顺序：
  1. **Install / Update** — 比较本地 `VERSION` 文件 vs `package.json` 的 `version`，标显升级提示（不联网）
  2. **Newly pushed** — `git log --since="7 days ago" --grep="^feat\\|^fix" -3`
  3. **Newly + (assumed) unused** — 取 (2) 同源前 2 条，文案 prefix *"haven't tried?"*；不做实际 telemetry
  4. **Random feature** — `awk '/^[0-9]+\\.\\s/' docs/PRODUCT-FEATURES.md` 中按 `(epoch_seconds % count)` 取一行
- 顶/底用 ASCII 鸭子分割（沿用 PRODUCT-FEATURES.md 既有 ASCII 风格）

### 怎么做
- 纯 bash，no node，no npm dep
- 总是 `exit 0`（hook 不阻塞 contract，参见 `docs/CONTEXT.md:108`）
- 不解析 stdin JSON（hook 不依赖 SessionStart payload）
- 任何子步骤失败 → 静默退化为 *"section unavailable"* 文案
- 总耗时目标 ≤ 200ms（4 个 file read + 1 个 git log）
- **永不向 stdout 写任何内容**（防止误污染 Claude 上下文，judge 兜底）

### 不做
- ❌ 不写 user-level 安装路径（`~/.claude/`、`~/.teamagent/` 不动）
- ❌ 不接 telemetry / usage tracking（unused 用文案标，不查 transcript）
- ❌ 不加 throttle / state file（每 session 都打）
- ❌ 不做 npm registry 网络请求（offline-safe）
- ❌ 不写 ADR（不够 hard-to-reverse / surprising / trade-off）
- ❌ 不集成 AttributionBus（这是 SessionStart MOTD，不属于 system attribution）

---

## 2. Expected outputs

| Path | Type | Purpose |
|---|---|---|
| `.claude/hooks/newsboard-session-start.sh` | new (bash, ~80 行) | The hook script |
| `.claude/settings.json` | edit | 在 hooks.SessionStart 加一项 |
| `docs/plans/2026-05-09-newsboard-session-start/plan.md` | this file | spec |
| `docs/plans/2026-05-09-newsboard-session-start/research.md` | new | grill findings |
| `docs/plans/2026-05-09-newsboard-session-start/judge.md` | new | 3rd-party LLM-judge 播本 |
| `docs/plans/2026-05-09-newsboard-session-start/report.md` | new (after impl) | 完成情况 + 偏差 |

### Acceptance（人眼可验）
- 在 TeamBrain checkout 起一个新 Claude Code session → 用户看到 ≥30 行 ASCII newsboard
- 4 个 section 全部呈现（数据源缺失时显示占位文案，不是空段）
- `claudefast -p ""` 非交互 → hook 仍 `exit 0`，不崩
- judge.md 跑 PASS

---

## 3. How to verify (3rd-party LLM-judge harness)

完整播本在 [`./judge.md`](./judge.md)。三段大纲：

**RUN** — 用固定输入 JSON 喂 hook，捕 stdout/stderr/exit/duration → `.judge/<run_id>/`

**DUMP** — 写 canonical `judge.json`，6 个字段：`run_id` / `exit_code` / `stdout_bytes` /
`stderr_lines` / `duration_ms` / `evidence_dir`

**READ** — `claudefast -p` 召一只独立 LLM 当 judge，**只**读 judge.json + evidence dir
（不读 hook 源码），对 6 条 assertion 给 PASS/FAIL：

| ID | Assertion | Why |
|---|---|---|
| A1 | `exit_code == 0` | 不阻塞 contract |
| A2 | `stdout_bytes == 0` 或 stdout 是合法 JSON 但**无** `additionalContext` | 防止泄漏到 Claude（"to user not to cc"硬约束） |
| A3 | stderr 含 `TEAMBRAIN NEWSBOARD` 字面 | header 渲染了 |
| A4 | stderr 含 4 个 section 标签 | 4 格全在 |
| A5 | stderr 含至少 1 个来自 `docs/PRODUCT-FEATURES.md` 的 feature 名 | 数据源真接通了 |
| A6 | `duration_ms < 500` | 不拖 session 启动 |

LLM judge **不能凭"看上去对"判断**；只能基于 evidence 文件 + assertion。

---

## 4. Section data sources（具体到命令）

| Section | Data source | Failure mode 文案 |
|---|---|---|
| Install / Update | `cat VERSION` vs `jq -r '.version' package.json` | "version unknown" |
| Newly pushed | `git log --since="7 days ago" --pretty="%h %s" --grep="^feat\\|^fix" -3` | "quiet week" |
| New + try | 同上前 2 条，prefix `"haven't tried?"` | 同上 |
| Random feature | `awk '/^[0-9]+\\.\\s/' docs/PRODUCT-FEATURES.md`，行号 = `epoch % count` | "feature catalog missing" |

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| stdout 误污染 Claude 上下文 | 脚本只用 `>&2`；judge A2 兜底 |
| 浅 clone 仓库 `git log` 拿不到 7d 数据 | fallback "quiet week" |
| `claudefast -p` 非交互模式下 stderr 进 debug log 而非用户眼睛 | 接受：自动化场景本就不需要 newsboard |
| Windows cmd 渲染崩 | 仅用 BMP plane ASCII，不用高位 unicode |
| `.claude/settings.json` 与 user-level 同名 hook 重复触发 | settings.json 是合并语义，新 hook 与 user-level `bin-session-start.cjs` 并存，按 array 顺序串跑 |

---

## 6. Out of scope（不在本计划，未来另开）

- 真 telemetry / usage tracking
- npm registry 网络查询
- Throttle / per-day cadence
- User-level 出厂安装（`teamagent install-user-hook` 派发）
- AttributionBus 集成
- 多语言（仅中英 ASCII）
