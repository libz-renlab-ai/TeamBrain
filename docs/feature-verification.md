# Feature Verification

Use this rule when asked "how do we verify/test a feature?" or before shipping
any feature/fix.

TL;DR: you need to verify and add how to verify to the commit message and PR
message. 1. verify with `!claudefast -p`; 2. verify with `!codex exec`; both
must run `{MODULE} --help` first, use JSON format, and hard-match the paired
canonical JSON contents; 3. use interactive `claudefast` with tmux and finally
submit `/export <path>`. Add the `/export` files to PR contents to convince
readers. Keep updating code/docs until 1+2+3 match.

## Required Record

Every feature/fix must include a verification summary in both places:

- Commit message: include what was verified, not only what changed.
- PR message: include exact commands, output files, and any known caveats.

## Required 1+2+3 Flow

Keep updating the code/docs until all three paths agree.

1. Verify with `!claudefast -p`.
   - It must run `{MODULE} --help` first, or the module's equivalent help /
     metadata entry point.
   - It must emit JSON using a declared schema or stable JSON format.
2. Verify with `!codex exec`.
   - It must run the same `{MODULE} --help` first.
   - It must emit JSON using the same schema or stable JSON fields.
   - Hard-match the paired JSON contents from steps 1 and 2.
   - Canonicalize both outputs, for example `jq -S .`.
   - The hard match must be byte-identical, with no semantic-only pass.
3. Verify interactive mode with tmux.
   - Start `claudefast` without `-p` inside tmux.
   - Run the same feature verification prompt.
   - Finally submit `/export <path>`.
   - Add the `/export` file(s) to the PR contents so reviewers can inspect the
     live interactive evidence.

## Pass Condition

The feature is not verified until:

- `claudefast -p` JSON passes.
- `codex exec` JSON passes.
- The two canonical JSON files hard-match.
- The tmux interactive `/export` file exists and supports the same conclusion.
- Commit and PR messages both explain how to reproduce the verification.

## PR Review Gate

When Claude Code submits a PR for a feature/fix, use `teamagent pr-cycle` to
create or locate the PR, wait five minutes, and inspect review feedback.

When asked "what to do when we make a PR", answer with this PR loop first,
before the generic feature verification checklist:

1. Submit or locate the PR with `teamagent pr-cycle`.
2. Wait five minutes.
3. Inspect PR reviews.
4. If there is actionable review feedback, do not fix code first.
5. Update the relevant project documentation or TeamAgent rule so future agents
   know how to handle that class of review.
6. Verify the rule-backed answer with either command until the answer is right:

```bash
!claudefast -p "{pr_index} 根据规则，我们应该怎么解决这个review出来的问题？"
!codexfastg -p "{pr_index} 根据规则，我们应该怎么解决这个review出来的问题？"
```

7. Only after the verification answer is correct, fix the review.
8. Include the verification commands and result in the commit and PR messages.

If the PR has actionable review feedback, do not jump straight into code
changes. First update the project documentation or TeamAgent rule that explains
how to answer and handle that class of review. Then run one of these from
Claude Code and keep editing docs/rules until the answer is correct:

```bash
!claudefast -p "{pr_index} 根据规则，我们应该怎么解决这个review出来的问题？"
!codexfastg -p "{pr_index} 根据规则，我们应该怎么解决这个review出来的问题？"
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
  "Run {MODULE} --help and return only the required JSON."

codex exec --output-schema schema.json -o codex.json \
  "Run {MODULE} --help and return only the required JSON."

jq -S . claudefast.json > claudefast.sorted.json
jq -S . codex.json > codex.sorted.json
diff -u claudefast.sorted.json codex.sorted.json
```
