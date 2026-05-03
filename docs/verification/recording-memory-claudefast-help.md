# Recording Memory claudefast help evidence

Date: 2026-04-29

Historical note: this is retained as evidence from the 2026-04-29 run. Current
active TeamBrain recipes do not use `--include-hook-events`; hook evidence is
captured with `--debug hooks --debug-file <path>` plus stream-json transcript
flags.

Command:

```bash
/Users/liushiyu/.local/bin/claudefast -p \
  --output-format stream-json \
  --include-hook-events \
  --include-partial-messages \
  --verbose \
  --permission-mode acceptEdits \
  "In /Users/liushiyu/projects/TeamBrain, run exactly this shell command and return the exact stdout only: pnpm teamagent recording --help"
```

Result: passed.

Observed stream instance:

- `session_id`: `e332c234-cb68-4219-856c-c20b1ef7fbdb`
- `cwd`: `/Users/liushiyu/projects/TeamBrain`
- tool call: `Bash` with `pnpm teamagent recording --help`
- tool result: `is_error=false`

Canonical command JSON:

```json
{
  "command": "teamagent recording",
  "subcommands": [
    {
      "name": "import",
      "usage": "teamagent recording import --file <material.json>"
    },
    {
      "name": "search",
      "usage": "teamagent recording search --query <text>"
    },
    {
      "name": "show",
      "usage": "teamagent recording show <id> [--transcript]"
    },
    {
      "name": "inject",
      "usage": "teamagent recording inject --query <text>"
    },
    {
      "name": "metrics",
      "usage": "teamagent recording metrics"
    },
    {
      "name": "benchmark",
      "usage": "teamagent recording benchmark --json --report=<path>"
    }
  ]
}
```

Note: raw command stdout also included the package script banner and Node's experimental SQLite warning. The canonical JSON above is the stable command surface used for comparison.
