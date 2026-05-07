```
+---------------------------+
| worker-12  I-phase r12    |
| CLAUDE.md + README.md     |
| apply summary             |
+---------------------------+
```

## CLAUDE.md — 实际改动

**行号**: 132（插入后）

**完整新增 row**:
```
| **`apps/landing/`** | GitHub Pages landing page 子包（`pnpm --filter landing build`）；关联 `docs/plans/issue-84` + `.github/workflows/landing-deploy.yml` |
```

插入位置：`## Project tools / FASTPROBE` 段表格末尾，`| **Feature canned answers** | ...` 行之后（原行 131），空行之前（原行 132）。

验证: `grep -n 'apps/landing/' CLAUDE.md` → 命中第 132 行。

---

## README.md — 实际改动

**行号**: 25–69（插入后，新增 install block 在 `## 5–10 分钟上手` 之前）

**完整 install block**（起始行约 25）:
```markdown
### 快速安装

```bash
# 推荐：先下载 install.sh，确认内容后再执行
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh -o /tmp/teambrain-install.sh
cat /tmp/teambrain-install.sh          # 建议先 review，确认脚本内容符合预期
sh /tmp/teambrain-install.sh
```

也支持直接执行（适合已熟悉该脚本、或在 CI 中使用）：

```bash
curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh | sh
```

校验文件（SHA256）：**TBD H1** — SHA256 校验文件位置待 H1 open question 决定后填入。
…（teamagent init + demo + 注意事项段）
```

验证: `grep -n 'curl -fsSL https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh' README.md` → 命中第 29、37 行。

---

## git diff --stat 快照

```
CLAUDE.md | 12 ++++++------
README.md | 49 +++++++++++++++++++++++++++++++++++++++++++++++++
2 files changed, 55 insertions(+), 6 deletions(-)
```

（CLAUDE.md 的 6 deletions / 6 insertions 来自 TeamAgent 知识块自动 recompile，非 worker-12 手动改动；Project tools 表格净增 1 行。）
