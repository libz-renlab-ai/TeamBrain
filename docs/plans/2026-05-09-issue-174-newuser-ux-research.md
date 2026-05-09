```text
              ┌────────────────────────────────────────────┐
              │  ISSUE 174 — RESEARCH (CONTEXT DUMP)       │
              │                                            │
              │  current code locations + line numbers     │
              │  + 2 STALE CLAIMS in issue 174:            │
              │    * SHA256 "TBD H1" not present anymore   │
              │    * top-level `demo` already implemented  │
              │  + actual user flow that hits each gap     │
              └────────────────────────────────────────────┘
```

# Issue 174 — Research

Companion to `docs/plans/2026-05-09-issue-174-newuser-ux-plan.md`. This file
captures the actual code locations and reality-vs-claim deltas for the 7
sub-items in [issue 174](https://github.com/libz-renlab-ai/TeamBrain/issues/174).

## Top-level findings

### Two claims in issue 174 are stale (as of branch `worktree-174` @ a4d6392)

#### Stale claim A: `install.sh` SHA256 placeholder `TBD H1`

Issue says `install.sh` has a `TBD H1` SHA256 placeholder. **Not present
on `release` or `worktree-174`.** Evidence:

```
$ grep -n "TBD\|SHA256\|sha256\|EXPECTED_SHA\|placeholder" release/install.sh
(no output)
```

Action: skip; document in `report.md`. No file edit needed for the SHA256
sub-bullet of issue 174 #1.

#### Stale claim B: top-level `teamagent demo` does not exist

Issue says README recommends `pnpm teamagent demo` but `--help` only has
`demo hook`. **Top-level `demo` is implemented**:

```
packages/cli/src/bin.ts:350-371
  case "demo": {
    // Legacy subcommand: teamagent demo hook <tool> <key=value>...
    const sub = rest[0];
    if (sub === "hook") {
      …
    }
    // Issue #93 modes: teamagent demo / --inline / --record [path]
    const { parseDemoArgs, executeDemo } = await import("./commands/demo.js");
    const demoArgs = parseDemoArgs(rest);
    const r = await executeDemo(demoArgs);
    process.stdout.write(r.output);
    process.exit(r.exitCode);
  }
```

What *is* missing is `--help` enumeration of the top-level `demo` mode
(only `demo hook` is listed in `bin.ts:1098-1099`). So issue 174 #1
collapses into:
- (1a) release branch README sync — TODO
- (1b) `--help` enumerate top-level `demo` (and our new `try`) — TODO
- (1c) SHA256 `TBD H1` — already done, no action

### Release branch reality

```
$ git ls-tree origin/release | head
040000 tree …  dist
100755 blob …  install.sh
100644 blob …  package.json
100644 blob …  postinstall.mjs
100644 blob …  release-meta.json

$ git show origin/release:README.md
fatal: path 'README.md' exists on disk, but not in 'origin/release'
```

Confirmed: `release` has **no** README.md → `https://github.com/libz-renlab-ai/TeamBrain/tree/release`
renders 404 for the readme card. Fix: copy/sync `README.md` into the
release branch (or via release-meta automation).

## Per-item code map

### #1 — Release branch README + install.sh + README demo command

- `release/install.sh` — clean of `TBD` per grep above; uses
  `TARBALL_URL=https://github.com/.../archive/refs/heads/release.tar.gz`,
  npm/pnpm fallback, optional `TEAMAGENT_INCLUDE_OPTIONAL=1` for vector
  matcher (ADR 0001 30s budget).
- `README.md:50-65` (main branch) — recommends `teamagent demo` (no args),
  links to landing page GIF. Backed by `bin.ts:350-371`.
- `bin.ts` `--help` text at `1075-1158+` lists `demo hook` only; does not
  enumerate top-level `demo` or the new `try`.
- Action surface: (a) sync README into release branch, (b) add `demo`
  + `try` lines to `bin.ts` help block.

### #2 — `teamagent try` one-shot 5-case wow demo

- No file exists yet. New file: `packages/cli/src/commands/try.ts`.
- Test target: `packages/cli/src/commands/__tests__/try.test.ts`.
- Wiring: `bin.ts` add `case "try":` near the `demo` dispatch (line ~350)
  and a new `--help` entry in the help block (after `skeleton-demo`).
- 5 fixture cases per issue: `npm install moment`, `rm -rf /`,
  `git push --force`, `chmod 777 …`, hardcoded path Write. Fixtures
  reuse `executeDemoHook` rather than re-implementing matching, so the
  demo is real-hook output not a stub.

### #3 — Hook output `--- raw events ---` to verbose-only

- `packages/cli/src/bin-pre-tool-use.ts` — main user-facing renderer
  (line 320-340 area wraps in `hookSpecificOutput`); the visible-to-user
  block is rendered separately and includes `--- raw events ---` and
  `--- hookSpecificOutput ---` sections.
- `bin-user-prompt-submit.ts` and `bin-post-tool-use.ts` share renderer
  helpers (need to grep for the exact source of the `--- raw events ---`
  string).
- Hook bins are invoked by Claude Code, not user-CLI → no `--verbose`
  flag possible. Use env var `TEAMAGENT_HOOK_VERBOSE=1` instead.
- Default behaviour after fix: only the three-line warning block (title /
  fix / confidence). Set env=1 to see the JSON sections.

### #4 — `demo hook Write field=a;b=c` parser bug

```
packages/cli/src/commands/demo-hook.ts:154-173
  export function parseDemoHookArgs(args: string[]): DemoHookOptions | null {
    if (args.length === 0) return null;
    const toolName = args[0]!;
    const toolInput: Record<string, unknown> = {};

    for (const a of args.slice(1)) {
      const idx = a.indexOf("=");
      if (idx < 0) continue;
      const k = a.slice(0, idx);
      const v = a.slice(idx + 1);
      try { toolInput[k] = JSON.parse(v); } catch { toolInput[k] = v; }
    }

    return { toolName, toolInput, tool: toolName, input: toolInput };
  }
```

Bug: the `for` loop iterates argv slots, so
`teamagent demo hook Write "file_path=a;content=b"` produces a single
slot `"file_path=a;content=b"` → `k="file_path", v="a;content=b"`.

Fix shape:
1. After the existing `idx = a.indexOf("=")` parse, also detect a JSON
   short-circuit: if the first arg after `toolName` starts with `{`, parse
   the whole rest as JSON-stringified arg.
2. After single-pair parse, scan `v` for unescaped `;` or `&` and split
   into additional `k=v` pairs (still scoped to the same argv slot).
3. Update help string at `bin.ts:1098-1099` to advertise both syntaxes.

Test cases to add:
- `demo hook Write file_path=a content=b` (existing space-separated, must
  still work)
- `demo hook Write 'file_path=a;content=b'` (new ; separator)
- `demo hook Write 'file_path=a&content=b'` (new & separator)
- `demo hook Write '{"file_path":"a","content":"b"}'` (JSON form)

### #5 — `init` 0-pack still emits 30+ line pack-prompt block

```
packages/cli/src/commands/init.ts:399-424   step generation
packages/cli/src/commands/init.ts:1286-1288 stdout emit:
    if (result.packPrompt && result.packPrompt.length > 0) {
      lines.push("");
      lines.push(result.packPrompt);
      …
    }
```

`renderPackPromptBody` runs unconditionally when `available` is read; the
self-contradicting "已生成 v1 markdown prompt（无 pack 可用）" + 30-line
block comes out anyway. Fix: in the 0-pack branch (`available.length === 0
&& !dryRun`), skip `renderPackPromptBody`, set `packPrompt = ""` and use
the okStep message `ℹ️  暂无 stack packs 可用（teamagent pack list 查看）`.

Test: extend `init.test.ts` with a 0-pack stub fixture, assert stdout
**lacks** the line `<!-- teamagent-pack-prompt v1 -->` and **contains**
the new single-line notice.

### #6 — `bug-report --stdout` lacks "where to paste"

```
packages/cli/src/commands/bug-report.ts:8     stdout?: boolean
packages/cli/src/commands/bug-report.ts:24-30 parseBugReportArgs
packages/cli/src/commands/bug-report.ts:58-65 stdout/file branch
```

Final lines today end at "Notes:". Fix:
- In stdout mode, append a footer block with the issue-new URL.
- In stdout mode, suppress the `## Summary` blank template (users fill that
  in the issue body, not in the report).
- In file mode (default), keep current behaviour — the file is meant to be
  attached, not pasted, so no footer.

### #7 — `doctor --fix` help text is circular

```
packages/cli/src/bin.ts:1117-1118
  "  teamagent doctor [--fix] [--json]",
  "                                   诊断安装环境(...)",
  "                                   --fix: 自动修复能自动修的问题",
```

The phrase "自动修复能自动修的问题" is circular and gives no information.
`doctor.ts:739` shows what `--fix` actually does:
> `fix: "teamagent doctor --fix  （自动剥离旧块）"`

Fix: rewrite the help line to enumerate the categories (legacy
`TEAMAGENT:START` block stripping, hook path refresh, skill remnant
cleanup) and mention the `~/.teamagent/backups/` safety net + `--dry-run`
preview.

## Why one PR

User direction (chat answer to AskUserQuestion): "build one PR will be
good". Trade-off accepted: longer wall-clock PR diff vs. avoiding 3
parallel POSTPR loops. Mitigation:
- Each sub-item has independent §V§ section in `judge.md` so a single
  failing item does not block the others (we can re-dispatch §V<n>).
- Commit boundary: one concept per commit so the squash-merge body lists
  the 7 fixes cleanly.

## Outstanding ambiguity (to clarify before coding)

- **Top-level `demo` enumeration in `--help`**: do we keep `demo` as the
  recommended 30-sec entry (since it's already wired) and demote the new
  `try` to a "5-case batch" mode? Or make `try` the new headline and
  demote `demo` to "single-shot manual demo"? The issue treats `try` as
  the new headline. Default: follow the issue, but flag in
  `report.md` for human reviewer.
- **`TEAMAGENT_HOOK_VERBOSE` naming**: does the project already use this
  env var anywhere? Need a grep before commit. Backup name:
  `TEAMAGENT_HOOK_RAW_EVENTS=1`.
- **README sync into release**: is there a release-meta automation that
  already copies files? Need to check `release-meta.json` and any
  `.github/workflows/release-*.yml`. If yes, prefer wiring through the
  automation; if no, do a one-off `git checkout main -- README.md` on the
  release branch and let release-meta sync handle it next cut.

These three ambiguities go to `judge.md §Pre-flight` — resolve via
`claudefast -p` probes before writing code.

## See also

- `docs/plans/2026-05-09-issue-174-newuser-ux-plan.md` — the plan.
- `docs/plans/issue-174/judge.md` — the judge harness playbook.
- `docs/HOWTO-PLAN-PR.md` — planning rules.
