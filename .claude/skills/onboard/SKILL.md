---
name: onboard
description: Remote bootstrap of a new colleague's Mac via SSH — installs Homebrew, Node, and `@anthropic-ai/claude-code`, then completes interactive `claude login` over a tmux session whose OAuth URL the human relays to the colleague. Manually invoked via /onboard only (frontmatter pins `disable-model-invocation: true`), so it never auto-triggers from chat. Use when a teammate needs Claude Code stood up on their Mac and the operator has Tailscale SSH access plus a sudo password the teammate shared out-of-band.
disable-model-invocation: true
---

```
   you (CC main)
        |
        | SSH (ed25519, no password) over Tailscale
        v
   colleague's Mac (macOS, IT-provisioned proxy already working)
        |
        +-- 1. assert preconditions: ssh ok, curl google ok, sudo via stdin ok
        |
        +-- 2. probe state (one shot): brew? node? claude? claude_auth? arch? macos?
        |
        +-- 3. reconcile diff only: install what's missing, leave what's already there
        |
        +-- 4. claude login (tmux on remote; OAuth opens in colleague's browser)
        |
        v
   verify: brew --version, node --version, claude --version, claude auth status
        |
        v
   tell operator: done. message colleague to use it. remind colleague to rotate sudo pw.
```

# /onboard — remote Claude Code bootstrap over SSH

This skill turns a single SSH-reachable colleague Mac into a working `claude` installation, with the operator (you) supervising from local Claude Code. The skill is invoked manually only — it never auto-triggers, because the failure modes (typing into the wrong machine, leaking sudo, breaking IT's proxy) are too expensive for ambient invocation.

## Inputs the operator must provide

When `/onboard` fires, three pieces of context are required. Ask the operator for any that aren't already in the message.

- `SSH_TARGET`: the SSH destination, e.g. `alice@alice-mbp.tail-scale.ts.net`. This is what every command will tunnel through.
- `$REMOTE_SUDO_PW`: the colleague's account password, exported as an environment variable in the operator's shell **before** `/onboard` runs. Reference it as `"$REMOTE_SUDO_PW"` in commands; never echo, log, or paste its literal value into the conversation. If it's not exported, stop and ask the operator to export it — do not request the password be typed into chat.
- `COLLEAGUE_NAME`: human-readable name, used only for the final hand-off message (e.g. "tell Alice she can run `claude` now").

Why required up-front: the reconcile loop is non-interactive once it starts. Pausing mid-install to ask for context guarantees that the operator's attention has already drifted somewhere else, which means a sudo prompt could sit waiting and the colleague's OAuth URL could expire.

## Preconditions — three assertions before any work

Run all three before touching anything. If any fails, stop and report exactly which one and what came back. Do not try to fix the failure yourself — these are IT's responsibility, not the skill's.

```bash
# 1. SSH key auth works (no password prompt)
ssh -o BatchMode=yes "$SSH_TARGET" 'echo ok'
# expect: ok

# 2. Outbound proxy is working — the colleague can reach the public internet
ssh "$SSH_TARGET" 'curl -sf -m 5 https://www.google.com -o /dev/null && echo ok'
# expect: ok

# 3. sudo via stdin works (no tty, no logged password)
echo "$REMOTE_SUDO_PW" | ssh "$SSH_TARGET" 'sudo -S -p "" whoami'
# expect: root
```

Why these three and only these three: the entire skill assumes them. SSH gives you a shell, the proxy lets `brew` and `npm` reach their CDNs, and `sudo -S` lets `brew install` finish on systems where it asks for a password. If any of these is broken at the start, every subsequent step will hang or fail in confusing ways.

Why you must not "fix" them: the proxy in particular is configured by the colleague's IT team. Touching it from inside a remote SSH session is a fast way to lock the colleague out of their own working network. Stop and tell the operator who needs to be paged.

## State probe — one SSH call, JSON out

Once preconditions pass, gather the entire current state in **one** SSH round-trip. Multiple SSH calls are slow and racy.

```bash
ssh "$SSH_TARGET" 'bash -s' <<'PROBE'
set -u
have() { command -v "$1" >/dev/null 2>&1 && echo true || echo false; }
ver() { command -v "$1" >/dev/null 2>&1 && "$1" --version 2>&1 | head -n1 || echo ""; }
auth() {
  command -v claude >/dev/null 2>&1 \
    && (claude auth status 2>&1 | grep -qi "logged in\|authenticated" && echo true || echo false) \
    || echo false
}
proxy() { curl -sf -m 5 https://www.google.com -o /dev/null && echo true || echo false; }
cat <<EOF
{
  "arch": "$(uname -m)",
  "macos": "$(sw_vers -productVersion 2>/dev/null)",
  "brew_present": $(have brew),
  "brew_version": "$(ver brew)",
  "node_present": $(have node),
  "node_version": "$(ver node)",
  "claude_present": $(have claude),
  "claude_version": "$(ver claude)",
  "claude_authenticated": $(auth),
  "proxy_works": $(proxy)
}
EOF
PROBE
```

Parse the JSON. The next steps are pure diff against the target — nothing else.

## Reconcile target

The machine is "done" when all four of these are true:

- `brew --version` succeeds (Homebrew installed; arm64 path is `/opt/homebrew/bin/brew`, x86_64 path is `/usr/local/bin/brew`)
- `node --version` succeeds (any reasonable install method — `brew install node`, `nvm`, `fnm`. Pick the simplest available; for a fresh Mac that's `brew install node`)
- `claude --version` succeeds (`@anthropic-ai/claude-code` installed globally via npm)
- `claude auth status` reports an authenticated session

Anything outside this list is **out of scope** for v1: dotfiles, git config, IDE setup, MCP servers, custom plugins, shell rc tweaks beyond what brew itself adds. Other onboarding skills will layer on top later. Keeping this skill tight is the whole point — it must run end-to-end every time without becoming a god-skill.

## Reconcile, not orchestrate — the working principles

The skill is intentionally declarative. Restate these to yourself before each run; they're how the skill stays robust to interruptions.

### 1. The machine is the source of truth, not a state file

There is no `state/current-session.json`, no `progress.lock`, no resumable journal. Each run probes fresh, computes a diff, and applies only the missing pieces. If the operator restarts CC, if SSH drops, if the colleague closes the laptop lid — re-running `/onboard` recovers cleanly. Persistent local state would lie about what's actually on the remote.

### 2. One-shot context bundles

Every state read is one SSH call returning structured output. Don't loop `ssh ... brew --version`, `ssh ... node --version`, `ssh ... claude --version` — that's three round-trips for information that fits in one. The probe script above is the canonical example; extend it rather than splitting it.

### 3. Crime-scene dumps on failure

When any command exits non-zero, immediately capture command, stdout, stderr, exit code, and `SSH_TARGET` (no secrets!) to `/tmp/onboard-last-fail.json` on the operator's local machine, then stop and ask the human. Do not silently retry. The next `/onboard` run reads this file first and tells the operator what was unresolved last time.

```json
{
  "when": "2026-05-09T14:32:11Z",
  "ssh_target": "alice@alice-mbp.tail-scale.ts.net",
  "command": "echo \"$REMOTE_SUDO_PW\" | ssh ... 'sudo -S -p \"\" brew install node'",
  "exit_code": 1,
  "stdout": "...",
  "stderr": "Error: ...",
  "phase": "install_node"
}
```

Why dump rather than retry: most failures here are environmental (proxy hiccup, brew formula update mid-flight, npm registry blip) and the operator wants to see the message before deciding whether to retry, switch tactics, or escalate to IT. Silent retry hides signal.

### 4. sudo discipline — non-negotiable

Every sudo invocation looks like this and only this:

```bash
echo "$REMOTE_SUDO_PW" | ssh "$SSH_TARGET" 'sudo -S -p "" <command>'
```

- Stdin, not argv (`ps` would leak argv to other users on the colleague's box).
- Never write the password to disk on either machine.
- Never edit `/etc/sudoers*` to add NOPASSWD — the password approach is good enough and reversible.
- Never paste the literal password into the chat, log, or commit.

### 5. Decide, don't survey

The skill makes choices. When there's a fork (e.g. "node via brew vs nvm"), pick the simpler one (brew), state the choice in one line, and proceed. Pausing to ask the operator about every default is how a 10-minute job becomes an hour. The operator is supervising from another window and would rather see a finished outcome than a multiple-choice quiz.

If a decision genuinely deserves human input — destructive, irreversible, or scope-changing — that's what the crime-scene dump and "stop and ask" pattern is for. Don't conflate the two.

## The `claude login` flow — the one interactive ritual

`claude login` opens an OAuth browser flow. The browser opens on the **colleague's** Mac (because that's where the user agent is logged into Anthropic's auth provider), not on the operator's. The skill bridges the gap with a tmux session.

```bash
# 1. Kill any stale `cclogin` session from a prior failed run, then start fresh.
#    Without this, a stuck session breaks the "re-run /onboard recovers cleanly"
#    invariant — `tmux new` would silently fail because the name is already taken.
ssh "$SSH_TARGET" 'tmux kill-session -t cclogin 2>/dev/null || true'
ssh "$SSH_TARGET" 'tmux new -d -s cclogin "claude login"'

# 2. Poll the tmux pane for the OAuth URL (typically appears within a few seconds)
for i in $(seq 1 30); do
  pane=$(ssh "$SSH_TARGET" 'tmux capture-pane -t cclogin -p 2>/dev/null')
  url=$(echo "$pane" | grep -oE 'https://[^[:space:]]+claude\.ai/oauth/[^[:space:]]+' | head -n1)
  if [ -n "$url" ]; then
    echo "OAUTH_URL=$url"
    break
  fi
  sleep 1
done
```

3. Print the URL into the chat with the operator. Tell the operator literally: "Send this URL to <COLLEAGUE_NAME> and ask them to open it in their own Mac's browser, complete login, then tell you 'done'."

4. Wait for the operator to confirm the colleague finished. Don't poll the OAuth URL — only the colleague's browser can complete it.

5. Once the operator says "done", verify on the remote:

```bash
ssh "$SSH_TARGET" 'tmux capture-pane -t cclogin -p' | grep -i 'logged in\|success\|authenticated'
ssh "$SSH_TARGET" 'tmux kill-session -t cclogin 2>/dev/null || true'
ssh "$SSH_TARGET" 'claude auth status'
# expect: indicates authenticated session
```

6. If after 10 minutes there's still no success marker in the tmux pane, dump the pane contents to the crime-scene file and ask the operator. The OAuth URL has its own server-side timeout (~15 min); a fresh `/onboard` will mint a new one cleanly.

## Hard rules — the blacklist

These are forbidden inside `/onboard`, regardless of how reasonable they sound in the moment:

- No `rm -rf` outside `/tmp/`. The colleague's home directory is sacred.
- No `dscl . -delete`, no `diskutil`, no writes under `/System` or `/Library/LaunchDaemons`.
- No edits to `/etc/sudoers*`, `/etc/hosts`, system network preferences, or system proxy settings. The IT-provisioned proxy must not be "improved" from inside this skill.
- No persisting `$REMOTE_SUDO_PW` to any file, on any machine, in any form.
- No "fixing" anything that broke and was IT's responsibility (proxy, MDM, certificate trust). Stop and ask.
- No scope creep beyond v1 (dotfiles, IDE plugins, MCP servers, shell themes). They're separate skills.

If a step seems to require any of the above, stop. The skill is wrong; the situation isn't.

## Completion ritual

Once `claude auth status` confirms a session, the skill ends with three explicit actions, in this order:

1. Re-run the state probe and paste its JSON output into the chat. The operator should see all four target booleans flip to `true`. This is the receipt.
2. Tell the operator: "Tell `<COLLEAGUE_NAME>` they can now run `claude` on their Mac."
3. Tell the operator: "Remind `<COLLEAGUE_NAME>` to rotate their account password — the sudo password we just used was shared over WeChat in plaintext."

Step 3 is the one that gets forgotten. The skill must always emit it; it's a security action, not a courtesy.

## What `/onboard` is not

A short list of things the skill explicitly punts on, in case the operator wonders:

- Not a TeamBrain-specific bootstrap. This skill installs `claude` and that's it. Project setup happens after.
- Not a remote shell. Don't use `/onboard` to run arbitrary commands on the colleague's Mac. Open a regular SSH session for that.
- Not idempotent across machines — it's idempotent against **the same** machine. Running it on a second target requires re-exporting `$REMOTE_SUDO_PW` and re-checking preconditions for the new host.
- Not a replacement for the colleague reading any internal "first day at the company" doc. The skill installs a tool; the human still onboards.
