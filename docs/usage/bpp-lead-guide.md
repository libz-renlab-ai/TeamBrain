# BPP 负责人 / 副负责人手册

> 给团队负责人（lead）+ 副负责人（sub-lead）看的控制台使用说明。
> 实现 acceptance.md §5 item 7。

## 你的角色权限

| 动作 | lead | sub-lead | 普通成员 |
|---|---|---|---|
| 看自己的收件箱 | ✓ | ✓ | ✓ |
| 接收 / 拒绝推送 | ✓ | ✓ | ✓ |
| 看团队 dashboard（全部成员） | ✓ | ✓ | ✗ |
| 强推一条经验给所有人 | ✓ | ✓ | ✗ |
| 撤回一条已推送经验 | ✓ | ✓ | ✗ |
| 升降级副负责人 | ✓ | ✗ | ✗ |
| 转交负责人身份 | ✓ | ✗ | ✗ |
| 删除审计日志 | ✗ | ✗ | ✗ |

acceptance.md §M1 决策 7 + Gap 3 sub-lead tiers 已实现这些边界。

## 1. 创建 / 初始化团队

仅 lead，且每个团队**只能初始化一次**：

```bash
pnpm teamagent team init --team-id <slug> --lead-email <your@email>
```

输出：
- lead token（**唯一一次显示**，存到密码管理器）
- audit HMAC secret（**唯一一次显示**，永远不轮换）
- team config 写到 `/var/lib/bpp/<slug>/team.json`

acceptance.md §M1 决策 4 — "创建团队=lead"。

## 2. 看团队控制台

打开浏览器 → `https://<bpp-server>/dashboard?lead_token=<token>`

看到：
- 所有成员的 inbox 状态（已采纳 / 已拒绝 / 待处理）
- 24h 推送数 / 撤回数 / 采纳率
- 12 个监控指标的实时值（见 `docs/ops/bpp-runbook.md` §2）
- 最近 50 条审计日志（push / accept / revoke / force-push）

## 3. 强推一条经验

什么时候用：你看到一条挖出来的高分经验，想立即推送给所有成员
（绕过自动推送阈值）。

```bash
pnpm teamagent bpp force-push --lead-token $LEAD_TOKEN \
                              --bp-id <bp-id> \
                              --receivers all
```

效果：
- 即使这条经验没到 Wilson 阈值也立即扇形发出去
- inbox 显示一个红色标签 "force-pushed by lead"
- 审计日志记录 `{ actor: lead, action: force-push, target: bp-id }`

sub-lead 可以同样用（acceptance.md Gap 3）。

## 4. 撤回一条经验

什么时候用：误推送 / 经验过时 / 收到投诉。

```bash
pnpm teamagent bpp revoke --lead-token $LEAD_TOKEN \
                          --bp-id <bp-id> \
                          --reason "误推送"
```

撤回**级联**：
- 所有未采纳的 inbox 条目消失
- 所有已采纳的本机 skill 文件被删除（acceptance.md §M1 验证方法 step 8）
- 5 秒内完成（acceptance.md §M1 质量验收）

撤回**不可逆**——要重推必须重新走推送流程。

sub-lead 可以同样用（acceptance.md Gap 3）。

## 5. 副负责人管理

仅 lead 可以升降：

```bash
# 升级
pnpm teamagent bpp role set --lead-token $LEAD_TOKEN \
                            --member <id> \
                            --role sub-lead

# 降级
pnpm teamagent bpp role set --lead-token $LEAD_TOKEN \
                            --member <id> \
                            --role member
```

副负责人**不能**：
- 转交负责人身份（仅 lead 可以）
- 升降级其他副负责人（仅 lead 可以）
- 删审计日志（**任何人**都不能）

## 6. 转交负责人身份

只允许 lead 转交，且是**一次性原子操作**：

```bash
pnpm teamagent bpp transfer-lead --lead-token $LEAD_TOKEN \
                                  --new-lead <new-email>
```

执行后：
- 旧 lead token **立即失效**
- 新 lead 收到一个一次性 token（必须 24h 内激活）
- 审计日志记一条 transfer 事件

**注意**：转交不能撤销。重新转回必须再走一次流程。

## 7. 审计日志

任何 lead / sub-lead 操作都进入**不可篡改链**（acceptance.md §M1 决策 + audit-hash-chain）。

```bash
# 查最近 100 条
pnpm teamagent bpp audit tail --n 100

# 校验整链完整
pnpm teamagent bpp audit verify --strict
```

`verify_ok=true` = 整链 HMAC 校验通过；
`verify_ok=false` = 至少一处被改过，立即 page on-call（runbook §9.3）。

acceptance.md §M1 验证方法 step 9 要求"链式签名校验通过"。

## 8. 申诉处理

成员提交申诉到 coordinator，coordinator 转交给 lead。
lead 决定接受 / 拒绝，回应在 24h 内（acceptance §M5）。

三种申诉的处理见 `docs/ops/bpp-runbook.md` §8。

## 9. 日常职责

- **每周**：扫一次团队 dashboard 的撤回率、采纳率，看团队认同感
- **每月**：复盘最近 30 条挖出来的高分经验，肉眼抽 10 条看像不像样
  （acceptance.md §9 风险一）
- **季度**：参与备份恢复演练（acceptance §M5）
- **应急**：响应 L1 报警（runbook §9）

## 10. 常见问题

### Q: lead token 丢了怎么办？

A: lead token 不能恢复，但你可以从 audit HMAC seed + 服务端记录用
`pnpm teamagent bpp lead-token recover --hmac-seed $SEED --confirm` 重生成
（这个命令本身要 root + 物理控制服务器）。
推荐：把 lead token 存进至少两个独立密码管理器（个人 + 团队共享）。

### Q: 撤回错了一条经验，能恢复吗？

A: 不能。重新创建一条相同内容的经验，再走 force-push。
（acceptance.md §4 排除清单"不做经验的历史版本"——撤回即彻底删除）

### Q: 副负责人能撤回 lead 推送的经验吗？

A: 能。sub-lead 的撤回权和 lead 一样（acceptance.md Gap 3）。
**但** sub-lead 不能撤回另一个 sub-lead 的操作（仅 lead 可以）。

### Q: 怎么知道某条推送是被自动挖出来的、还是 lead 强推的？

A: inbox 条目里有 `source` 字段：
- `auto-mining` = 挖矿管线自动推
- `lead-force-push` = lead 或 sub-lead 强推

### Q: 团队解散怎么办？

A: 走 `docs/ops/bpp-runbook.md` §12 退役流程。lead 决定是否归档、归档去哪。
