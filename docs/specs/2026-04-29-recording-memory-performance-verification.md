# Recording Memory Performance Verification

Date: 2026-04-29
Status: Approved
Scope: Recording Memory monitoring and performance boost validation

## Task

Add a performance monitoring and improvement loop for Recording Memory.

Recording Memory should help TeamAgent turn existing meeting transcripts, summaries, and source file references into agent-loadable memory. The new work is not to prove that the feature exists. The work is to prove that it is fast, useful, and not wasteful with context.

The task is:

1. Track whether Recording Memory import, search, and prompt injection are fast enough for normal Claude Code use.
2. Track whether related prompts retrieve the right recording memory.
3. Track whether injected context stays small by default.
4. Surface slow, empty, failed, or overly large retrievals in a visible dashboard or report.
5. Use the collected evidence to guide performance improvements.

Success means a user can ask about a topic covered by prior recordings and TeamAgent can find the relevant memory quickly, cite the source, and avoid dumping full transcripts into context unless explicitly requested.

This spec intentionally excludes implementation details. It defines what must be true and how to verify it, not how to build it.

## How To Verify

Do not use `SelfVerify` as acceptance evidence for this work.

Use third-party or externally observable verification instead:

1. Run normal project checks:

   ```bash
   pnpm test
   pnpm typecheck
   ```

2. Verify real Claude Code hook behavior with stream JSON:

   ```bash
   claudefast -h > docs/verification/recording-memory-claudefast-help.md
   claudefast -p \
     --output-format stream-json \
     --debug hooks \
     --debug-file docs/verification/recording-memory-hooks.debug.log \
     --include-partial-messages \
     --verbose \
     --permission-mode acceptEdits \
     "Ask about a topic that should retrieve an imported recording memory"
   ```

   `claudefast -p` must receive the prompt argument shown above, or read a
   prompt from stdin. Do not use `--include-hook-events` as active evidence;
   hook evidence is the `--debug hooks --debug-file` artifact.

   Evidence required from the stream JSON output and hook debug file:

   - the relevant hook fires;
   - recording memory is injected when the prompt is related;
   - the injected content includes a source reference;
   - the full transcript is not injected by default.

   The PR must include either the relevant stream JSON excerpt or a short evidence file that names the event types observed and the source reference that appeared.

3. Verify CLI behavior with canonical hard-match:

   ```bash
   claudefast -p "teamagent recording --help"
   codex exec "teamagent recording --help"
   ```

   Normalize both outputs into canonical JSON and hard-match them. The purpose is to prove that the command surface is stable across independent agent runners.

   Evidence required:

   - the canonical JSON generated from the `claudefast` run;
   - the canonical JSON generated from the `codex exec` run;
   - the hard-match command output showing pass or fail.

4. Verify the dashboard with Playwright:

   ```bash
   pnpm teamagent dashboard --watch --port 8787
   ```

   Playwright must confirm:

   - the Recording Memory performance area is visible;
   - latency numbers render;
   - empty or slow query counts render;
   - values update after new recording-memory activity.

   Evidence required:

   - the Playwright test command;
   - the Playwright result;
   - at least one screenshot or trace artifact showing the dashboard state.

5. Run a golden prompt benchmark:

   - Use at least 3 real recording examples.
   - Create 10 fixed prompts that should retrieve those recordings.
   - Record whether the correct recording is found.

   Acceptance targets:

   - at least 8 of 10 prompts retrieve the correct recording;
   - default injection stays under 800 tokens;
   - full transcript appears only after explicit expansion;
   - slow, empty, fallback, or failed retrievals are visible in the dashboard or report.

   Evidence required:

   - the 3 recording examples used;
   - the 10 prompts;
   - expected recording for each prompt;
   - actual recording returned for each prompt;
   - pass/fail result for each prompt;
   - injection token count for each prompt.

6. Attach verification evidence to the PR:

   - stream JSON output or summarized hook evidence;
   - canonical hard-match result;
   - Playwright test result or screenshot;
   - golden prompt benchmark report;
   - exact commands used.

The PR is not ready if it only contains screenshots of manual behavior, model-written summaries without raw evidence, or `SelfVerify` output.
