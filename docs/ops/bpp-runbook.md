# BPP 生产化运维手册

> Implements acceptance.md §M5 §5 item 6. This runbook is what a coordinator
> follows on day 1 of production deployment, what an on-call refers to during
> incidents, and what a successor reads to take over.
>
> Status: **STAGED**. The runbook is complete on paper but most procedures
> need to be **rehearsed once** against a real server before they count as
> proven (acceptance.md §M5 验证方法 step 5-6 — 升级/回滚演练 / 备份恢复演练).

## 0. 适用范围

- 中心服务 = `mock-server.ts` 演进体（含 BPP /v1/* 路由 + uploader receiver + dashboard）
- 部署目标 = 单台 Linux 主机（云主机 / 自建机器，acceptance.md §7 D6）
- 多团队隔离 = 同主机不同 `outputDir` + 不同端口 + 独立密钥
- 不适用 = K8s / 多区域 / Auto-scale / 多副本（acceptance.md §1 排除清单）

## 1. 首次部署清单（day 0）

### 1.1 主机准备

- [ ] Linux x86_64, ≥ 2 vCPU, ≥ 4 GB RAM, ≥ 50 GB SSD
- [ ] Node.js 22 LTS（`node --version` 应 ≥ v22.0）
- [ ] pnpm 9+
- [ ] systemd（用于服务化）
- [ ] 反向代理（nginx / caddy / cloudflare tunnel）做 HTTPS 终结
- [ ] 监控目标可访问（Prometheus / Grafana / 直接走 cloudwatch 都可）

### 1.2 密钥发放

| 密钥 | 用途 | 来源 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 挖矿调用大模型（acceptance §7 D7） | 团队负责人申请 |
| `BPP_TEAM_ID` | 标识本团队 | coordinator 在 day 0 选定 |
| `BPP_BUDGET_LIMIT_USD` | 单日大模型预算上限 | acceptance §M3 默认 5 USD |
| `BPP_TLS_CERT` / `BPP_TLS_KEY` | HTTPS 证书 | Let's Encrypt / 内部 CA |
| `BPP_LEAD_TOKEN` | 团队负责人撤回 / 强推鉴权 | day 0 由 coordinator 用 `pnpm teamagent bpp lead-token mint` 生成 |
| `BPP_AUDIT_HMAC_SECRET` | 审计链 HMAC seed | day 0 一次性生成、永远不轮换 |

密钥**不允许**出现在：
- git history（任何分支）
- 任何 log 文件
- 任何 PR / issue / commit message
- 任何错误信息（即使 stderr）

### 1.3 systemd 服务

`/etc/systemd/system/bpp-server.service`：

```ini
[Unit]
Description=TeamBrain BPP server
After=network.target

[Service]
Type=simple
User=bpp
Group=bpp
WorkingDirectory=/opt/bpp
EnvironmentFile=/etc/bpp/env
ExecStart=/usr/bin/node /opt/bpp/packages/digital-twin/dist/bin-prod-server.js
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/bpp/server.log
StandardError=append:/var/log/bpp/error.log

[Install]
WantedBy=multi-user.target
```

`/etc/bpp/env`（chmod 600，bpp:bpp 持有）：

```
NODE_ENV=production
BPP_PORT=18787
BPP_TEAM_ID=<team-slug>
BPP_OUTPUT_DIR=/var/lib/bpp/<team-slug>
ANTHROPIC_API_KEY=<key>
BPP_BUDGET_LIMIT_USD=5
BPP_TLS_CERT=/etc/bpp/tls/cert.pem
BPP_TLS_KEY=/etc/bpp/tls/key.pem
BPP_LEAD_TOKEN_HASH=<sha256 of lead token>
BPP_AUDIT_HMAC_SECRET=<random 64-char hex>
```

### 1.4 启动 + 验证

```bash
sudo systemctl daemon-reload
sudo systemctl enable bpp-server
sudo systemctl start bpp-server
sudo systemctl status bpp-server   # active (running)
journalctl -u bpp-server -n 50     # no errors

# Smoke test from another host:
curl -sf https://<host>/healthz | jq    # {"ok": true, "version": "0.x"}
curl -sf https://<host>/dashboard      # HTML loads
```

## 2. 12 个核心监控指标（acceptance §M5 §功能验收 monitoring）

| 指标 | 阈值 | 计算源 | Alert 条件 |
|---|---|---|---|
| 1. 挖矿成功率 | ≥ 95% / 24h | mining run log | < 90% / 24h |
| 2. 推送延迟 P95 | ≤ 3 s | server-handlers timing | > 5 s for 5 min |
| 3. 采纳率 | ≥ 30% | accept-handler events | < 15% / 24h（产品报警） |
| 4. 撤回数 | < 5% pushed | revoke audit | > 10% / 24h |
| 5. 对话上传量 | 每人 ≥ 5/天 | upload receiver | < 1/天 持续 3 天 |
| 6. 预算消耗 | < limit | budget-tracker | > 80% / 24h |
| 7. 大模型 4xx | 0 | llm-client error rate | > 1% / 1h |
| 8. 大模型 5xx | < 0.1% | llm-client error rate | > 1% / 1h |
| 9. 审计链 verify_ok | 100% | audit-hash-chain | any false |
| 10. 收件箱条目数 | growth steady | inbox JSONL line count | flat-line 3 天 |
| 11. SSE 连接数 | proportional to team | sse-broadcast metric | 0 持续 1h（连接断） |
| 12. 敏感字段命中 | < 100/天 | server-side scanner | > 1000/天（攻击信号） |

监控数据采集脚本：`packages/digital-twin/src/bin-metrics-export.ts`（由 prometheus
scrape `/metrics` 端点）。

监控数据延迟门槛：所有指标实时刷新 ≤ 60 秒（acceptance §M5 质量验收）。

## 3. 报警通道

- **L1 紧急**（值班人在 2 分钟内响应）：
  - 大模型密钥失效（指标 7/8 报警）
  - 上传通道全员失败（指标 5 + 12 双触发）
  - 服务整体宕机（healthz 失败）
- **L2 关注**（值班人 1 小时内查看）：
  - 预算消耗 > 80%
  - 推送延迟 P95 > 5s 持续 5 分钟
  - 撤回率 > 10%
- **L3 信息**（值班人下班前看）：
  - 采纳率 < 15% / 24h（产品信号）
  - 上传量低于预期

报警从触发到通知到值班人的端到端延迟 ≤ 2 分钟（acceptance §M5 质量验收）。

报警通道实现（按优先级、可叠加）：
1. 自定义 webhook → 飞书 / 钉钉 / Slack 群（L1 必须）
2. 邮件 SMTP（L2 必须）
3. SMS（L1 推荐，需 Twilio 或国内供应商）

## 4. 每日自动备份

cron @ 02:00 UTC：

```bash
0 2 * * * /opt/bpp/scripts/backup-daily.sh >> /var/log/bpp/backup.log 2>&1
```

`backup-daily.sh` 内容：

```bash
#!/usr/bin/env bash
set -euo pipefail
DAY="$(date -u +%Y-%m-%d)"
OUT="/var/backup/bpp/$DAY"
mkdir -p "$OUT"
# 中心对话仓库
tar -czf "$OUT/uploads.tar.gz"      /var/lib/bpp/<team>/uploads
# 经验仓库
tar -czf "$OUT/best-practices.tar.gz" /var/lib/bpp/<team>/bps
# 审计日志
tar -czf "$OUT/audit.tar.gz"        /var/lib/bpp/<team>/audit
# 技能库（仅 inbox-side compile 的产物副本，便于回滚）
tar -czf "$OUT/skills-shadow.tar.gz" /var/lib/bpp/<team>/skills-shadow
# sha256 manifest
( cd "$OUT" && sha256sum *.tar.gz > manifest.sha256 )

# 保留 90 天
find /var/backup/bpp -mtime +90 -delete
```

每季度（cron @ 03:00 UTC 每季首日）跑一次**恢复演练**：
- 在一台空主机上从最新备份恢复
- 跑 healthz + 一次 BP push + 一次 accept 端到端
- PASS → 写入 `/var/log/bpp/restore-drill.log`
- FAIL → 立即 page on-call
- 演练失败率必须维持 0%（acceptance §M5 质量验收）

## 5. 多团队隔离

同主机跑多个团队：

- 物理路径：`/var/lib/bpp/<team-slug>/`（每团队独立）
- 端口：每团队独占一个端口（18787, 18788, ...）
- 密钥：每团队独立 .env，互不读取
- systemd unit：`bpp-server@<team>.service`（template unit）
- 日志：`/var/log/bpp/<team>/`

**隔离验证**：acceptance §M5 验证方法 step 4——启动两团队甲、乙，
推送 5 条经验各组，验证甲成员看不到乙的任何经验、密钥、预算。

```bash
# 在甲成员的 host：
curl -H "Authorization: Bearer $JIA_TOKEN" https://server-A/v1/inbox?receiver=jia
# 在乙成员的 host：
curl -H "Authorization: Bearer $YI_TOKEN" https://server-B/v1/inbox?receiver=yi
# 互相用对方 token 访问对方端点必须 401/403
```

## 6. 升级流程

目标：不停服升级，全员无感。

- [ ] 把新版 build 复制到 `/opt/bpp-staging/`
- [ ] 跑 `/opt/bpp-staging/scripts/upgrade-precheck.sh`（typecheck + smoke test）
- [ ] systemd reload-or-restart：
      ```
      sudo systemctl reload bpp-server   # 如果只改了 config
      # OR
      sudo systemctl restart bpp-server  # 如果改了 code
      ```
- [ ] 5 秒内 `curl /healthz` 确认 active
- [ ] 跑 `scripts/upgrade-smoke.sh` 验证 push + inbox + accept 链路
- [ ] 把 staging 路径 `mv` 成新的 `/opt/bpp/`（保留旧版到 `/opt/bpp.prev/`）
- [ ] 5 分钟无报警 = 升级完成

升级期间推送链路**不允许中断**——acceptance §M5 质量验收要求 user 无感。
（实际做法：mock-server 内已有 SSE broadcaster reconnect 逻辑，restart 时 SSE
client 自动重连；HTTP 请求在 restart 窗口里可能出 connection refused < 1 秒，
nginx upstream retry 接住）。

## 7. 回滚流程（5 分钟目标）

触发条件：升级后**任一**：
- L1 报警触发
- L2 报警持续 5 分钟
- 用户报告功能不可用

操作：

```bash
sudo systemctl stop bpp-server
mv /opt/bpp /opt/bpp.bad
mv /opt/bpp.prev /opt/bpp
sudo systemctl start bpp-server
sleep 5
curl -sf https://<host>/healthz | jq '.version'
```

回滚后强制运行：

- [ ] 跑 `scripts/restore-postroll.sh` 检查 inbox / audit / skills-shadow 一致性
- [ ] 给值班人 + 升级负责人发回滚通知
- [ ] 在 `/var/log/bpp/incidents/<date>.md` 写 incident report

回滚演练每月一次（acceptance §M5 质量验收）。

## 8. 投诉申诉通道

每个成员有三种申诉：

### 8.1 "不想被挖矿了"

```bash
pnpm teamagent bpp opt-out --member <id>
```

效果：
- 立刻停止从该成员的 transcript 跑挖矿
- 已挖出的 BP **不**反向追溯删除（acceptance §10 数据保留策略）
- 该成员可继续接收推送（除非另行 opt-out inbox）

### 8.2 "撤销我对某条经验的采纳"

```bash
pnpm teamagent bpp unaccept --member <id> --bp <bp-id>
```

效果：
- 删除该成员的本机 skill 文件
- 在 inbox 把该条标回 "dismissed"
- 审计链记录 unaccept 事件

### 8.3 "删除我历史上传的某次对话"

```bash
pnpm teamagent bpp purge-transcript --member <id> --session <session-id>
```

效果：
- 物理删除 `/var/lib/bpp/<team>/uploads/<member>/<session>.jsonl`
- 在审计日志记一条 purge 事件（含原因、操作时间，**不含**被删的内容本身）
- 不允许 partial delete（要么整 session 删，要么不删）

**响应时间**：申诉提交后 24 小时内完成（acceptance §M5 功能验收）。

## 9. 应急响应剧本

### 9.1 大模型密钥失效

症状：指标 7 (4xx) 飙升 / 指标 8 (5xx) 飙升 / 挖矿 24h 无候选产出

操作：
1. 跑 `curl -sf https://api.anthropic.com/v1/messages -H "x-api-key:$KEY" -d '{}'` 验证
2. 如确认失效：
   - 临时切到 `claudefast` profile（如已配置）
   - 否则启用 mock 模式（acceptance §M3 质量验收: mock 必须永远可用）
3. 联系团队负责人重申请 / 续费 API
4. 在 incident log 记录

### 9.2 服务整体宕机

症状：healthz 失败 / systemd status failed

操作：
1. `journalctl -u bpp-server -n 200 --since "10 min ago"`
2. 检查 OOM (`dmesg | tail`)、disk full (`df -h`)、上游故障 (`curl /healthz` to anthropic)
3. 如果是 panic：`systemctl restart bpp-server`，如果反复 crash 则回滚 §7
4. 通知值班人

### 9.3 审计链 verify_ok 出现 false

症状：指标 9 报警，acceptance §M1 验证方法 step 9 链式签名校验失败

操作：
1. **立即停止所有写入**：`systemctl stop bpp-server`
2. 跑 `pnpm teamagent bpp audit-chain verify --strict` 找出第一处断链
3. 调取 `/var/log/bpp/server.log` 看断链时段的所有请求
4. 不可篡改链是审计的根本——任何成功验证修复前**不允许 service 重启**
5. 把详情上报 acceptance.md verifier（用户本人）

## 10. 长期维护

- **每周**：扫一次报警历史，识别误报模式调整阈值
- **每月**：升级 + 回滚演练
- **每季**：备份恢复演练 + secret rotation（除 audit HMAC seed）
- **每年**：在另一台空主机做完整 DR 恢复（acceptance §M5 隔离 / 一致性大查）

## 11. 演练记录簿

acceptance §M5 质量验收要求"备份恢复 / 升级回滚演练失败率 0%"。
每次演练写一行到 `/var/log/bpp/drill-log.md`：

```
2026-06-01 02:15Z restore-quarterly  PASS  restored from 2026-05-31 backup
2026-06-15 03:00Z upgrade-rollback-monthly  PASS  upgrade v0.12->v0.13, rolled back, restored
```

3 行连续 PASS = 演练合格；任意 FAIL → 即时复盘 + 4 周内补考。

## 12. 退役（remote shutdown）

当本 BPP 服务该停了：

1. 通知所有成员（≥ 7 天预告）
2. 把 `/var/lib/bpp/<team>/` 物理拷贝一份到团队负责人指定的归档位置
3. 把所有成员的本机 skill 文件 dump 列表给负责人（成员自行决定保留或删除）
4. `systemctl disable + stop bpp-server`
5. `/var/lib/bpp/<team>/` 物理删除
6. 6 个月后 `/var/backup/bpp/<team>/` 物理删除
7. 写最后一份 incident-style 退役报告到 acceptance.md §10
