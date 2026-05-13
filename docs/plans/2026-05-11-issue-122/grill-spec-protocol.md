```
   ┌──────────────────────────────────────────────┐
   │  ISSUE #122 grill spec  ·  part 1 / 3        │
   │  PROTOCOL: tester / landing / install / demo │
   │  (verbatim shard of                          │
   │   issuecomment-4418638323)                   │
   └──────────────────────────────────────────────┘
```

Continuation of [`grill-comment.md`](./grill-comment.md). Verbatim copy of the "Detailed implementation version for agents" section, sliced for the 200-line `.md` ceiling. See sibling shards [`grill-spec-behavior.md`](./grill-spec-behavior.md) and [`grill-spec-acceptance.md`](./grill-spec-acceptance.md).

---

## Detailed implementation version for agents

This comment replaces the old #122 dogfood definition.

Do not implement the old flow:

```text
landing → install → teamagent demo → visible PreToolUse intercept
```

Do not use the old visual prerequisites:

```text
double-moment.gif
3-screenshot mosaic
demo screenshots
hook/intercept visuals
```

Those should be archived / removed from human-facing #122 requirements.

The new #122 scope is:

```text
landing → setup command → install redirects into init → terminal ready
→ tester opens their own real project in Claude Code
→ TeamAgent statusline appears
→ total time ≤ 300 seconds
```

---

## Final #122 protocol

### Tester prerequisites

The tester must have:

```text
- Claude Code already installed
- Claude Code already logged in / usable
- `claude` command works
- A real existing project folder they personally use
- TeamAgent not installed, or removed before test
```

Do not use:

```text
- TeamBrain repo
- prepared demo repo
- sample repo
- empty fake repo
- `teamagent demo`
```

#122 is not testing Claude Code installation or login. It is testing TeamAgent onboarding into an already working Claude Code environment.

---

## Landing page requirements

Landing page should be text-only for now.

Do not include visual assets yet. Visual design will be handled later with Claude Design.

Required hero copy:

```text
Get ready for Claude Code.

TeamAgent helps Claude Code follow your team rules.

Run one command. Then open your project and use Claude Code normally.
```

The CTA can still run an install command, but the user-facing promise is setup/readiness, not "install a CLI".

Do not mention:

```text
demo
debug
hooks
PreToolUse
intercept
knowledge.db
backup
undo
settings path
Claude Code internals
```

---

## Install/init behavior

The landing setup command should install TeamAgent if needed, then automatically continue into `teamagent init`.

Expected behavior:

```text
install.sh
→ installs TeamAgent if missing
→ automatically runs teamagent init
→ teamagent init configures Claude Code integration
→ final terminal output is minimal
```

Terminal success output should be:

```text
TeamAgent is ready for Claude Code.

Next:
  cd your-project
  claude
```

Do not show:

```text
Run teamagent init
Run teamagent demo
Hooks installed
PreToolUse enabled
Undo available
Modified ~/.claude/...
Backup saved at ...
```

`teamagent init` should write what it needs to write. Do not stop human onboarding for normal config conflicts.

If backup or undo functionality exists, do not show it in the human path. If `teamagent undo` exists, archive it or move it to debug/internal. It should not appear in landing, normal help, init success output, or human docs.

---

## Demo/debug behavior

`teamagent demo` is not part of human onboarding.

If the demo command remains, move it under debug/internal:

```text
teamagent debug demo
```

It should not appear in:

```text
- landing page
- normal `teamagent --help`
- init success output
- human onboarding docs
- #122 primary protocol
```

Hooks / PreToolUse / intercept behavior can remain available for agents/debug, but must not be explained to human dogfood testers.
