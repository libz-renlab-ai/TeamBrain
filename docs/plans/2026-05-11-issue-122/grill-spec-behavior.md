```
   ┌──────────────────────────────────────────────┐
   │  ISSUE #122 grill spec  ·  part 2 / 3        │
   │  BEHAVIOR: SessionStart · statusline ·       │
   │            compat · viral spread             │
   │  (verbatim shard of                          │
   │   issuecomment-4418638323)                   │
   └──────────────────────────────────────────────┘
```

Continuation of [`grill-spec-protocol.md`](./grill-spec-protocol.md). Verbatim copy of the SessionStart / statusline / viral-spread sections of the grill. See parent [`grill-comment.md`](./grill-comment.md) and final shard [`grill-spec-acceptance.md`](./grill-spec-acceptance.md).

---

## SessionStart behavior

SessionStart is infrastructure for user-level viral spread / auto-init.

It should not be the primary human success UI.

SessionStart responsibilities:

```text
- user-level propagation
- project auto-init
- ensuring TeamAgent can prepare projects launched through Claude Code
- staying quiet unless truly needed
```

Human-facing SessionStart banner should not expose technical details.

Remove / hide from normal human display:

```text
.teamagent/knowledge.db
auto-init
~/.teamagent/auto-init.log
disable marker
touch ~/.teamagent/auto-init.disabled
hook channel details
project detection internals
```

For non-project directories:

```text
SessionStart should be silent.
```

No message like:

```text
Current directory does not look like a project...
```

Debug/status/log commands may expose the technical details, but normal Claude Code startup should not.

---

## Statusline behavior

The Claude Code statusline is the human-visible success signal for #122.

Statusline should show a TeamAgent line in Claude Code.

Expected format is the existing product format:

```text
TeamAgent | 规则:N | 帮过:X今/Y周 | 拦过:Z今 | <recent hint> | preparing
```

or:

```text
TeamAgent | 规则:N | 帮过:X今/Y周 | 拦过:Z今 | <recent hint> | ready
```

Do not change the existing `<recent hint>` logic as part of this issue.

For #122 primary TTHW, seeing the TeamAgent statusline with `preparing` is enough. Do not block on waiting for `ready`.

`ready` can be checked as a secondary follow-up by reopening Claude Code in the same project, but it is not the primary TTHW endpoint.

Primary success endpoint:

```text
Claude Code statusline shows a TeamAgent line within 300 seconds from opening the landing page.
```

---

## Existing statusline compatibility

If the tester already has a Claude Code statusline, TeamAgent must not destroy it.

Expected behavior:

```text
existing statusline remains visible
TeamAgent statusline is appended on a new line
```

This is a secondary compatibility check, not a blocker for selecting the primary tester.

Primary test can use a tester with no existing statusline.

Secondary check:

```text
If tester already has a Claude Code statusline:
- existing statusline still appears
- TeamAgent appears appended on a new line
- existing statusline behavior is preserved
```

---

## Viral spread clarification

There are two different flows.

### A. Landing-first flow

This is #122.

```text
landing page
→ setup command
→ install auto-runs init
→ terminal ready
→ tester opens their own real project with `claude`
→ SessionStart prepares project if needed
→ statusline shows TeamAgent
```

This is the primary dogfood path.

### B. Collaborator-first viral spread

This should be tested separately, not inside #122.

Concept:

```text
collaborator enters a TeamAgent-enabled project
→ project rules / CLAUDE.md guide TeamAgent setup
→ user-level TeamAgent Claude integration is installed
→ future Claude Code projects get TeamAgent automatically
```

Do not mix this into #122. It should get its own issue/test so failures are easier to diagnose.
