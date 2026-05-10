```text
   issue #155 decision 3 ("半残能干净重装")
              ↓
   原计划 (Order 2): packages/core/src/install-state/ 196 行 TS 模块
                     per-project 续命小本本, schema-versioned, FCIS-shaped
              ↓
   2026-05-10 grill (Q5): 发现每一步都已天然幂等
                          tar -xzf 覆盖 / ln -sf 替换 / pnpm 缓存 /
                          curl -C - / init 子步骤 skip-if-exists
              ↓
   ADR-0011 决议: 不写小本本; 靠幂等达成 V3 验收;
                   Order 2 取消; 6-order chain → 5-order chain
```

---
Status: accepted
Date: 2026-05-10
Source: issue #155 grill session (worktree-146 rename, Q1–Q6 resolution)
Supersedes: 不适用
Superseded by: 不适用
Implementation:
  - docs/plans/issue-155/order-2-resume-state/plan.md (annotate CANCELLED at top)
  - docs/plans/issue-155/INDEX.md (5-order chain; Order 2 marked CANCELLED)
  - packages/core/src/install-state/ (不创建)
  - docs/CONTEXT.md flagged ambiguity "resume notebook" (resolved per this ADR)
---

# ADR-0011: Install resumption via idempotency, not via resume notebook

CEO 鸭 issue #155 decision 3 ("半残能干净重装") 原计划做一个 per-project resume notebook (`packages/core/src/install-state/`，详见 Order 2 plan)，记录哪几个 install step 已完成，让重跑跳过已做的。2026-05-10 的 grill session 烤到 Q5 时发现：**install pipeline 中每个步骤都已通过底层工具天然幂等**——再加一层应用级小本本属过度设计。

具体幂等点：

- `release/install.sh`：用 `tar -xzf -C ... --strip-components=1` (覆盖式解压)、`ln -sf` (原子替换 symlink)、`curl` (可加 `-C -` 做 partial-content 续传)。
- `scripts/bootstrap.sh` (NEW，issue #155 创建)：跑 `pnpm install` (pnpm 自带缓存与 partial-download resume)、`pnpm build` (TypeScript 编译输出可重复)、`pnpm teamagent init`。
- `pnpm teamagent init` 的子命令 (`install-hook` / `install-user-hook` / `install-plugins`)：每条都做 "已注册则跳过" 检查。

V3 验收 ("Ctrl-C 后再跑能干净恢复") 因此**无需** notebook：rerun 就是 rerun，底层工具自动跳过已做的工作。

## Considered Options

- **(a) Pure idempotency (no notebook) [chosen]** — 取消 Order 2；靠 tar / ln -sf / pnpm cache / curl -C - / init 的 skip-if-exists 实现重入安全。**代价**：196 行 TS 模块不写，少一个文件维护。**收益**：架构更简单；shell 脚本与 TS 状态文件之间没有 chicken-and-egg。
- **(b) Notebook scoped to `teamagent init` only** — 缩小 Order 2 scope，仅给 init 做 per-project 状态机。**Reject**：init 子步骤本身已幂等 (代码里已有 `if existing then skip`)；notebook 在 filesystem + JSON 文件两处复制状态，反而引入一致性风险。
- **(c) Full notebook + shell↔TS bridge** — Order 2 原设计扩展，加 `teamagent install-state mark-done <step>` CLI 子命令让 shell 脚本能调。**Reject**：chicken-and-egg (shell 在 binary 装入前调不到 TS 模块)；解决一个幂等就解决的问题不值这么大表面积。
- **(d) Shell-only flat file notebook** — `~/.teamagent/install-state.txt` key=value 格式让 shell 与 TS 都能读。**Reject**：仍引入 stateful 组件；shell 幂等本身已通过 V3，没必要。

## Consequences

- **Order 2 of issue #155 fix-chain 取消。** `docs/plans/issue-155/order-2-resume-state/plan.md` 顶部加 CANCELLED 注脚，文件保留作历史记录。
- **`packages/core/src/install-state/` 不创建。** 不新增 `@teamagent/core/install-state` subpath export。
- **6-order fix chain → 5-order fix chain。** INDEX.md 反映此变化；订单序号保留 (Order 1, Order 3-6) 以利跨文档引用，Order 2 标 CANCELLED。
- **V3 verification approach 不变。** CI Order 5 的 V3 测试 (Ctrl-C mid-install + rerun) observable behavior 一样，但验证的对象从 "notebook-driven resume" 改为 "idempotent resume"。
- **Future fragility 风险。** 如果未来加入非幂等步骤 (capacity reservation / 外部 token rotation 等)，V3 会破。届时再独立写新 ADR 引入针对性 resume notebook。
- **CONTEXT.md "resume notebook (续命小本本)" flagged ambiguity 标 resolved**，指向本 ADR。

## Relationship to other ADRs

- **ADR-0001 (two-stage install)**：互补。ADR-0001 决定 install 拓扑 (装什么 + 顺序)；ADR-0011 决定该拓扑下中断怎么处理。
- **ADR-0008 (HookShell)**：正交。HookShell 的 `bus.emit` / always-exit-0 模式与 install resumption 不交叉。

## Verification

- `docs/plans/issue-155/INDEX.md` 体现 5-order chain (Order 2 = CANCELLED)
- `docs/plans/issue-155/order-2-resume-state/plan.md` 顶部 CANCELLED 注脚就位
- `docs/CONTEXT.md` flagged ambiguity 提及 ADR-0011
- 实施 PR 不创建 `packages/core/src/install-state/` 路径
