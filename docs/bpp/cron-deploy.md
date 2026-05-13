# BPP transcript purge — cron 排程部署

参考：`docs/superpowers/specs/2026-05-13-best-practice-push-design.md` §6.1
（30-day transcript retention）+ §6.2。

bin 入口：`packages/digital-twin/src/bin-purge-cron.ts`

Env vars：
- `BPP_OUTPUT_DIR`（必填）— BPP collector root 绝对路径
- `BPP_RETAIN_DAYS`（默认 30）— 保留天数

bin 行为：扫描 `<root>/<user>/<YYYY-MM-DD>/*.jsonl`，删除日期 dir 早于 cutoff
的 transcript 文件；`_bp` / `_inbox` / `_team` / `_audit` 永不触碰。stdout
打印一行 JSON 摘要；若 `_audit/` 存在，在 `_audit/<today>.jsonl` 追加一条
`type: purge_cron` 日志。

---

## 1. Linux — systemd timer（推荐）

把 `scripts/bpp-cron/systemd-bpp-purge.service` 和
`scripts/bpp-cron/systemd-bpp-purge.timer` 拷到 `/etc/systemd/system/`，按需
改 `User=` / `WorkingDirectory=` / `Environment=`：

```bash
sudo cp scripts/bpp-cron/systemd-bpp-purge.service /etc/systemd/system/
sudo cp scripts/bpp-cron/systemd-bpp-purge.timer   /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now systemd-bpp-purge.timer

# 验证 timer
systemctl list-timers | grep bpp-purge
# 手动跑一次（dry-run 行为：bin 跑完即 exit）
sudo systemctl start systemd-bpp-purge.service
# 看日志
journalctl -u systemd-bpp-purge.service --since today
```

timer 默认 03:00 每天触发一次（见 `OnCalendar=03:00`）。

---

## 2. Linux / macOS — crontab

直接装一行 crontab：

```bash
crontab -e
# 把 scripts/bpp-cron/crontab-bpp-purge.sh 里的那一行贴进去：
# 0 3 * * * BPP_OUTPUT_DIR=/var/lib/teamagent-bpp BPP_RETAIN_DAYS=30 /usr/bin/node /opt/teamagent/dist/bin-purge-cron.js >> /var/log/teamagent-bpp-purge.log 2>&1
```

`crontab-bpp-purge.sh` 里给出了 dev / prod 两种命令模板（一种走 tsx，一种走
编译后的 `dist/bin-purge-cron.js`）。

---

## 3. Windows — Task Scheduler

运行 `scripts/bpp-cron/bpp-purge-windows-task.ps1`（管理员 PowerShell）：

```powershell
# 装计划任务（每天 03:00）
.\scripts\bpp-cron\bpp-purge-windows-task.ps1 -Install `
  -BppOutputDir 'D:\teamagent\bpp-collector' `
  -BppRetainDays 30

# 验证
Get-ScheduledTask -TaskName 'TeamAgent-BPP-Purge'
# 手动跑一次
Start-ScheduledTask -TaskName 'TeamAgent-BPP-Purge'
# 查上次执行结果
Get-ScheduledTaskInfo -TaskName 'TeamAgent-BPP-Purge'

# 卸载
.\scripts\bpp-cron\bpp-purge-windows-task.ps1 -Uninstall
```

---

## 4. dry-run 测试（任何 OS）

部署前手动跑一次确认 env 配置对：

```bash
BPP_OUTPUT_DIR=/path/to/bpp-collector \
BPP_RETAIN_DAYS=30 \
  pnpm tsx packages/digital-twin/src/bin-purge-cron.ts
# 期望 stdout：
# {"purged_files":N,"purged_users":["alice@team.com",...]}
```

预期 exit code 0；非 0 表示 env 配置或路径问题，看 stderr。

---

## 5. 看上次执行日志

| 部署 | 命令 |
|------|------|
| systemd timer | `journalctl -u systemd-bpp-purge.service --since today` |
| crontab | `tail -f /var/log/teamagent-bpp-purge.log`（路径见 crontab 行） |
| Windows Task | `Get-ScheduledTaskInfo -TaskName 'TeamAgent-BPP-Purge'` + Event Viewer → Microsoft → Windows → TaskScheduler |

无论哪种 OS，只要 `<BPP_OUTPUT_DIR>/_audit/` 已存在（即 receiver 跑过至少一次），
每次 purge 也会在 `_audit/<YYYY-MM-DD>.jsonl` 末尾追加一条
`{"type":"purge_cron",...}` JSONL 行，做为 tamper-evident 审计补丁。
