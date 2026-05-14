# BPP 成员使用手册

> 给团队成员看的"装好之后怎么用"。实现 acceptance.md §5 item 7。

## 你会用到的 4 个功能

### 1. 自动上传对话给中心服务（背景跑，无感知）

装好 BPP 收集器后，你和智能助手的每次对话都会**自动**上传到中心服务，
方便挖矿系统从你的工作记录里抽出对队友有用的经验。

**敏感信息保护**：上传前本机自动扫描密钥、密码、私人邮箱、身份证号等
敏感串，命中就**就地模糊化**，原文不出本机。

### 2. 在收件箱里看队友推送的经验

打开浏览器 → `http://localhost:18787/inbox?receiver=<你的-id>`

看到三种视图（acceptance.md §M1 决策 5）：
- **按推送人**：看 Alice 推的、Bob 推的
- **按主题**：testing / git-flow / ai-collab
- **按时间**：最新优先

每条经验下面三个按钮：
- ✅ **采纳**：本机生成一份技能文件（`~/.claude/skills/teamagent/<id>/SKILL.md`），
  以后你的助手在合适场景会自动用上
- ❌ **拒绝**：不感兴趣，永远不再推送同一条
- 🕗 **搁置**：先放着，下次再说

### 3. 查看自己的"挖矿足迹"

```
pnpm teamagent bpp my-stats
```

输出：
- 已上传对话总量
- 最近一次上传时间
- 敏感字段被模糊化次数
- 你的对话挖出来的、被推送出去的经验数（默认隐藏推送对象身份）

### 4. 申诉 / 删除数据

三种申诉（acceptance.md §M5 投诉申诉通道）：

```bash
# 不想被挖矿了（停止从你的 transcript 挖矿）
pnpm teamagent bpp opt-out --member <你的-id>

# 撤销你对某条经验的采纳（删除本机 skill 文件）
pnpm teamagent bpp unaccept --member <你的-id> --bp <bp-id>

# 删除你历史上传的某次对话（物理删除）
pnpm teamagent bpp purge-transcript --member <你的-id> --session <session-id>
```

任何一种申诉**24 小时内**完成（acceptance §M5 §功能验收）。

## 安装收集器

### macOS / Linux

```bash
git clone https://github.com/libz-renlab-ai/TeamBrain.git
cd TeamBrain
pnpm install
pnpm teamagent bpp install --server https://<your-bpp-server>:18787 \
                            --member-id <你的-id> \
                            --team-id <团队-id>
```

会在你的 `~/.claude/settings.json` 里加一条 hook，UserPromptSubmit / Stop
事件触发时自动上传。

### Windows

```powershell
git clone https://github.com/libz-renlab-ai/TeamBrain.git
cd TeamBrain
pnpm install
pnpm teamagent bpp install --server https://<your-bpp-server>:18787 `
                            --member-id <你的-id> `
                            --team-id <团队-id>
```

## 验证安装成功

```bash
pnpm teamagent bpp ping
```

应输出：
```
✓ uploader: connected
✓ inbox: 0 items
✓ statusline: registered
```

跟你的助手随便聊一句，再跑：
```bash
pnpm teamagent bpp my-stats
```

应该看到「已上传对话总量 ≥ 1」。

## 第一次收到推送

当队友的经验被挖出来并自动推到你的收件箱时（acceptance §M3 §M1），
你的 Claude Code statusline 会显示一个数字 inbox angle，类似：

```
🦆 BPP: 3 new
```

点开 `http://localhost:18787/inbox?receiver=<你的-id>` 看具体内容。

## 这个系统**不会**做的事

- 不会给你打绩效分
- 不会让其他成员知道你接受 / 拒绝了什么经验（acceptance §M1 决策 2 推送方完全隐形）
- 不会让其他人查你的 transcript
- 不会让团队负责人之外的人撤回别人的经验
- 不会让经验自动 commit 到你的代码仓库

## 常见问题

### Q: 我上传的对话会被同事看到吗？

A: 不会直接看到原文。原文存在中心服务，**只有挖矿管线会读**，挖出来的
是"规则 / 习惯"形式的总结（去身份化），**经验里不出现你的对话原文**。

### Q: 我能查到谁推送了某条经验吗？

A: 不能。acceptance.md §M1 决策 2 规定"推送方完全隐形"——`pushed_by`
字段只 server 内部留底，不暴露在 inbox API。

### Q: 我可以编辑队友推过来的经验吗？

A: 不能。你只能采纳 / 拒绝 / 搁置。要改经验，让队友重推一条（acceptance.md §4 排除清单"不做经验编辑"）。

### Q: 我采纳了一条经验后想反悔？

A: 跑 `pnpm teamagent bpp unaccept --member <你> --bp <id>`。
本机 skill 文件立即删除。

### Q: 实验结束后我的数据会怎样？

A: 见 informed-consent.md，60 天后所有原始数据物理删除，仅保留聚合统计。

## 出问题找谁

- 上传通道不通：联系 coordinator
- 经验内容争议：联系负责人
- 收件箱不更新：先跑 `pnpm teamagent bpp ping`，不行再联系 coordinator
- 想退出实验：邮件给 coordinator，立即生效
