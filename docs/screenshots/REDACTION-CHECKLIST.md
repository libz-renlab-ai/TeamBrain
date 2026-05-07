```
终端截图 → 脱敏处理 → 嵌入 README
   |              |              |
capture        scrub          embed
(raw .png)  (sed / 人工)   (docs/screenshots/)
   |              |              |
   v              v              v
[terminal]  → [redacted] → [public asset]
```

# 截图脱敏核查清单 (Screenshot Redaction Checklist)

## 适用截图 / Applicable Screenshots

本清单适用于计划嵌入 README 的以下演示截图：

- `docs/screenshots/2026-05-07-intercept-warn.png` — Hook 拦截警告 UX 演示
- `docs/screenshots/2026-05-07-learn-rule.png` — Duck-mode 学习规则 UX 演示

来源计划文档：`docs/plans/2026-05-07-duck-mode-and-hook-ux-plan.md`

---

## 泄漏类别 / Leak Categories

提交前必须检查并遮盖以下 8 类私有信息：

| # | 类别 | 示例 | 替换占位符 |
|---|------|------|-----------|
| 1 | 绝对路径 | `/Users/m1/...`, `/home/...` | `[redacted-path]` |
| 2 | 主机名 | `hostname` / `uname -n` 输出 | `<host>` |
| 3 | GitHub 用户名 | `LiuShiyuMath`, `liush2yuxjtu`, `libz-renlab-ai` | `<user>` |
| 4 | GH Token 前缀 | `ghp_`, `gho_`, `ghs_`, `ghu_`, `ghr_` | `[redacted-token]` |
| 5 | API 密钥 | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MINIMAX_API_KEY`, `sk-...`, `pk-...` | `[redacted-key]` |
| 6 | 电子邮件地址 | `user@example.com` | `[redacted-email]` |
| 7 | IP 地址 | 私有 (`192.168.x.x`) + 公共 (`203.x.x.x`) | `[redacted-ip]` |
| 8 | 本地端口（含主机名） | `127.0.0.1:8787`, `localhost:3000` | `[redacted-host:port]` |

---

## 核查配方 / Verification Recipe

对截图 OCR 文本或 alt-text 副本运行以下 `grep -E` 命令；任何命中返回非零退出码：

```bash
grep -En \
  '/Users/[^[:space:]]+|/home/[^[:space:]]+|ghp_[A-Za-z0-9]+|gho_[A-Za-z0-9]+|ghs_[A-Za-z0-9]+|ghu_[A-Za-z0-9]+|ghr_[A-Za-z0-9]+|sk-[A-Za-z0-9]+|pk-[A-Za-z0-9]+|LiuShiyuMath|liush2yuxjtu|libz-renlab-ai|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|192\.168\.[0-9]+\.[0-9]+|10\.[0-9]+\.[0-9]+\.[0-9]+|127\.0\.0\.1:[0-9]+|localhost:[0-9]+' \
  "$1" && echo "LEAK DETECTED — do not commit" && exit 1 || echo "OK"
```

---

## 脱敏配方 / Redaction Recipe

对 OCR 导出的文本副本依次运行以下 `sed` 替换，再确认截图已对应遮盖：

```bash
sed -E \
  -e 's|/Users/[^[:space:]"]+|[redacted-path]|g' \
  -e 's|/home/[^[:space:]"]+|[redacted-path]|g' \
  -e 's|gh[posuhr]_[A-Za-z0-9]+|[redacted-token]|g' \
  -e 's|sk-[A-Za-z0-9]+|[redacted-key]|g' \
  -e 's|pk-[A-Za-z0-9]+|[redacted-key]|g' \
  -e 's|LiuShiyuMath|<user>|g' \
  -e 's|liush2yuxjtu|<user>|g' \
  -e 's|libz-renlab-ai|<user>|g' \
  -e 's|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[redacted-email]|g' \
  -e 's|192\.168\.[0-9]+\.[0-9]+|[redacted-ip]|g' \
  -e 's|10\.[0-9]+\.[0-9]+\.[0-9]+|[redacted-ip]|g' \
  -e 's|127\.0\.0\.1:[0-9]+|[redacted-host:port]|g' \
  -e 's|localhost:[0-9]+|[redacted-host:port]|g' \
  ocr-output.txt
```

对 `.png` 文件本身使用截图工具（Preview / GIMP / Pixelmator）手动涂盖敏感区域。

---

## 提交前核查项 / Pre-commit Checklist

- [ ] 已运行上方 `grep -E` 验证命令，输出 `OK`（退出码 0）
- [ ] 已目视检查截图，确认无终端提示符中的路径、用户名、主机名可见
- [ ] 已确认截图中无任何 token / API key 片段（包括被折叠或部分遮蔽的）
- [ ] 已确认截图中无邮件地址及真实 IP
- [ ] 已确认本地开发端口仅与 `localhost`/`127.0.0.1` 配对，已替换为占位符
- [ ] 已将脱敏后的截图保存到 `docs/screenshots/` 并覆盖原文件

---

## 截图存放路径 / Screenshot Location

所有计划嵌入 README 的截图统一存放于：

```
docs/screenshots/
```

命名格式：`YYYY-MM-DD-<描述>.png`，例如：
- `docs/screenshots/2026-05-07-intercept-warn.png`
- `docs/screenshots/2026-05-07-learn-rule.png`
