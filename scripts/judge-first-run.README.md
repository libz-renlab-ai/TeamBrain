```
   ___           _              _   _                             
  |_  |         | |            | | | |                            
    | |_   _  __| | __ _  ___  | |_| | __ _ _ __ _ __   ___  ___ 
    | | | | |/ _` |/ _` |/ _ \ |  _  |/ _` | '__| '_ \ / _ \/ __|
/\__/ / |_| | (_| | (_| |  __/ | | | | (_| | |  | | | |  __/\__ \
\____/ \__,_|\__,_|\__, |\___| \_| |_/\__,_|_|  |_| |_|\___||___/
                    __/ |                                          
                   |___/   Issue #87 — First-Run Judge Harness
```

# judge-first-run.sh

Third-party judge harness for issue #87 (first-run welcome / wizard).

## Purpose

Verifies the issue #87 feature slice — postinstall welcome + first-run wizard — without
any self-evaluation. The script runs fixed tools, dumps raw evidence, and writes
`judge.json`. A separate LLM reads only the JSON to render a verdict.

## How to Run

From the worktree root:

```bash
bash scripts/judge-first-run.sh
```

Output:
- `OUT_DIR=.judge/<run_id>/` — all evidence lives here
- `OVERALL=PASS|FAIL` — printed to stdout
- exit 0 = PASS, exit 1 = FAIL

Backup/restore: the script automatically backs up `~/.teamagent/first-run-state.json`
and `~/.teamagent/update-state.json`, and restores them on exit (trap EXIT).

## judge.json Schema

```json
{
  "run_id": "2026-05-07T03-17-37Z",
  "feature": "issue-87-first-run-welcome",
  "overall": "PASS",
  "checks": [
    {
      "id": "J1",
      "tool": "typecheck",
      "pass": true,
      "exit_code": 0,
      "stdout_path": "evidence/typecheck.log"
    },
    {
      "id": "J2",
      "tool": "vitest",
      "pass": true,
      "exit_code": 0,
      "tests_passed": 6,
      "stdout_path": "evidence/vitest.log"
    },
    {
      "id": "J3",
      "tool": "postinstall",
      "pass": true,
      "exit_code": 0,
      "anchors_hit_count": 6,
      "line_count": 18,
      "stdout_path": "evidence/postinstall.stdout"
    },
    {
      "id": "J4",
      "tool": "wizard-noargs-first",
      "pass": true,
      "exit_code": 0,
      "anchors_hit_count": 5,
      "state_file_created": false,
      "stdout_path": "evidence/wizard-1.stdout"
    },
    {
      "id": "J5",
      "tool": "wizard-noargs-second",
      "pass": true,
      "exit_code": 0,
      "anchors_hit_count": 1,
      "completed_steps_count": 1,
      "stdout_path": "evidence/wizard-2.stdout"
    },
    {
      "id": "J6",
      "tool": "help-unchanged",
      "pass": true,
      "exit_code": 0,
      "diff_bytes": 0,
      "stdout_path": "evidence/help-diff.log"
    }
  ]
}
```

### Check descriptions

| ID | Tool | Pass condition |
|----|------|---------------|
| J1 | `pnpm typecheck` | `exit_code == 0` |
| J2 | `pnpm vitest run first-run` | `exit_code == 0` AND `tests_passed >= 6` |
| J3 | `node packages/teamagent/postinstall.mjs` | 6 anchors hit (`✅` `装好` `skeleton-demo` `stats` `--help` `github.com`) AND `line_count <= 30` |
| J4 | `pnpm teamagent` (no args, first run) | menu anchors hit >= 3 (`装好啦` `🎉` `skeleton-demo` `stats` `--help`) |
| J5 | `pnpm teamagent` (no args, second run) | stdout contains `上次你跑了` AND `completed_steps_count > 0` |
| J6 | `pnpm teamagent --help` | diff vs `docs/baselines/help-output.txt` is empty (`diff_bytes == 0`) |

Note on J4/J5: in non-TTY (pipe) mode the wizard renders the menu and exits without
writing state. J4 therefore tests only menu rendering; J5 pre-seeds the state file to
simulate a prior run so the recall message can appear.

## How the LLM Judge Consumes This

```bash
claudefast -p "你是验收 judge。只读 .judge/<run_id>/judge.json 和 evidence/ 下文件，\
不要执行任何工具。对每个 check 给 PASS/FAIL；任一 FAIL → OVERALL FAIL。\
最后一行输出 OVERALL: PASS|FAIL。"
```

The LLM reads raw JSON + evidence files. It does not execute commands, write files,
or consult the agent that produced the code. This keeps evaluation independent.

## Known Limits

- **PTY emulation**: J4/J5 run via pipe (`printf '1\n' | pnpm teamagent`), so `isTTY`
  is false. The wizard takes the non-TTY path (render-and-exit). Full TTY exercise
  requires a PTY (`script -q /dev/null` on macOS or `unbuffer` from expect), but this
  varies across macOS/Linux and adds a dependency. The non-TTY path tests menu
  rendering; the TTY path (choice dispatch + state write) is tested by J2 vitest.

- **postinstall exit code**: J3 passes based on anchor matching, not on exit_code.
  The postinstall script may exit non-zero if doctor/warmup fail (expected in CI
  environments where no knowledge.db exists). The welcome block content is what matters.

- **state_file_created in J4**: Always `false` when run via pipe (non-TTY). This is
  correct by design; see `first-run.ts` for the TTY check. State creation is tested
  in J2 vitest (state first-write case).

- **Baseline timing**: `docs/baselines/help-output.txt` was captured from the HEAD
  state at judge-harness creation time. If W3 or another worker inadvertently changes
  the `--help` text, J6 will detect it via `diff_bytes > 0`.
