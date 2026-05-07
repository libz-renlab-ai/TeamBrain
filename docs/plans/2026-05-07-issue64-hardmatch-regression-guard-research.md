```text
                ┌──────────────────────────────────────────────┐
                │  issue #64 — hardmatch-features.sh           │
                │  调研：当前回归状态与 fixture 配套关系       │
                └──────────────────────────────────────────────┘

   commit timeline (oldest → newest)
   ──────────────────────────────────────────
   7316945  Apr 29  create script; full diff
                       │
                       ▼
   39e81ea  May  3  ⚠ "key based" downgrade
                       │   diff -> jq -S 'keys' only
                       ▼
   9c78f99  May  4  ✓ codex restore (PR #58)
                       │   diff -u sorted full JSON
                       │   + non-blank gsub("\\s+";"") | length>0
                       ▼
   HEAD     today    no further changes
                     ↑
                     │
                     codex review on PR #62 (CLOSED 2026-05-03,
                     never merged) referenced 39e81ea;
                     reviewer was looking at stale state.

   fixture/canonical pairing
   ──────────────────────────────────────────
   docs/系统展示.md  ## Canonical Feature TL;DR
                       │ verbatim copy
                       ▼
   fixtures/expected-product-features.json  (7 keys, 7 strings)
                       │
                       │  prompt 要 LLM byte-for-byte 复述 7 句
                       ▼
   verify-claude-stream-json.sh →
       runs/claude-features.json
                       │
                       ▼
   hardmatch-features.sh (full diff sorted JSON)
```

# Research — issue #64 hardmatch regression guard

## 时间线还原

| commit | 日期 | hardmatch 状态 | 来源 |
|--------|------|----------------|------|
| `7316945` | 2026-04-29 | 创建脚本，full diff | PR #31 |
| `39e81ea` | 2026-05-03 | ⚠ 退化为 keys-only + `length > 0` | 直接 push（无 PR 关联，被列为 pre-existing intentional） |
| `9c78f99` | 2026-05-04 | ✓ 恢复 full diff，并把 `length > 0` 升级为 `gsub("\\s+"; "") | length > 0` | PR #58「[codex] harden dogfood feature verification」 |
| `HEAD` (`66bdb6b`) | 2026-05-07 | 与 9c78f99 一致 | — |

## issue #64 的实际状态

issue #64 的 body 引用 codex 在 **PR #62 上的 review** 评论。事实核对：

- PR #62「docs: dogfood 5 core features + add docs/features/ tree」**CLOSED 2026-05-03**，从未 merge。
- PR #58 的 fix（`9c78f99`）merged 2026-05-04，**晚于** PR #62 关闭一天。
- 也就是说 codex 在 PR #62 的 review 看到的是 `39e81ea` 时刻的 main，并未把 PR #58 的 fix 算进去；而 PR #62 关闭 + PR #58 合并之后，main 上的 hardmatch 脚本已经是 codex 想要的「full canonical JSON equality + non-blank check」。
- issue body 提到的「Pre-existing intentional commit」也已被 PR #58 改回，不再是 main 的活动状态。

**结论**：issue #64 的核心担心（keys-only 让物质上错误的 evidence 通过）在 main 上已经没有实例。**缺的不是修复，是 regression guard**——一个反退化的 negative test 让未来再次试图把 `diff -u` 改回 `jq -S 'keys'` 的尝试自动 fail。

## 证据 1：当前脚本就是 full canonical equality

`docs/feature-verify-kit/hardmatch-features.sh` 当前内容（HEAD）：

```bash
jq -S . "$A" > "$OUT_DIR/claude-features.sorted.json"
jq -S . "$B" > "$OUT_DIR/expected-features.sorted.json"
jq -e 'to_entries | all(.value | type == "string" and (gsub("\\s+"; "") | length > 0))' "$A" >/dev/null
diff -u "$OUT_DIR/expected-features.sorted.json" "$OUT_DIR/claude-features.sorted.json"
echo "PASS: feature JSON hard-match + non-blank values"
```

第 13 行的 `diff -u` 跑在**完整 sorted JSON 文件**（line 8、9 由 `jq -S .` 生成），不是 keys 集合。任何 value 漂移都会 produce non-zero diff，触发 `set -euo pipefail` 让脚本 exit non-zero。

## 证据 2：fixture 与 canonical 源 byte-equal

`fixtures/expected-product-features.json` 的 7 个 value 与 `docs/系统展示.md` 的 `## Canonical Feature TL;DR` 段每一行 byte-for-byte 一致（比对方法：`jq -r '.[] | "\(.key): \(.value)"'` 与 `sed -n '40,55p'` 输出全等）。

prompt（`verify-claude-stream-json.sh` line 8）也明确要求 LLM **verbatim copy**：

> Return ONLY a JSON object whose 7 keys are exactly those names and whose values are the EXACT verbatim sentences from that section, copied byte-for-byte (same punctuation, same quotes, same digits).

所以 commit `39e81ea` 的 message 里的「variable evidence content (timestamps, paths)」**不存在**——这套 fixture 的内容是稳定的中文 canonical 句子，没有时间戳与路径。full diff 完全可行，key-only 只是过弱。

## 证据 3：缺 negative regression test

repo 内搜索 `hardmatch` / `hard.match` / `expected-product-features`：

| 引用类型 | 文件 | 作用 |
|----------|------|------|
| 脚本 | `docs/feature-verify-kit/hardmatch-features.sh` | 主脚本（正向） |
| 脚本 | `docs/feature-verify-kit/run-all.sh` | 串联调用 |
| README | `docs/feature-verify-kit/README.md` | 说明 + canonical key 列表 |
| 验收文档 | `docs/feature-verification.md` | 1+2+3 流程 |
| Test | （无） | **没有 negative regression test** |

`packages/cli/src/__tests__/recording.test.ts` 提到 `expected-product-features` 是无关上下文（recording 测试用），不是 hardmatch 的回归保护。

## 证据 4：runs/ 目录由 .gitignore ignore

`.gitignore`：
```
docs/feature-verify-kit/runs/
```

意味着 `claude-features.json` 是 per-run 生成、不入 git。negative test 不能依赖一个 checked-in claude-features 文件，必须自己造一份样本——既造一份 byte-equal pass，又造一份 mutated value 触发 fail。

## 选择哪条 issue body 列的 resolution option

issue body 给三个选项：

| Option | 评估 | 选择 |
|--------|------|------|
| 1. Restore full diff + 接受 stability cost | **已经在 main 实现**（9c78f99） | ✓ |
| 2. Schema/type validation 中间路线 | full canonical equality 已经 strict，schema 是冗余 | ✗ |
| 3. Document key-only 故意 + 加 separate value gate | 这等于把已经修掉的 bug 合理化 | ✗ |

**采用方案 1 + 加 regression guard**。Option 2 的 schema 路线只在 fixture 内容真的 variable 时才必要；当前 canonical TL;DR 是 stable byte 文本，schema 反而引入伪灵活性。

## 风险与边界

- **fixture 改文案会让 hardmatch fail，并连带让 negative test 的 baseline 漂移**。README 已规定「canonical TL;DR 改动必须同 commit 更新 fixture」；regression test 要把这两份当成 single source 联动检查（diff fixture vs canonical TL;DR 段），任何一边单边漂移都 fail。
- **`set -euo pipefail` 让 `jq -e` / `diff -u` 的 non-zero exit 立刻终止**。negative test 不能直接 `bash hardmatch-features.sh`，必须用 subshell + `set +e` + 检 `$?`。
- **不能动 fixture / canonical / verify-claude-stream-json.sh**——它们是被 hardmatch 保护的对象，改它们会破坏 PRESHIP / RULE-VERIFY / `bash docs/feature-verify-kit/run-all.sh` 链。
- **worktree 位置违反 CLAUDE.md 规则**：当前 worktree 在 `.claude/worktrees/issue64/`，规则要求 `.codex/worktrees/`。这是 pre-existing 状态，留给用户裁决是否搬移。
