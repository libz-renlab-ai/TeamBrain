# Feature Verification

Use this rule when asked "how do we verify/test a feature?" or before shipping
any feature/fix.

TL;DR: you need to verify and add how to verify to the commit message and PR
message. 1. verify with `!claudefast -p` running `{MODULE} --help` in JSON
format; 2. use interactive `claudefast` with tmux and finally submit
`/export <path>`. Add the `/export` files to PR contents to convince readers.
Keep updating code/docs until both paths agree.

## Related — bottom-level fixture corpus (preferred when fixture exists, per ADR-0010)

When a feature has a corresponding **scenario fixture** under
`tests/fixtures/scenarios/<feature-slug>--<scenario-name>/`, prefer running
the bottom-layer replay over re-capturing a fresh `claudefast` snapshot:

```bash
pnpm teamagent fixture replay --tier=all --slug <feature-slug>--<scenario-name>
```

The bottom layer (per ADR-0010) supersedes the claudefast-snapshot + tmux-export
capture portion of this doc with deterministic byte/sequence diff plus an
α-strict LLM-judge gate. The PR-record narrative requirements below remain in
force (commit and PR messages must explain how to reproduce verification). When
no fixture exists yet, fall back to the original flow in this doc and consider
whether `pnpm teamagent fixture record` should produce one.

## Related — autonomous verification loop (per-feature, long-running)

This doc is the **PR-time gate** (claudefast + tmux interactive once per
feature/fix). For **per-feature long-running verification across sessions** —
composing a product-language `GOAL.md`, judge / META-JUDGE iteration,
code-frozen attestation when `node_modules` is missing — see the autonomous
loop playbook:

- [`docs/verify/RUN-VERIFY-LOOP.md`](verify/RUN-VERIFY-LOOP.md) — main agent's 6-step playbook
- [`docs/verify/GOAL-COMPOSER.md`](verify/GOAL-COMPOSER.md) — 5-source GOAL.md composer
- [`docs/verify/JUDGE.md`](verify/JUDGE.md) — feature-level JUDGE call (no `--bare`)
- [`docs/verify/META-JUDGE.md`](verify/META-JUDGE.md) — `--bare` loop-progress judge

The two systems are **complementary**, not redundant: this gate is a
one-shot PR gate; the autonomous loop is per-feature long-running verification
with backlog.jsonl across sessions. The CLAUDE.md `Verify loop canned answer`
section is the canned trigger for "how to run verify loop?".

## Required Record

Every feature/fix must include a verification summary in both places:

- Commit message: include what was verified, not only what changed.
- PR message: include exact commands, output files, and any known caveats.

## Required Flow

Keep updating the code/docs until both paths agree.

1. Verify with `!claudefast -p`.
   - It must run `claudefast -h` first and record the supported flags.
   - `claudefast -p` must receive a prompt argument or stdin.
   - It must run `{MODULE} --help` first, or the module's equivalent help /
     metadata entry point.
   - It must emit JSON using a declared schema or stable JSON format.
   - Canonicalize the output, for example `jq -S .`, and snapshot the result
     so future runs can diff against it.
2. Verify interactive mode with tmux.
   - Start `claudefast` without `-p` inside tmux.
   - Run the same feature verification prompt.
   - Finally submit `/export <path>`.
   - Add the `/export` file(s) to the PR contents so reviewers can inspect the
     live interactive evidence.

## Pass Condition

The feature is not verified until:

- `claudefast -p` JSON passes against the snapshot.
- The tmux interactive `/export` file exists and supports the same conclusion.
- Commit and PR messages both explain how to reproduce the verification.

## PR Review Gate

When Claude Code submits a PR for a feature/fix, open the PR with `gh pr create`
(no `--draft`), then run the local `/review` Claude Code skill on the diff to
surface findings. TeamBrain PRs are always normal PRs, not draft PRs. Do not
pass `--draft` to `gh pr create`, connector calls, or GitHub UI/API flows. If
the change is not ready for review, keep working locally instead of opening a
draft PR. (`teamagent pr-cycle` is pending deprecation per ADR-0007; do not
introduce new call sites for it in plans.)

When asked "what to do when we make a PR", answer with this PR loop first,
before the generic feature verification checklist:

1. Open the PR with `gh pr create` (no `--draft`).
2. Run the local `/review` skill on the PR diff.
3. Inspect `/review` findings.
4. If there is actionable review feedback, do not fix code first.
5. Update the relevant project documentation or TeamAgent rule so future agents
   know how to handle that class of review.
6. Verify the rule-backed answer with either command until the answer is right:

```bash
!claudefast -p "{pr_index} 根据规则，我们应该怎么解决这个review出来的问题？"
```

7. Only after the verification answer is correct, fix the review.
8. Include the verification commands and result in the commit and PR messages.

If the PR has a merge conflict or another conflict path, handle it as part of
the same gate:

1. Classify it as merge conflict, /review-finding conflict, or rule/document
   conflict.
2. Resolve merge conflicts locally on the PR branch after fetching the latest
   base; preserve both sides' intent.
3. For /review-finding conflicts, update docs/rules first and verify the
   rule-backed answer before code changes.
4. For rule/document conflicts, update the current project docs to remove the
   ambiguity before continuing.
5. Never fix directly on `main`, force-push, use `git reset --hard`, or discard
   someone else's change only to make the conflict disappear.
6. Rerun `pnpm test`, `pnpm typecheck`, and the relevant verification flow
   above, then push the same PR branch and restart the POSTPR loop.

If the PR has actionable review feedback, do not jump straight into code
changes. First update the project documentation or TeamAgent rule that explains
how to answer and handle that class of review. Then run one of these from
Claude Code and keep editing docs/rules until the answer is correct:

```bash
!claudefast -p "{pr_index} 根据规则，我们应该怎么解决这个review出来的问题？"
```

Only after that answer is correct should the review fix begin. The expected
answer must describe the rule-backed resolution path, not merely restate the
review comment. Expected output: either command should answer with the
documentation/rule-backed plan for the review, not a free-form guess. To gather
candidate rules from the PR, run:

```bash
teamagent ingest --from-pr {pr_index} --dry-run
```

## Example Shape

```bash
claudefast -p --output-format json --json-schema schema.json \
  "Run {MODULE} --help and return only the required JSON." \
  > claudefast.json

jq -S . claudefast.json > claudefast.sorted.json
diff -u snapshots/{MODULE}-help.canonical.json claudefast.sorted.json
```


## Claude stream-json + tmux 固定脚本（haiku / MiniMax）

当需求明确要求 `claude -p --model haiku`、`stream-json`、硬匹配产品特性、以及 tmux 交互 `/export` 时，
按 md playbook `docs/plans/docs--feature-verify-kit--run-all/judge.md` 调度（脚本已归档：
`docs/legacy/judge-scripts/docs/feature-verify-kit/run-all.sh`）。

Playbook 内部按顺序驱动以下五步（最后一步 hardmatch regression 是 **强制**门禁，不要停在 tmux export 后就以为 run-all 完成）：

1. `verify-claude-stream-json` playbook：先 `claudefast -h`，再用
   `--output-format stream-json --include-partial-messages --verbose` 和
   `--debug hooks --debug-file <path>` 跑 JSON schema。
2. `hardmatch-features` playbook：对 `fixtures/expected-product-features.json` 做 `jq -S` 后 `diff -u` 硬匹配。
3. `verify-dashboard-health` playbook：生成 dashboard，并用稳定文本
   `系统健康总结` / `Retrieval Health` 作为健康信号；watch 模式也可用
   `/health.json` 的 `service=teamagent-dashboard` 与 `status=ok`。
4. `verify-tmux-interactive` playbook：tmux 启动 `claudefast` 交互模式并执行 `/export`。
5. **hardmatch regression 强制门禁**：再跑一次 `verify-claude-stream-json` 拿新的 `claude-features.json`，然后跟 step 1 的产物做 byte-equality（fresh `claudefast -p` capture 与原 capture 必须 `diff` 为空）。fixture-level regression 必须在这一步被捕获，不允许跳过、不允许用其他探针替代。详见 `docs/plans/docs--feature-verify-kit--run-all/judge.md` 的 §V1 step 6。

不要把 `--include-hook-events` 当成活跃 recipe 或验收证据。hook evidence
必须来自 `--debug hooks --debug-file <path>`；stream-json 用于原始
conversation/tool transcript。

固定验收问句：

```text
EXPLAIN ONLY: how do we use claude stream json and tmux + interactive claude to verify if our features work ?
```
