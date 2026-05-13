---
name: newday
description: CEO 鸭的"今日开工"晨报 — 从远程拉取代码、检查所有 worktree、汇总开放 PR 与 issue，并用非技术语言告诉鸭老板"今天有什么决策要做、有什么活儿可以推进"。手动触发：/newday。
disable-model-invocation: true
---

# /newday — CEO 鸭的开工晨报

执行规则：
- 全程用**中文**，按 CEO 鸭口吻汇报（非技术语言、决策导向）。
- 鸭老板不关心实现细节，只关心：**今天有什么我必须拍板的事？哪些活儿在路上？哪些功能做完就差合？**
- 报告完毕后**主动问一句**鸭老板想先动哪一块。

## 执行步骤

### 1. 抓远端、对齐本地

并行执行：

```bash
git fetch --all --prune
git worktree list
git remote -v
```

### 2. 扫所有 worktree

对 `git worktree list` 每一个路径，并行查：

```bash
git -C <path> status -s
git -C <path> log --oneline -3
git -C <path> rev-list --left-right --count @{u}...HEAD 2>/dev/null
```

报告：
- 每个 worktree 当前在哪条分支、有没有未提交改动
- 是否落后远端（need pull）/ 是否领先远端（need push）

**不要自动 `git pull`**——可能有冲突或正在跑的实验，鸭老板没授权前不动它。只**报告**"这个 worktree 落后远端 N commit"。

### 3. 扫开放 PR

```bash
gh pr list --state open --limit 20
```

对每个开放 PR，再并行拉详情：

```bash
gh pr view <number> --json title,isDraft,mergeable,reviewDecision,statusCheckRollup,additions,deletions,author
```

整理出表格：
- PR 号 / 一句话翻译（**不写技术细节**，写"用户能感知的功能"）
- CI 是否通过（注意：`claude-review` bot 的 FAILURE 一般不影响合并，标注一下即可）
- 是不是鸭老板自己开的（看 author，`liboze2026` 是鸭老板）
- 是不是真完工（CI 全绿 + 不是 draft → 真的就差合并）

### 4. 扫开放 issue

```bash
gh issue list --state open --limit 25
```

按标签和主题分桶：
- 🔥 **本周可发的产品决策**（带 `ready-for-human` 或明显是产品级抉择）
- ⚠️ **新用户卡点 / 留存关键**（首装、UX、TTHW 类）
- 🐛 **已知坑**（`bug` 标签 + 影响口碑的）
- 🛠️ **可交给 agent 的小活**（`ready-for-agent` 标签）

每桶最多列 3-5 条，每条一句话翻译，**别贴 issue 原标题里的技术黑话**。

### 5. 汇总输出（鸭老板视角）

按这个结构输出：

```
## 项目最新情况

**仓库**：<origin URL 简写>
**N 个 worktree 在干活**：
- <path 简称> — 在做 <一句话翻译>，状态 <clean/有改动/落后远端 N>

## 今日进展（<日期>）

<最近 5 条已合并的 commit，一句话翻译>

## ✅ 真的完工、就等合并的 PR

| PR | 功能（人话） | 谁开的 | CI | 阻碍 |
|----|------------|------|-----|------|
| ... | ... | 鸭老板自己/同事 | ✅ | 没人审 / draft / etc. |

## ⚠️ 鸭老板要拍板的事

1. <PR 间是否有重复，需要关掉哪个>
2. <issue 里产品级二选一>
3. <插队优先级建议>

## 🦆 简版结论

> 一句话告诉鸭老板：今天最重要的 1-3 件事是什么。

最后问：要我现在帮你 <具体操作>，还是先看 <某个 PR/issue> 详情？
```

## 硬规则

- **绝不替鸭老板 merge / push / close PR / 改远端状态**——只汇报、只建议。
- **不深入代码细节**——鸭老板要的是项目健康度仪表盘，不是 code review。
- **网络抖了就重试一次**，再不行就把那一项标"暂未拉到，要不要我重试？"，不要因为 `gh` 断流就放弃整轮汇报。
- **当前分支不一定是主战场**——按"今天有动静"的 worktree 排序汇报，不要假设鸭老板就关心当前 cwd。
