```
   ┌──────────────────────────────────────────────┐
   │  ISSUE #122 grill spec  ·  part 3 / 3        │
   │  ACCEPTANCE · archive list · impl summary    │
   │  (verbatim shard of                          │
   │   issuecomment-4418638323)                   │
   └──────────────────────────────────────────────┘
```

Final shard. Continuation of [`grill-spec-behavior.md`](./grill-spec-behavior.md); root index is [`grill-comment.md`](./grill-comment.md).

---

## New acceptance criteria for #122

Replace the old acceptance criteria with:

```text
- One real stranger tester completes the landing-first flow.
- Tester starts with Claude Code already installed/logged in.
- Tester uses their own real project folder.
- Tester does not use TeamBrain, a sample repo, or a demo repo.
- Tester starts without TeamAgent installed, or removes TeamAgent before starting.
- Tester opens landing page.
- Tester copies and runs the setup command.
- Setup installs TeamAgent if needed and automatically runs init.
- Terminal shows only minimal ready output:
    TeamAgent is ready for Claude Code.

    Next:
      cd your-project
      claude
- Tester runs `cd <their-real-project> && claude`.
- Claude Code statusline shows TeamAgent:
    TeamAgent | 规则:N | 帮过:X今/Y周 | 拦过:Z今 | <recent hint> | preparing
  or equivalent current implemented format.
- Total time from opening landing page to seeing TeamAgent statusline is ≤ 300 seconds.
- Per-step timing breakdown is recorded.
- Friction/confusion moments are recorded.
- Recording or notes are saved under the existing dogfood docs location.
- Results are posted back to the issue as a comment.
```

Secondary checks:

```text
- If tester already has a Claude Code statusline, it remains visible.
- TeamAgent statusline is appended on a new line.
- Existing statusline behavior is not destroyed.
- Reopening Claude Code in the same project may show `ready`; this is secondary and not required for primary TTHW.
```

---

## Explicit archive/remove list

Archive or remove from human-facing #122:

```text
- teamagent demo as human onboarding
- First PreToolUse intercept as TTHW endpoint
- hook explanation
- PreToolUse explanation
- intercept explanation
- double-moment.gif
- 3-screenshot mosaic fallback
- terminal demo visuals
- debug banners
- undo command from human path
- backup paths from success output
- modified file paths from success output
- knowledge.db / auto-init / log path / disable-marker wording from normal SessionStart output
```

Allowed only in debug/internal:

```text
teamagent debug demo
teamagent debug status
teamagent debug logs
hook-level details
auto-init logs
knowledge.db status
disable markers
```

---

## Implementation summary

Agents should implement directly without asking:

```text
1. Update #122 protocol from landing → install → demo
   to landing → setup → init → real project → Claude Code statusline.

2. Remove `teamagent demo` from human onboarding.
   Keep only as debug/internal if needed.

3. Remove GIF/mosaic prerequisites from #122 human dogfood.
   Archive assets or stop referencing them.

4. Landing page should be text-only:
   Get ready for Claude Code.
   TeamAgent helps Claude Code follow your team rules.
   Run one command. Then open your project and use Claude Code normally.

5. Setup command may still be install command, but install must auto-run init.

6. Init success output must be minimal:
   TeamAgent is ready for Claude Code.

   Next:
     cd your-project
     claude

7. Do not show backup, undo, modified files, hooks, PreToolUse, intercepts, demo, or debug details in the human path.

8. SessionStart should handle viral/auto-init infrastructure.
   It should be silent in non-project directories.
   It should not expose knowledge.db / auto-init / logs / disable markers in normal human display.

9. Statusline is the #122 human-visible success signal.
   It should show:
   TeamAgent | 规则:N | 帮过:X今/Y周 | 拦过:Z今 | <recent hint> | preparing
   or:
   TeamAgent | 规则:N | 帮过:X今/Y周 | 拦过:Z今 | <recent hint> | ready

10. Do not change recent hint logic in this issue.

11. If existing Claude Code statusline exists, preserve it and append TeamAgent on a new line.

12. Primary TTHW succeeds when tester sees TeamAgent statusline in Claude Code within 300 seconds.
```
