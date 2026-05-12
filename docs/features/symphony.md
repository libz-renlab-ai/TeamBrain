# Symphony Service

TeamAgent implements the OpenAI Symphony draft as `teamagent symphony`.

Source spec: <https://github.com/openai/symphony/blob/main/SPEC.md>

## Scope

Implemented core:

- `WORKFLOW.md` discovery from an explicit path or `./WORKFLOW.md`.
- Markdown prompt body plus optional YAML front matter.
- Typed config defaults for `tracker`, `polling`, `workspace`, `hooks`, `agent`, and `codex`.
- `$VAR` indirection for `tracker.api_key` and filesystem path expansion for `workspace.root`.
- Strict prompt rendering for `{{ issue.* }}`, `{{ attempt }}`, and simple Liquid-style loops.
- Linear-compatible issue reader with candidate fetch, terminal-state fetch, and state refresh by ID.
- Deterministic per-issue workspace directories using sanitized issue identifiers.
- Workspace hooks: `after_create`, `before_run`, `after_run`, `before_remove`.
- Single-authority in-memory orchestrator state for running, claimed, completed, and retry queues.
- Dispatch sorting, `Todo` blocker checks, concurrency limits, stall detection, and retry backoff.
- Codex app-server launch through `bash -lc <codex.command>` with the workspace as `cwd`.
- Optional HTTP status surface with `/`, `/api/v1/state`, `/api/v1/<issue_identifier>`, and `/api/v1/refresh`.

Not implemented:

- Persistent retry/session recovery across process restarts.
- Built-in tracker write business logic.
- SSH worker extension.
- General non-Linear tracker adapters.

## Command

```bash
teamagent symphony [path-to-WORKFLOW.md] [--once] [--port <port>] [--host 127.0.0.1]
```

`--once` runs one reconcile + dispatch tick and exits. Without `--once`, the process keeps polling.

## Trust And Safety Posture

This implementation is a high-trust local runner. It assumes the repository owner trusts `WORKFLOW.md` and any workspace hook scripts in it.

Safety boundaries:

- The coding agent is launched only inside the per-issue workspace path.
- Workspace paths must remain under `workspace.root`.
- Workspace directory names are sanitized to `[A-Za-z0-9._-]`.
- `tracker.api_key` can be supplied as `$LINEAR_API_KEY`; secret values are validated for presence but not logged.
- Hook failures are handled according to the Symphony spec: `after_create` and `before_run` are fatal, while `after_run` and `before_remove` are best-effort.
- Approval and sandbox settings are pass-through Codex config from `WORKFLOW.md`: `codex.approval_policy`, `codex.thread_sandbox`, and `codex.turn_sandbox_policy`.
- User-input-required app-server turns are treated as runner failures by the current Codex app-server client path; the orchestrator retries according to backoff policy.

For untrusted issue sources or broad credentials, run the service under a dedicated OS user and choose stricter Codex sandbox/approval settings in `WORKFLOW.md`.

## Minimal WORKFLOW.md

```markdown
---
tracker:
  kind: linear
  api_key: "$LINEAR_API_KEY"
  project_slug: my-project
workspace:
  root: .symphony/workspaces
codex:
  command: codex app-server
  approval_policy: never
  # thread_sandbox = SandboxMode (string enum); turn_sandbox_policy = SandboxPolicy
  # (internally-tagged object with a camelCase variant). The two shapes are NOT
  # interchangeable; codex app-server rejects a bare string for sandboxPolicy.
  thread_sandbox: "workspace-write"
  turn_sandbox_policy:
    type: "workspaceWrite"
---
Work on {{ issue.identifier }}: {{ issue.title }}.

Issue description:
{{ issue.description }}
```

### Codex sandbox shapes (verified against `codex-cli 0.130.0`)

The two sandbox fields look similar but are passed to different Codex JSON-RPC
parameters and therefore expect different shapes. Empirically validated against
`codex app-server generate-json-schema` plus a live `--once` run:

| WORKFLOW.md key       | RPC param                | Codex type      | Accepted shape                                        |
|-----------------------|--------------------------|-----------------|-------------------------------------------------------|
| `thread_sandbox`      | `thread/start.sandbox`   | `SandboxMode`   | kebab-case string: `"read-only"` / `"workspace-write"` / `"danger-full-access"` |
| `turn_sandbox_policy` | `turn/start.sandboxPolicy` | `SandboxPolicy` | object: `{type: "readOnly"}` / `{type: "workspaceWrite"}` / `{type: "dangerFullAccess"}` (variant names are camelCase) |

Passing a bare `"workspace-write"` string to `turn_sandbox_policy` fails with
`Invalid request: invalid type: string "workspace-write", expected internally
tagged enum SandboxPolicyDeserialize`. Passing a `{type: "workspace-write"}`
object (kebab-case variant) fails with `unknown variant 'workspace-write',
expected one of 'dangerFullAccess', 'readOnly', 'externalSandbox',
'workspaceWrite'`. The matrix above is the only combination codex accepts end
to end.
