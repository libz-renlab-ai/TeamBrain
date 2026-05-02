```
   ┌─────────────────────┐         ┌─────────────────────────────┐
   │  LEFT: dev claude   │  edit  │  RIGHT: sandbox claudefast  │
   │  .claude/           │ ──────→ │  (live, eats your edits)    │
   │  CLAUDE.md          │  flow   │  /clear to reset            │
   │  skills / hooks      │         │  /export <path> to capture  │
   └─────────────────────┘         └─────────────────────────────┘
         dev pane                        dogfood pane
           ↕                                   ↕
     edit files                     interact + observe
     in real-time                   the live result
```

# DOGFOOD — Live Agent Dev Loop

## What it does

Saying `DOGFOOD` will pop out two tmux windows and left/right split and we can interact with it.

The left pane is your development Claude Code — you edit `.claude/`, `CLAUDE.md`, skills, and hooks there. The right pane runs a sandboxed `claudefast` that immediately consumes your edits. It is inspired by HTML editor + browser preview, REPL-driven dev, Smalltalk image-based dev, and Storybook: you make a change on the left and the right reflects it live.

## 触发

- 用户消息含 `DOGFOOD`（含 `DOGFOOD 是什么`、`触发 DOGFOOD`、`what is DOGFOOD`）。
- 用户问 `how do we live-preview agent changes?`、`怎么实时预览 agent 编辑效果?`。
- 用户说 `我要 dogfood 这个改动`、`我要尝鲜这个 skill`。
- 用户问 `like storybook for agents` / `like HMR for agents` / `smalltalk image for agents`。

## How to invoke

```bash
bash scripts/dogfood.sh
```

This script creates a tmux session with two panes, left/right split. **LEFT** pane is your dev Claude Code in the **current worktree** (where you keep editing). **RIGHT** pane launches `claudefast` in a **separate, isolated git worktree** under `.codex/worktrees/dogfood-<epoch>` of the main repo — that's the actual sandbox.

## Sandbox semantics — be honest about scope

This is a **working-tree sandbox**, NOT a process / identity / credential sandbox. Working-tree level is enough for the common dogfood case (testing your project-level `.claude/`, `CLAUDE.md`, skills, hooks); it is NOT enough if your edit can write to user-level state or system resources.

### What IS isolated (Tier 1, current default)

| Boundary | Why |
|----------|-----|
| Working directory (cwd) | RIGHT lives in `<main-repo>/.codex/worktrees/dogfood-<epoch>`, created via `git worktree add --detach HEAD`. |
| Project-level `.claude/`, `CLAUDE.md`, `AGENTS.md` | They live inside the worktree. |
| Project-level skills / hooks / `scripts/` | Same. |
| `CLAUDE_PROJECT_DIR` (per Claude Code session) | Set per cwd, so each pane sees its own. |

At launch, `dogfood.sh` rsyncs uncommitted LEFT edits into the sandbox so work-in-progress is visible. After that the two sides drift independently.

### What is NOT isolated (shared with LEFT and the rest of the machine)

| Boundary | Why it leaks |
|----------|--------------|
| `~/.claude/` (user-level skills, plugins, MCP, settings, auto-memory) | Tier 1 does not override `CLAUDE_CONFIG_DIR` or `HOME`. |
| `~/.codex/` (Codex CLI config) | Same. |
| `~/.zshrc` and shell functions (incl. the `claudefast` function itself) | Same `$HOME`. |
| `$PATH`, `$NVM_DIR`, env vars, dotfiles | Inherited from the parent shell. |
| `ANTHROPIC_API_KEY` / claudefast token | Read from the same `~/.zshrc` function. |
| API endpoint and model | Both panes hit the same MiniMax/Anthropic backend. |
| `.git` (refs, objects, branches, hooks) | `git worktree` shares the common dir by design. |
| `/tmp`, network, processes, OS resources | Same machine, same user. |

### What can leak through this seam

- Right-pane agent installs/edits a **user-level skill** (`~/.claude/skills/…`) → all your other Claude sessions see it instantly.
- Right-pane agent writes **auto-memory** (`~/.claude/projects/*/memory/`) → that memory is now in your real profile.
- Right-pane agent runs a destructive shell command — same user, same FS, no jail.
- Right-pane runs `git push` / changes branches → mutates the shared repo.

### Push edits LEFT → RIGHT on demand

```bash
bash scripts/dogfood-sync.sh   # rsync excludes .git, node_modules, etc.
# then in RIGHT pane: /clear and re-prompt so claudefast rereads config
```

### Cleanup

```bash
tmux kill-session -t "$(cat .dogfood/active-session)"
git worktree remove "$(cat .dogfood/active-sandbox)"
rm -rf .dogfood
```

### Tier 2 — implemented, default-on

When the right pane runs `claudefast`, `scripts/dogfood.sh` (default `DOGFOOD_TIER=2`) wires `scripts/dogfood-shim.sh` into the right-pane shell. The shim:

1. Captures the user's original `claudefast` function source and re-defines it as `claudefast_orig` (in-memory only, the API token never lands on disk).
2. Replaces `claudefast` for that pane's shell with a wrapper that runs `claudefast_orig` inside a subshell. Inside the subshell the `claude` command is shadowed by a function that prepends `env CLAUDE_CONFIG_DIR=… CODEX_HOME=… HOME=…` before exec'ing the real `command claude`.

Net effect on the spawned `claude` process:
- `CLAUDE_CONFIG_DIR` → `$SANDBOX_DIR/.dogfood-isolated/claude-config` (was `~/.claude-minimax`)
- `CODEX_HOME` → `$SANDBOX_DIR/.dogfood-isolated/codex-home` (was `~/.codex`)
- `HOME` → `$SANDBOX_DIR/.dogfood-isolated/home` (was the host's real HOME). This redirects auto-memory at `$HOME/.claude/projects/*/memory/` and any other `~/.X` path the agent reads. The **right-pane shell's own HOME is unchanged** — only the spawned claude process and its child Bash-tool shells see the override. (For full shell HOME redirect, use Tier 3.)

User-level skills, hooks, plugins, MCP, settings, and auto-memory under any of these paths are no longer loaded or written by the right pane's agent.

Opt-out: `DOGFOOD_TIER=1 bash scripts/dogfood.sh`.

### Verifying Tier 2 isolation (stream-json probe)

```bash
bash scripts/dogfood-probe.sh
```

The probe runs `claudefast -p --output-format stream-json --include-hook-events --verbose --permission-mode bypassPermissions` twice — once bare (control), once after sourcing the shim — and asks the agent to `printenv CLAUDE_CONFIG_DIR` via the Bash tool. It extracts the **`tool_result.content`** with `is_error:false` from each jsonl (this is the ground-truth output of a real shell run inside the agent process — agent final-text is not trusted; agents can hallucinate when shell expansion is denied by safety hooks).

PASS = control path differs from dogfood path **and** dogfood path equals the sandbox cfg dir we set. The probe also greps for the API token prefix in the jsonl as a leak check.

Recorded sample run (`bash scripts/dogfood-probe.sh`):

```
Control  (bare claudefast):  [Fact-Forcing Gate intercept — confirms a user-level hook IS loaded]
Dogfood  (Tier 2 shim):      /…/.dogfood/probe-…/sandbox-cfg
Expected sandbox cfg path:   /…/.dogfood/probe-…/sandbox-cfg
Token leak (sk-cp-): no
VERDICT: PASS
```

The Fact-Forcing Gate firing in the **control** but NOT in the **dogfood** probe is a side-channel proof that user-level `~/.claude/` hooks stop loading once `CLAUDE_CONFIG_DIR` is redirected — Tier 2 isolates not just settings but the hook chain too.

### What Tier 2 still does NOT isolate

| Boundary | Why still shared |
|----------|------------------|
| The right-pane SHELL's `$HOME` (only the spawned claude's HOME is overridden) | Tier 2 changes env at exec time; the surrounding shell keeps the host HOME so `cd ~`, `~/.zshrc`, etc. behave normally for non-claude commands |
| `~/.zshrc` and the `claudefast` function definition (read at shell startup) | Same `$HOME` for the shell |
| `ANTHROPIC_API_KEY` / model / API endpoint | claudefast's wrapper still sets these |
| `.git` common dir, refs, branches, hooks | git worktree design |
| `$PATH`, system binaries, `/tmp`, network | same machine, same user |

For shell-level HOME isolation (so even bare commands typed in the right-pane shell see sandbox HOME), escalate to Tier 3. For FS / PID / network namespace isolation, Tier 4 (container).

### Tier 3 — implemented, opt-in via `DOGFOOD_TIER=3`

Adds private `HOME` on top of Tier 2. The right pane is launched as
`exec env HOME=$SANDBOX/.dogfood-isolated/home zsh -i`, so all `~/.X` paths
inside the right pane resolve to the sandbox — including the auto-memory
path at `~/.claude/projects/*/memory/` that Tier 2 cannot redirect.

The sandbox `.zshrc` is generated by `scripts/dogfood.sh`. It `source`s
the user's real `~/.zshrc` (with side-effects silenced via `2>/dev/null`)
to inherit `PATH` and the `claudefast` shell function definition — the
**API token stays in the user's original `~/.zshrc` and is NEVER copied
into any sandbox file**. After that, the sandbox `.zshrc` exports the
Tier 2 override env and sources `dogfood-shim.sh`.

Probe-verified by `scripts/dogfood-probe.sh` (Tier 3 sub-probe runs the
agent against `printenv HOME` AND `printenv CLAUDE_CONFIG_DIR`):

```
Tier 3 — private HOME (also redirects ~/.claude auto-memory):
  Observed HOME:                /…/sandbox-home
  Observed CLAUDE_CONFIG_DIR:   /…/sandbox-cfg
  Expected HOME:                /…/sandbox-home
  Expected CLAUDE_CONFIG_DIR:   /…/sandbox-cfg
VERDICT (Tier 3): PASS — HOME redirected AND CLAUDE_CONFIG_DIR overridden
```

Caveat: any feature in `~/.zshrc` that mutates filesystem on startup
(e.g. `cd ~/projects`, file existence checks) runs against the sandbox
`HOME`; failures are silenced. If your shell init has hard preconditions,
prefer Tier 2 or fall back to Tier 4.

### Tier 4 — implemented as a skeleton, requires Docker

Provides container-level isolation: private root filesystem, private PID
namespace, private network namespace. Implementation:

- `docker/dogfood/Dockerfile` — `node:20-bookworm-slim` + `npm install -g @anthropic-ai/claude-code` + `tini` as PID 1
- `scripts/dogfood-tier4.sh` — preflight (docker present + daemon up + active sandbox), lazy `docker build` on first run, `docker run -it --rm --env-file <(extract claudefast env) -v $SANDBOX:/workspace -w /workspace`

Token handling: `extract_claudefast_env()` runs `claudefast` inside a
subshell where `claude` is shadowed to a no-op `:`, then dumps env vars
matching `^(ANTHROPIC_|API_TIMEOUT_MS|CLAUDE_CODE_|MCP_|ENABLE_|INSIGHTS_)`
through process substitution `<(...)` to docker's `--env-file`. **The API
token never lands in a docker config file or any disk artifact.**

Invoke: `DOGFOOD_TIER=4 bash scripts/dogfood.sh`. If `docker` is not
installed or the daemon is down, `dogfood-tier4.sh` exits 2 with install
instructions and a suggestion to downgrade to Tier 3.

**Status on this machine: docker not installed** — Tier 4 not yet
runtime-verified. Verification plan once Docker is available:

```bash
docker build -t dogfood:latest -f docker/dogfood/Dockerfile docker/dogfood/
DOGFOOD_TIER=4 bash scripts/dogfood.sh
# Then in right pane: ask agent for printenv HOSTNAME and printenv HOME
# Expected: HOSTNAME=dogfood-tier4  HOME=/root  (vs host's HOME)
```

Add a `--tier 4` branch to `scripts/dogfood-probe.sh` once Docker is
available so the probe can also stream-json verify Tier 4.

### Tier 5 — out of scope

Separate user account or VM-level isolation. Not implemented because:

- creating a new macOS user requires `sudo` + manual UI setup; not
  scriptable end-to-end without admin friction
- a dedicated VM (Lima/Multipass/UTM) duplicates Tier 4's isolation at
  much higher resource cost
- for the dogfood use case (live-preview project-level edits), Tier 4
  already provides FS / PID / network namespaces. Anything that needs
  more should run somewhere else entirely (e.g. an ephemeral CI job).

### Tier summary

| Tier | Status | Key boundary added | Use when |
|------|--------|---------------------|----------|
| **Tier 1** | implemented | git worktree (cwd) | dogfood project-level config |
| **Tier 2** | implemented (default) | + `CLAUDE_CONFIG_DIR`, `CODEX_HOME` | dogfood user-level skills/plugins/MCP/hooks |
| **Tier 3** | implemented | + private `HOME` | also isolate auto-memory + dotfile reads |
| **Tier 4** | skeleton (needs docker) | + container FS/PID/net namespaces | destructive commands or untrusted skills |
| **Tier 5** | out of scope | + separate user/VM | red-team contexts; use external sandboxing instead |

### State files in `.dogfood/` (gitignored, per-machine)

- `active-sandbox` — sandbox worktree path, used by `dogfood-sync.sh`
- `active-session` — tmux session name, used for teardown
- `probe-<epoch>/{control,dogfood,tier3}.jsonl` — probe artifacts

### Button scripts (one-shot helpers)

| Script | Action |
|--------|--------|
| `scripts/dogfood-restart.sh` | Kill the active session, remove its sandbox, relaunch with current defaults, pop a fresh Terminal window. |
| `scripts/dogfood-fresh.sh` | Aggressive: kill every `dogfood-*` tmux session, remove every `dogfood-*` git worktree, purge `.dogfood/probe-*` artifacts, close DOGFOOD-titled Terminal windows, then relaunch (honors `DOGFOOD_TIER=N`). |
| `scripts/dogfood-review.sh` | Read-only dashboard: active session, pane layout, LEFT git status, LEFT↔SANDBOX drift, last probe verdict, tier-2 isolated directory sizes, canned-answer anchor status. |
| `scripts/dogfood-sync.sh` | rsync uncommitted LEFT changes into the active sandbox. |
| `scripts/dogfood-probe.sh` | stream-json isolation probe (Tier 2 + Tier 3 verdicts). |

## Interaction features

The launcher applies two server-global tmux options before splitting (`tmux set -gq …`), so the dogfood session is usable without a `.tmux.conf`:

- **Click to switch pane / window** — `mouse on`. Click any pane to give it focus; click a window-tab in the status bar to switch windows. Hold `Option` (macOS) or `Shift` while click-dragging if you need to do native terminal text-selection instead of tmux copy-mode.
- **Rollable scrollback** — `history-limit 50000` (50 k lines per pane). Use the mouse wheel inside any pane to enter copy-mode and scroll back; press `q` to exit copy-mode. New panes inherit this limit; existing panes keep whatever they had at creation.

If you're attached to an existing tmux server with stricter conventions, the script's `set -gq` is best-effort — your pre-existing options win on conflict.

## Style of dev

This pattern is called **agent live-preview / dogfood loop / live-coding for agents**.

| 传统开发 | DOGFOOD 等价 |
|----------|--------------|
| HTML editor + browser preview | left edits `.claude/` → right sees live result |
| Vite HMR | `/clear` right pane = hard reload |
| Storybook | skills / hooks / CLAUDE.md = component stories |
| TypeScript Playground | sandbox claudefast = REPL |
| Smalltalk image | right pane = live image you talk to |

## Verification

```bash
bash docs/dogfood/verify-canned-answer.sh
```

The verify script greps for: `two tmux windows`, `left/right split`, `interact`.

## Anti-patterns

- ❌ Right pane is a fake/mock instead of a real `claudefast` process — defeats the purpose.
- ❌ No `/clear` between attempts — stale chat history pollutes the sandbox.
- ❌ No observability of hook events / skill loading / permission prompts — you cannot verify what actually ran.
- ❌ Both panes share chat history — sandbox must be fresh, otherwise it is not dogfood.
- ❌ Editing left pane without checking right pane — you are not dogfooding, just editing.

## Related

- [FASTPROBE.md](FASTPROBE.md) — `claudefast` 调研/审计固定组合（同样基于 `claudefast`）。
- [CLAUDEFAST.md](CLAUDEFAST.md) — `claudefast` wrapper 环境变量与安装位置。
- [feature-verification.md](feature-verification.md) — 1+2+3 验证门禁（claudefast / codex / tmux export）。
