# TeamAgent 系统技术文档: 6. 开发者快速上手

Source index: [SYSTEM.md](../SYSTEM.md)

## 6. 开发者快速上手

### 环境要求

- **Node.js 22+**（schema.ts 使用 `node:sqlite` 内置模块，Node 22 才有）
- **pnpm 9+**
- Windows 11 / macOS / Linux（Windows 已经过验证，路径处理有特殊 workaround）

### 首次运行步骤

```bash
# 1. 克隆仓库
git clone <repo-url> && cd teamagent

# 2. 安装依赖
pnpm install

# 3. 构建 Hook bundle（必须先构建才能注册 Hook）
pnpm --filter @teamagent/cli build:hook

# 4. 跑测试（Windows 注意：vitest 强制 fileParallelism: false，顺序执行）
pnpm test

# 5. 类型检查
pnpm typecheck

# 6. 在当前项目注册 Hook（写入 .claude/settings.local.json）
pnpm teamagent install-hook

# 7. 验证 Walking Skeleton
pnpm teamagent skeleton-demo
```

### 常用命令速查表

```bash
# ===== 知识管理 =====
pnpm teamagent pitfall                     # 交互式手动录入一条踩坑经验
pnpm teamagent pitfall --non-interactive \
  --trigger="场景描述" \
  --wrong="错误做法" \
  --correct="正确做法" \
  --reason="原因"                          # 非交互模式录入
pnpm teamagent stats                       # 查看知识库统计摘要
pnpm teamagent stats --stuck-in-promotion  # 列出卡在 probation 超 N 天的规则
pnpm teamagent review [N]                  # 列出最近 N 条知识供人工复核

# ===== 会话分析 =====
pnpm teamagent analyze                     # 分析最近一次 Claude Code 会话
pnpm teamagent analyze --commit            # 分析 + 调用 LLM 提取知识写入 DB
pnpm teamagent analyze --session=<path>    # 分析指定会话文件
pnpm teamagent scan-errors                 # 扫描会话日志中的错误信号→生成候选规则
pnpm teamagent review-candidates           # 交互式审核候选规则（[a]批准/[r]拒绝）

# ===== 知识进化 =====
pnpm teamagent calibrate                   # 重算置信度 + 自动归档低分条目
pnpm teamagent calibrate --dry-run         # 只预览，不写入
pnpm teamagent compile                     # 编译 CLAUDE.md + Agent Skills
pnpm teamagent compile --dry-run           # 预览将写/删哪些文件

# ===== 安装/卸载 =====
pnpm teamagent init                        # 一键安装：建目录+导入规则+注册 Hook+编译 CLAUDE.md
pnpm teamagent install-hook                # 单独注册 4 个 Hook 到 settings.local.json
pnpm teamagent uninstall-hook              # 移除 Hook 注册
pnpm teamagent disable                     # 临时禁用 Hook（保留数据）
pnpm teamagent enable                      # 重新启用 Hook
pnpm teamagent uninstall [--delete-data]   # 完全卸载

# ===== Wiki（前沿知识）=====
pnpm teamagent wiki:pull                   # 从 5 个源拉取前沿知识
pnpm teamagent wiki:add <url>              # 手动添加单条 URL
pnpm teamagent wiki:list                   # 查看已入库的 wiki 条目
pnpm teamagent wiki:stats                  # wiki 统计
pnpm teamagent wiki:subscriptions          # 查看订阅源
pnpm teamagent wiki:subscribe --repo owner/repo  # 订阅 GitHub 仓库 Releases
pnpm teamagent wiki:dislike <id>           # 标记不喜欢（注入时跳过）

# ===== 多源摄入 =====
pnpm teamagent ingest --from-audit         # 从 npm audit 摄入安全知识
pnpm teamagent ingest --from-git --since=30d  # 从 git hotspot 摄入知识
pnpm teamagent ingest --from-ci --since=30d   # 从 CI 失败记录摄入知识

# ===== 配置 =====
pnpm teamagent config show                 # 查看当前配置
pnpm teamagent config stop-mode async      # Stop Hook 切换为异步模式（不阻塞关闭）

# ===== 调试 =====
pnpm teamagent demo hook Bash 'command=npm install moment'  # 离线模拟 PreToolUse
pnpm teamagent verify                      # 跑 5 个端到端验证场景
pnpm teamagent dogfood-report              # 生成自举报告（系统自我评估）
pnpm teamagent dashboard --watch --open    # 启动实时 dashboard（默认 http://127.0.0.1:8787/dashboard.html）
pnpm teamagent dashboard --once            # 只重生成 docs/dashboard.html
```

**环境变量：**
```bash
TEAMAGENT_VISIBILITY=silent|smart|verbose  # 控制归因渲染详细程度（默认 smart）
```

### 如何启动实时 dashboard

在仓库根目录运行：

```bash
pnpm teamagent dashboard --watch --open
```

这会读取真实 TeamAgent 数据源，生成 `docs/dashboard.html`，并启动本地 HTTP
服务。默认 URL 是 `http://127.0.0.1:8787/dashboard.html`。服务运行时每 2
秒重新读取 `.teamagent/knowledge.db`、`~/.teamagent/global.db` 和
`~/.teamagent/events.db`，重新生成 dashboard，并让浏览器自动刷新。

常用参数：

```bash
pnpm teamagent dashboard --watch --port=0 --interval=5s  # 使用随机空闲端口，5 秒刷新
pnpm teamagent dashboard --once                          # 只生成一次，不启动服务
```

### 如何添加新的 CLI 命令

1. 在 `packages/cli/src/commands/` 下新建文件，如 `my-command.ts`，导出 `executeMyCommand()` 函数
2. 在 `packages/cli/src/bin.ts` 的 `switch(command)` 中添加 `case "my-command":` 分支
3. 在 `bin.ts` 的 help 文本里追加用法说明

### 如何添加新的知识采集信号

在 `packages/core/src/correction-detector/rule-based.ts` 中，`CorrectionDetectorRuleBased` 通过分析 `SessionTurn[]` 序列识别纠正时刻。添加新信号需要：

1. 在 `rule-based.ts` 的检测逻辑里添加新的信号模式（如检测特定工具调用序列）
2. 对应补充信号权重（现有信号范围 0.30~0.95）
3. 在 `packages/core/src/correction-detector/__tests__/` 下添加测试用例（TDD 原则：先写测试再改实现）

---
