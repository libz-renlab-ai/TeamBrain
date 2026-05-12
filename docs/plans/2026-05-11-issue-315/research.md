# Research — issue #315 embedder RAM bomb

## Symptom

> 多个对话框会导致出现多个 node，会卡死计算机
>
> — liboze, 2026-05-11

User-visible: opening 5+ Claude Code dialogs makes the machine unresponsive.

## Code archaeology

### Hook → embedder fan-out (current state of `main` @ 5f2f17b)

| Hook channel | bin file | Embedder construction |
|---|---|---|
| PreToolUse | `packages/cli/src/bin-pre-tool-use.ts:41,58-61` | `DaemonFirstEmbedder` singleton |
| Stop | `packages/cli/src/bin-stop.ts:56,130` | `DaemonFirstEmbedder` singleton |
| SessionStart | `packages/cli/src/bin-session-start.ts:64,123` | spawns `bin-embedder.cjs` daemon; never constructs in-process |
| **UserPromptSubmit** | `packages/cli/src/bin-user-prompt-submit.ts:182` | **calls `retrieveRulesForPrompt()` WITHOUT `embedder` arg → `user-prompt-rule-retriever.ts:179` defaults to `?? new XenovaRuleEmbedder()` → 650MB in-process per prompt** |

### Daemon fallback amplifier

`packages/cli/src/daemon-first-embedder.ts:79-83`:

```ts
if (!this.fallback) {
  this.fallback = new XenovaRuleEmbedder({ modelId: this.modelId });
}
return this.fallback.embed(texts);
```

Even hooks that go through `DaemonFirstEmbedder` (PreToolUse, Stop) load
the 650MB model in-process whenever the daemon is unreachable —
which is the entire 3-4s cold-load window after the first SessionStart,
plus any longer outage (Windows AV scan, onnxruntime-node missing,
daemon crash).

### Spawn race (Race α)

`packages/cli/src/daemon-first-embedder.ts:93-112`: multiple
`tryDetachedSpawn` callers running before any state file exists will
all spawn detached `bin-embedder.cjs` children. Each child loads
650MB before the losers exit gracefully — transient N×650MB spike.

### Daemon TOCTOU (Race β)

`packages/cli/src/bin-embedder.ts:73-93`: code comment itself admits:

> Race: between read and write, two simultaneous spawns can both pass this
> check. The TCP `listen()` step then becomes the tiebreaker — the loser
> gets EADDRINUSE if --port is fixed; with port 0 both succeed but one of
> the two state-file writes wins. The cost is one extra ephemeral daemon
> for ~3s; idle-exit reaps it.

## Historical regression — PR #227 / issue #164 did NOT fully fix this

| Commit | Title | Touched UserPromptSubmit? |
|---|---|---|
| `168190a` | feat(issue-164): default-install vector deps + long-running embedder daemon (#227) | **No** — `git show 168190a --stat \| grep user-prompt` is empty |

PR #227's plan (docs/plans/2026-05-09-issue-164/plan.md L67-73) listed
B1–B4 hook wires explicitly: PreToolUse, Stop, SessionStart, SessionEnd.
**UserPromptSubmit was never on the list** — neither "do" nor "do not".
That gap is the entire chain of evidence for #315.

The fallback design ("fall back to in-process embedder + async daemon
respawn on failure", plan L48-50) was a deliberate choice at #164 time
— but multi-session usage in practice exposes it as a RAM amplifier.

## SqliteSemanticRetriever already supports BM25-only degrade

`packages/adapters/src/retriever/sqlite-semantic-retriever.ts:57-79,
82-102, 104-124` — three retrieval stages (BM25, dense-trigger,
dense-pattern) each wrapped in its own `try { … } catch { … }`. If
embed() returns empty vectors, the two vec0 `WHERE vec MATCH ?` queries
error on a 0-byte buffer, both catches fire, the result is BM25 RRF
only. **BM25-only is not a new code path — it's the existing graceful
degrade.**

## Conclusion

#315 = two missed corners from #164 + one race condition #164 explicitly
deferred:

1. **A1** wire UserPromptSubmit to DaemonFirstEmbedder.
2. **A2** delete DaemonFirstEmbedder's in-process fallback; return
   empty vectors so retriever degrades to BM25-only naturally.
3. **A3** add fs.openSync(wx) atomic locks at `tryDetachedSpawn`
   (Race α) and inside `bin-embedder` startup (Race β) so concurrent
   SessionStarts cannot spawn N daemon children that each load the
   model.

Together these eliminate every per-dialog hot path that touches
`new XenovaRuleEmbedder`. The class itself remains for CLI write-side
commands (analyze, pitfall, warmup, migrate-v6/v7) which are not on
the per-dialog hot path.
