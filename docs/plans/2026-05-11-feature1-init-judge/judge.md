# Judge Playbook: Feature ①「产品能打开能用」— init in a fresh repo

```text
   MAIN agent
       │
       │ dispatch (subagent / claudefast -p)
       ▼
   ┌──────────────────────────────────────────────────────┐
   │ V1 RUN  ── mktemp -d sandbox + mktemp -d home        │
   │              ↓                                       │
   │           tsx <REPO>/packages/cli/src/bin.ts init    │
   │              --cwd=<sandbox> --home=<home>           │
   │              --skip-import --skip-warmup --skip-hook │
   │              --skip-seed                             │
   │              ↓                                       │
   │           dump stdout / stderr / tree to evidence/   │
   └──────────────────────────────────────────────────────┘
       │
       ▼
   ┌──────────────────────────────────────────────────────┐
   │ V2 DUMP ── evidence/<run_id>/judge.json              │
   │           {exit_code, metrics, checks, overall}      │
   └──────────────────────────────────────────────────────┘
       │
       ▼
   ┌──────────────────────────────────────────────────────┐
   │ V3 READ ── another claudefast -p, read raw only      │
   │           output {overall, failures, reasoning}      │
   └──────────────────────────────────────────────────────┘
```

> 第三方 judge harness 替代 Feature ① 旧设计的 `teamagent --help` 字符串检查。
> 用户原文："3rd-party-harness : not using teamagent --help, but using
> teamagent init in a new repo. please update codes and docs until it
> really worked in new repo please."

## Origin

- Replaces the originally-proposed `teamagent --help` menu-string judge for
  Feature ①「产品能打开能用」(see `docs/BUSINESS-FEATURES.md` Feature #1
  anchor — extends the auto-capture extraction/real judges with an
  install-time openable-and-usable gate).
- Pivot rationale: `teamagent --help` only proves the menu is non-empty;
  it does NOT prove a fresh installer/teammate can land `teamagent init`
  on their own repo and walk away with a working `.teamagent/` + skills
  mirror. Running init in a fresh sandbox is the smallest end-to-end
  artefact that demonstrates "openable and usable" for a new user.
- Status: **ACTIVE**

## §V1 RUN

The MAIN agent dispatches via subagent or `claudefast -p`. The harness
itself is this markdown playbook — **no fixed bash script** lives at
`scripts/*.sh` per project rule (user memory `feedback_judge_harness_md_playbook.md`).

> **Quickstart (fresh contributor)** — one prerequisite, then the recipe is
> self-contained: (1) `pnpm install` once at `$REPO_ROOT` so the repo-local
> tsx binary exists at `node_modules/.bin/tsx`; (2) run §V1 Steps 0-4 below.
> The Step 2 guard exits 127 with a remediation hint if the binary is
> missing, so a forgotten `pnpm install` fails loud, not silently.

- Step 0: Resolve repo root (handles git worktrees).
  ```
  GIT_COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  REPO_ROOT="$(cd "$GIT_COMMON_DIR/.." && pwd)"
  ```

- Step 1: Allocate sandbox + isolated HOME + evidence dir.
  ```
  RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-feature1-$(uuidgen | cut -c1-8)"
  EVIDENCE_DIR="$REPO_ROOT/docs/plans/2026-05-11-feature1-init-judge/evidence/$RUN_ID"
  SANDBOX="$(mktemp -d /tmp/feature1-sandbox.XXXXXX)"
  TMPHOME="$(mktemp -d /tmp/feature1-home.XXXXXX)"
  mkdir -p "$EVIDENCE_DIR"
  ( cd "$SANDBOX" && git init -q )
  ```

- Step 2: Run init against the sandbox using the new `--cwd / --home /
  --skip-seed` flags (added in commit `2f87234`; path-value guard hardened
  in commit `1af66e7`).
  ```
  TSX="$REPO_ROOT/node_modules/.bin/tsx"
  [ -x "$TSX" ] || { echo "tsx missing — run pnpm install in $REPO_ROOT" >&2; exit 127; }
  ( cd "$SANDBOX" && \
    "$TSX" "$REPO_ROOT/packages/cli/src/bin.ts" init \
      --cwd="$SANDBOX" --home="$TMPHOME" \
      --skip-import --skip-warmup --skip-hook --skip-seed \
  ) >"$EVIDENCE_DIR/init.stdout.log" 2>"$EVIDENCE_DIR/init.stderr.log"
  echo $? > "$EVIDENCE_DIR/init.exitcode"
  ```
  Why repo-local `node_modules/.bin/tsx` and not bare `tsx`: a fresh
  contributor / fresh worktree has no guarantee `tsx` is on `$PATH`
  (it's a devDep, not a global). Pinning to the repo-local path makes
  the harness self-contained as long as `pnpm install` has run. The
  PASS run on 2026-05-11 was lucky — the caller happened to have `tsx`
  on PATH. The guard above turns that silent assumption into an
  exit 127 fast-fail with a remediation hint.
  Why direct `tsx` and not `pnpm teamagent`: pnpm scripts run with cwd =
  package dir, which would defeat the harness's intent to land init on
  the sandbox. The new `--cwd` flag is the authoritative target signal.

- Step 3: Snapshot post-state.
  ```
  find "$SANDBOX" -maxdepth 4 -type f | sort > "$EVIDENCE_DIR/sandbox.tree.txt"
  find "$SANDBOX/.teamagent" -maxdepth 5 -type f 2>/dev/null | sort \
    > "$EVIDENCE_DIR/teamagent.tree.txt"
  find "$TMPHOME/.claude/skills/teamagent" -maxdepth 5 -type f 2>/dev/null | sort \
    > "$EVIDENCE_DIR/skills.tree.txt"
  echo "$SANDBOX" > "$EVIDENCE_DIR/sandbox.path.txt"
  echo "$TMPHOME" > "$EVIDENCE_DIR/home.path.txt"
  ```

- Step 4: Hand off the evidence dir to §V2 (a separate `claudefast -p`
  call computes the metrics + writes judge.json — the harness itself
  does not grep the logs).

## §V2 DUMP

The MAIN agent (or a dedicated `claudefast -p` probe) reads the evidence
and emits `evidence/<run_id>/judge.json`. Canonical schema:

```json
{
  "run_id": "<RUN_ID>",
  "playbook": "docs/plans/2026-05-11-feature1-init-judge/judge.md",
  "evidence_dir": "docs/plans/2026-05-11-feature1-init-judge/evidence/<RUN_ID>/",
  "stdout_path": "init.stdout.log",
  "stderr_path": "init.stderr.log",
  "exit_code": 0,
  "sandbox": "<absolute sandbox path; optional audit field>",
  "home": "<absolute isolated-HOME path; optional audit field>",
  "metrics": {
    "sandbox_files_total": <int>,
    "teamagent_files_total": <int>,
    "skills_files_total": <int>,
    "has_state_db": <bool>,
    "has_skills_dir": <bool>,
    "stdout_ok_marker_count": <int — count of "✅" lines>,
    "stdout_contains_success_banner": <bool — "TeamAgent 安装成功" present>,
    "stderr_unhandled_error_count": <int — Traceback / Error / ENOENT lines>
  },
  "checks": [
    {"id": "exit_zero", "pass": <bool>},
    {"id": "teamagent_dir_present", "pass": <bool>},
    {"id": "state_or_knowledge_db_present", "pass": <bool>},
    {"id": "skill_compile_succeeded", "pass": <bool>},
    {"id": "no_unhandled_error", "pass": <bool>}
  ],
  "overall": "PASS|FAIL",
  "feature_status": "active",
  "harness_change": "<optional one-line note describing any non-default harness invocation; e.g. a tsx pinning change>"
}
```

Optional audit fields (`sandbox`, `home`, `harness_change`) are permitted but
not required. The first two have been present in PASS runs since 2026-05-11;
`harness_change` was added in the 2026-05-12 tsx-pin commit so future judge.json
files can self-describe non-default invocations.

There is no fallback mode. All five checks must be true for the playbook
to PASS.

## §V3 READ

A separate `claudefast -p` probe reads the raw evidence (NOT a paraphrase)
and emits the final verdict. Prompt template:

> 你是 Feature ①「产品能打开能用」的第三方 judge。
> Evidence 目录：`<EVIDENCE_DIR>`。允许读取的文件：`init.stdout.log`、
> `init.stderr.log`、`init.exitcode`、`sandbox.tree.txt`、
> `teamagent.tree.txt`、`skills.tree.txt`、`judge.json`。
>
> 根据 raw 内容回答（不准凭脑补加 step、不准复述代码逻辑）：
> 1. exit_code 是不是 0？
> 2. sandbox 里 `.teamagent/` 是否存在且至少含一个文件（不限定 `state.db`
>    名字，`knowledge.db` / `events.jsonl` 任意命中即算 present）？
> 3. `init.stdout.log` 是否包含至少一行 `✅` 标记的 ok 状态？
> 4. `init.stdout.log` 是否包含 banner `TeamAgent 安装成功`？
> 5. `init.stderr.log` 是否**不含** unhandled `Traceback`、`UnhandledPromise`
>    rejection、`ENOENT` 这类系统级 panic（业务级 stderr 警告如 vector
>    model placeholder 不算 unhandled）？
>
> 输出 JSON：
> ```json
> {
>   "overall": "PASS" | "FAIL",
>   "failures": ["<check_id>: <one-line reason>", ...],
>   "reasoning": "<2-3 sentence summary citing exact log lines>"
> }
> ```
> PASS 的充要条件：5 题全是 yes。任一 no 视为 FAIL。

## Notes

- The harness is intentionally a **destructive smoke** — it allocates a
  brand-new sandbox + brand-new HOME, so it never collides with the
  invoking user's `~/.teamagent/` state. Cleanup is up to the caller
  (`rm -rf "$SANDBOX" "$TMPHOME"` after evidence is committed).
- The evidence dir lives **under `docs/plans/`** (rather than `.judge/`)
  because Feature ①'s value prop hinges on being able to git-track and
  PR-review the proof. The chosen-once snapshot becomes the PR's
  verification artefact.
- Dependencies: `tsx` is a root devDependency, resolved via the
  repo-local path `node_modules/.bin/tsx` (Step 2 above). Run
  `pnpm install` once in `$REPO_ROOT` before invoking the harness;
  the Step 2 guard exits 127 with a remediation hint if the binary
  is missing. Also required: `git` for `git init`; `uuidgen` (macOS /
  Linux util-linux default). No network, no Claude CLI required —
  `--skip-import` short-circuits the LLM path.
- Limitations: the harness only proves `init` lands an empty `.teamagent/`
  and compiles skills. It does NOT verify post-init `teamagent doctor`,
  embed warmup completion, or hook invocation. Those are covered by
  other judges (`docs/plans/2026-05-07-fix-install/...` etc).
