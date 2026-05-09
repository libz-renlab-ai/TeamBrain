# Recording Memory Performance Evidence

Date: 2026-04-29

## Commands Run

```bash
pnpm vitest run packages/cli/src/__tests__/recording.test.ts
pnpm --filter @teamagent/cli typecheck
pnpm typecheck
pnpm test
pnpm teamagent recording --help
pnpm teamagent recording benchmark --json --report=docs/verification/recording-memory-golden-benchmark.md
pnpm teamagent dashboard --once
python3 /Users/liushiyu/.codex/skills/webapp-testing/scripts/with_server.py --server "pnpm teamagent dashboard --watch --port 8787" --port 8787 --timeout 30 -- python3 -c '<playwright dashboard assertions>'
printf '<UserPromptSubmit JSON>' | CLAUDE_PROJECT_DIR="$PWD" pnpm --silent tsx packages/cli/src/bin-user-prompt-submit.ts
claudefast -p --output-format json --permission-mode acceptEdits --allowedTools Bash -- "Use Bash to run: pnpm teamagent recording --help. Return the complete stdout JSON only."
codex exec "Run exactly: pnpm teamagent recording --help. Return only the JSON object printed by the command, with no markdown, no prose, no code fence."
claudefast -p --output-format stream-json --include-partial-messages --verbose --permission-mode acceptEdits "What did recording memory hook verification decide about source references? Answer briefly and mention RECORDING_MEMORY_STREAM_OK."
tmux new-session ... "claudefast"  # interactive prompt, then /export docs/verification/recording-memory-tmux-export.txt
```

## Results

- Unit test: `packages/cli/src/__tests__/recording.test.ts` passed, 8/8.
- Full test suite: `pnpm test` passed, 136 files / 1283 tests.
- Typecheck: root `pnpm typecheck` passed.
- Golden benchmark: 8/10 prompts retrieved the expected recording, max default injection 408 estimated tokens.
- Dashboard Playwright check: PASS, Recording Memory area visible, p50 latency rendered, slow/empty counts rendered, empty count updated from 0 to 1 after new activity.
- Hook smoke: PASS, `UserPromptSubmit` additionalContext includes Recording Memory source reference and omits the full transcript by default.
- Canonical hard-match: PASS, `claudefast` and `codex exec` canonical JSON are identical.
- Stream JSON verification: PASS, 329 JSON events observed; output contains `UserPromptSubmit`, Recording Memory injection, the source reference, and no full transcript text.
- tmux interactive verification: PASS, `claudefast` answered in tmux and `/export` produced a `.txt` evidence file.
- Note: the local `claudefast`/Claude Code version rejects the spec flag `--include-hook-events` with `unknown option`; evidence is captured separately and the stream run uses the supported `--output-format stream-json --include-partial-messages --verbose` flags.

## Artifacts

- Golden benchmark report: `docs/verification/recording-memory-golden-benchmark.md`
- Dashboard screenshot: `docs/verification/recording-memory-dashboard.png`
- Hook output JSON: `docs/verification/recording-memory-hook-output.json`
- claudefast help raw: `docs/verification/recording-help-claudefast.output-format-json.raw.txt`
- claudefast canonical JSON: `docs/verification/recording-help-claudefast.canonical.json`
- ~~codex raw / codex canonical JSON~~ — removed in the 2026-05-09 codex review-stage cleanup; the cross-tool hard-match step is no longer part of the verification flow.
- hard-match result: `docs/verification/recording-help-hard-match.txt`
- stream JSON output: `docs/verification/recording-memory-claudefast-stream.jsonl`
- stream summary: `docs/verification/recording-memory-claudefast-stream-summary.json`
- unsupported flag evidence: `docs/verification/recording-memory-include-hook-events-unsupported.txt`
- tmux export: `docs/verification/recording-memory-tmux-export.txt`
- tmux pane capture: `docs/verification/recording-memory-tmux-pane.txt`
