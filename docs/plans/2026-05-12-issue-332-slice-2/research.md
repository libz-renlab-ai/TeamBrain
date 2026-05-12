```text
   slice 2a 实施前必须记得的硬事实树
   ─────────────────────────────────
   @teamagent/adapters/src/m5/testing/
   ├── dual-home-setup.ts   ← slice 1, setupDualHomes()
   ├── bare-git-bridge.ts   ← slice 1, setupBareGitBridge()
   ├── fs-copy-bridge.ts    ← slice 1, createFsCopyBridge()
   ├── index.ts             ← 加一行 re-export ←── slice 2a
   └── mock-llm-responder.ts ◄── 本 slice 新增

   @teamagent/types/src/m5.ts
   ├── TeamRuleFile         ← 责任 shape
   ├── TeamRuleAlive
   └── TeamRuleTombstone

   packages/adapters/src/m5/__tests__/
   ├── fs-copy-bridge.test.ts   ← 测试模板抄这个
   ├── dual-home-setup.test.ts
   ├── mock-llm-responder.test.ts  ◄── 新增
   └── l4-fs-copy-pipeline.test.ts ◄── 新增
```

# Research — issue #332 slice 2a 硬事实

## 关键文件路径

| 路径 | 内容 | 用途 |
|---|---|---|
| `packages/adapters/src/m5/testing/dual-home-setup.ts` | slice 1 utility，返回 `DualHomeContext { homeA, homeB, projectA, projectB, cleanup }` | integration test 起步 |
| `packages/adapters/src/m5/testing/fs-copy-bridge.ts` | slice 1 utility，`createFsCopyBridge().copyTeamRules(from, to) → Promise<number>` | A → B transit |
| `packages/adapters/src/m5/testing/index.ts` | slice 1 barrel export，目前 3 行 | slice 2a 加 1 行 re-export |
| `packages/adapters/src/m5/fs-team-rule-store.ts` | `FsTeamRuleStore` 实现 `TeamRuleStorePort`，路径约定 `.teamagent/team/<author>/<rule_id>.json` | mock responder 扫描参考 |
| `packages/types/src/m5.ts` | `TeamRuleFile` / `TeamRuleAlive` / `TeamRuleTombstone` shape | mock responder 类型源 |
| `packages/adapters/src/m5/__tests__/fs-copy-bridge.test.ts` | 现有 vitest pattern: `beforeEach` mkdtemp / `afterEach` cleanup / `writeJson` helper | mock-responder test 复用 helper 形态 |
| `fixtures/scenarios/` (repo 根) | TypeScript scenario 文件（6 个，非目录） | slice 2a **不动**；slice 2b 才扩 |
| `packages/cli/src/commands/fixture-replay.ts` | `--tier=a` 一路；用 `runVerify` + `ruleBasedCorrectionDetector` + `llmBasedKnowledgeExtractor` | slice 2a **不动**；slice 2b 扩展或开 sibling |
| `docs/adr/0014/332.md` | grill record + 9 项 crystallized decisions | 唯一 spec source |
| `docs/PRE-IMPLEMENT-CLAIM.md` | 跨主机 mutex 合约（PR #347 落地） | slice 2a 已按 §1 order 完成 claim comment + label swap |

## `TeamRuleFile` shape（来自 `packages/types/src/m5.ts:73-99`）

```ts
interface TeamRuleFile {
  rule_id: string;
  author: string;                  // lineage：首次创建者，改写时不变
  current: TeamRuleAlive | TeamRuleTombstone;
}

interface TeamRuleAlive {
  deleted: false;
  content: string;                 // mock responder 把这个当 keyword
  confidence: number;              // 0..1
  modified_by: string;             // 可能 != author
  modified_ts: string;             // ISO 8601
  scope: "team";
}

interface TeamRuleTombstone {
  deleted: true;
  deleted_by: string;
  deleted_ts: string;
  reason?: string;
}
```

落盘路径：`<projectRoot>/.teamagent/team/<claim_author>/<rule_id>.json`，每文件一条 rule。

## slice 1 utility API surface（精确签名，免去后续 `Read` 再确认）

```ts
// dual-home-setup.ts
export interface DualHomeContext {
  homeA: string;
  homeB: string;
  projectA: string;
  projectB: string;
  cleanup: () => Promise<void>;
}
export function setupDualHomes(opts?: { prefix?: string }): Promise<DualHomeContext>;

// fs-copy-bridge.ts
export interface FsCopyBridge {
  copyTeamRules(fromProjectRoot: string, toProjectRoot: string): Promise<number>;
}
export function createFsCopyBridge(): FsCopyBridge;
```

`copyTeamRules` 行为契约（来自 `fs-copy-bridge.ts:21-104`）：
- 找不到 `<from>/.teamagent/team/` → 返回 0，**非错**
- 只 copy `<author>/*.json` 的 top-level JSON 文件；非 JSON 与 nested subdirectory 跳过
- 写法：`<final>.tmp.<pid>.<ts>.<i>` 再 `rename`，与 `FsTeamRuleStore.writeRule` atomic 一致
- 幂等：同名覆盖（LWW）

## ADR-0014/332.md 与本 slice 直接相关的决策

- **决策 #3 双轨 transit**：fs copy 快道 + bare git 慢道 → slice 2a 只走 fs copy 快道
- **决策 #4 Rule fixture 三种全套**：avoidance + practice + learning → slice 2a 只做 avoidance（理由：binary observable 最易在 hermetic 测试证明）
- **决策 #5 双 verdict**：mock LLM (PR-gate) + 真 claudefast (nightly) → slice 2a 只做 mock LLM，slice 3 做 nightly
- **决策 #9 hold scope**：原 grill 决定不拆 → 本 slice 拆解走 `docs/PR-PLAN.md` post-PR style 路径（claim comment 已明示）
- **Open question #1 fixture replay 扩展 vs sibling**：slice 2a **不触碰**，让 slice 2b/3 拍板
- **Open question #2 mock responder 包**：slice 2a 选 `@teamagent/adapters`（避免新建 package 引起 build graph 调整）
- **Open question #4 mock LLM 签名复杂度**：slice 2a 选 keyword-substring（最小可证明 rule-ON vs rule-OFF binary 不同）

## 已有 vitest convention（从 `fs-copy-bridge.test.ts` 抄）

- `import { afterEach, beforeEach, describe, expect, it } from "vitest";`
- 每个测试 `beforeEach` 用 `fs.mkdtemp(path.join(os.tmpdir(), "<prefix>-"))` 建 tmpdir
- `afterEach` 用 `fs.rm(tmpdir, { recursive: true, force: true })` 清
- helper `exists(p)` 用 `fs.stat` + try/catch
- helper `writeJson(projectRoot, author, ruleId, payload)` 直接 `fs.writeFile(JSON.stringify(payload), "utf8")`

## Windows / 跨平台注意点

- `path.join` 必须，不裸 `${a}/${b}`
- 所有 fs 读用 `fs.promises`（异步），不阻塞 event loop
- 不需要 CRLF 处理（fs-copy 是 byte-for-byte，不像 git）
- `os.tmpdir()` 在 Windows 是 `C:\Users\<u>\AppData\Local\Temp`，已被 slice 1 utilities 验证 OK

## CI / vitest config 既有约束（CLAUDE.md "已知限制 / workaround"）

- `vitest.config.ts` 强制 `fileParallelism: false`（Windows OOM workaround）→ 测试顺序跑，slice 2a 不依赖并发
- CLI E2E subprocess 测试 M0 暂未启用 → slice 2a 不写 subprocess test，全用 in-process vitest

## 已确认 / 不再 reread 的事实

- 当前 worktree HEAD = `50d21ac7`（origin/main fresh，含 #347 + #356）
- 当前 branch = `worktree-issue-332-slice-2`（默认 EnterWorktree 命名）；PR 时 rename branch 为 `feat/issue-332-slice-2`
- claim comment 已发：[#issuecomment-4428233058](https://github.com/libz-renlab-ai/TeamBrain/issues/332#issuecomment-4428233058)
- 当前 #332 labels = `["grill-working"]`（`grill-ready` 已移除）
- 没有其它 host 持锁（`grill-working` 是本 session 新加的）

## 引用 / 外部资料

- ADR-0014 父：[`docs/adr/0014-save-grilled-comments-to-adr.md`](../../adr/0014-save-grilled-comments-to-adr.md)
- ADR-0014 sibling for #332：[`docs/adr/0014/332.md`](../../adr/0014/332.md)
- FIXEDFLOW：[`docs/FIXEDFLOW.md`](../../FIXEDFLOW.md)
- Cross-host mutex：[`docs/PRE-IMPLEMENT-CLAIM.md`](../../PRE-IMPLEMENT-CLAIM.md)
- Plan rule：[`docs/PLAN-RESEARCH-REPORT.md`](../../PLAN-RESEARCH-REPORT.md)
- E2E learning canon：[`docs/verify/E2E-LEARNING.md`](../../verify/E2E-LEARNING.md)
- Slice 1 PR：[#356](https://github.com/libz-renlab-ai/TeamBrain/pull/356)
- Cross-host mutex PR：[#347](https://github.com/libz-renlab-ai/TeamBrain/pull/347)
