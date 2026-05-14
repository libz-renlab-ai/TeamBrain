```
              judge.md — BPP Milestone 2 acceptance harness (md playbook)
              ===========================================================

   §V1 RUN ──► fixed commands, captured to evidence_dir
        │      drives the USER-FACING surface (collector pipeline + curl +
        │      teamagent CLI), NOT library imports — a passing unit test
        │      ≠ a wired-up feature
        ▼
   §V2 DUMP ──► canonical JSON at .judge/<run_id>/judge.json
        │       schema: exit_code / metrics / evidence_dir
        ▼
   §V3 READ ──► separate claudefast -p reads JSON ONLY, grades PASS/FAIL
                never the agent that wrote the code

   Hard rule (docs/PR-PLAN.md): third-party judge harness forbids fixed
   scripts; this is an md playbook. Failed slices rerun by re-dispatching
   §V<n>, NOT by editing a script.
```

# judge.md — BPP Milestone 2 (对话上传通道) Acceptance Harness

Verifies **里程碑二 · 对话上传通道** of the frozen acceptance contract
`docs/plans/2026-05-13-bpp-full-system-acceptance.md` §里程碑二 (lines 92-126).

**Why this harness exists.** The M2 conversation-upload backend was reported
"~70% done" — collector hook, uploader daemon, retry queue, and the
`POST /v1/cc-sessions` server endpoint all exist and are unit-tested. But a
grep + Read audit of the actual pipeline found the user-facing guarantees
of §里程碑二 are **not wired end-to-end**:

- **L1 redaction is not in the pipeline.** `tap-session.ts` copies the raw
  transcript verbatim; `uploader.ts` only gzip+base64+POSTs. The redactor
  functions (`detectSensitiveText` / `redactSensitiveText`) exist in
  `@teamagent/core` but are called nowhere in `packages/digital-twin`.
- **No server-side L2 scan.** The `/v1/cc-sessions` POST handler decodes
  and writes the transcript with no second-layer scan and no alert.
- **No encrypted transport / token auth on the upload path.** `mock-server.ts`
  (which `bin-prod-server.ts` wraps verbatim as the production server) binds
  plain HTTP and validates no `Authorization` header. Reusable
  `bpp/https-server.ts` + `bpp/auth-gate.ts` modules exist but are not wired
  into the cc-session upload server.
- **No member self-view stats.** There is no endpoint and no CLI for a
  member to see "已上传对话总量 / 最近一次上传时间 / 敏感字段被模糊化次数".

This playbook turns §里程碑二's 8-step 验证方法 plus the 质量验收 gates into a
mechanically-runnable contract so no future PR can re-declare M2 "done" by
prose alone.

**Design rule — drive the user-facing surface.** §里程碑二 验证方法 has a
third party install collectors, work with the assistant, then "登录中心服务
对话仓库" and inspect. So §V1 drives the **collector→upload pipeline**, `curl`
against the running server, and the `teamagent` CLI — NOT
`@teamagent/digital-twin` library imports. A guarantee whose user-facing
path does not exist **FAILs** — that is the signal, not a bug in the harness.
Library-layer vitest runs are kept as informational cross-checks only.

`<run_id>` convention: `${ISO_DATE}-bpp-m2` (e.g. `2026-05-14-bpp-m2`).

## §V1 RUN — fixed commands

Capture stdout + stderr to `evidence_dir = .judge/<run_id>/evidence/`.
Each slice maps to numbered steps of §里程碑二 验证方法 and 质量验收 gates.

Several slices need a running server. Start ONE shared instance and reuse it:

```
0.  # shared fixture — a clean output dir + a server bound to a known port.
    #   BPP_AUTH_TOKEN is set so the §V1.B token-auth probes are meaningful;
    #   slices that pre-date PR-M2-auth simply observe it is ignored.
    export M2_OUT="$(mktemp -d)/cc-repo"
    export M2_PORT=8092
    export BPP_AUTH_TOKEN="m2-judge-token"
    pnpm teamagent bpp serve --port "$M2_PORT" --dir "$M2_OUT" \
      > evidence_dir/0-server.log 2>&1 &
    echo "server_pid=$!" > evidence_dir/0-server-pid.txt
    sleep 2   # let it bind
```

### §V1.A — Collector ships + L1 redaction (功能验收 96-99 · 验证 steps 1-3, 6)

```
1.  # step 1 — the local collector ("本机收集器") ships and is wired into the
    #   Claude Code Stop hook by `teamagent install-hook`. Probe: the install
    #   path references the digital-twin tap entry.
    grep -rnE 'bin-digital-twin-tap|digital-twin-tap' \
      packages/cli/src/commands/install-hook.ts \
      packages/cli/src/commands/install-user-hook.ts \
      > evidence_dir/A-collector-wired.txt 2>&1
    echo "grep_exit=$?" >> evidence_dir/A-collector-wired.txt

2.  # steps 3+6 — L1 redaction. "上传前做本机敏感信息扫描 ... 命中的字段就地
    #   模糊化，原文不出本机". The redact MUST happen in the uploader daemon
    #   (off the Stop-hook path — see §V1.A step 4). Probe: the uploader wires
    #   a real redactor before it builds the wire envelope.
    grep -nE 'redactSensitiveText|detectSensitiveText|@teamagent/core' \
      packages/digital-twin/src/daemon/uploader.ts \
      > evidence_dir/A-uploader-redacts.txt 2>&1
    echo "grep_exit=$?" >> evidence_dir/A-uploader-redacts.txt

3.  # step 3 — Chinese national-ID coverage. 验证 step 3 explicitly embeds
    #   "模拟身份证号". The core redactor regex table must carry an 18-digit
    #   Chinese ID pattern, or step 3's sample passes L1 untouched.
    grep -nE 'd\{17\}|身份证|national.?id|chinese.?id|resident.?id' \
      packages/core/src/pii/redactor.ts \
      > evidence_dir/A-chinese-id-regex.txt 2>&1
    echo "grep_exit=$?" >> evidence_dir/A-chinese-id-regex.txt

4.  # 质量验收 — "收集器对响应延迟的影响不超过 5 毫秒". Structural guarantee:
    #   redaction must NOT run on the Stop-hook path (tap-session.ts). The hook
    #   does only copyFileSync + detached spawn; redaction lives in the daemon.
    #   grep_exit=1 (NO match) here is the PASS signal.
    grep -nE 'redactSensitiveText|detectSensitiveText|scanForSecrets' \
      packages/digital-twin/src/hooks/tap-session.ts \
      > evidence_dir/A-hook-path-clean.txt 2>&1
    echo "grep_exit=$?" >> evidence_dir/A-hook-path-clean.txt

5.  # 质量验收 — recall >= 95% on a prepared "含密钥的对话样本". The fixture
    #   + test ship with PR-M2A: a transcript JSONL seeded with N known
    #   sensitive strings; the test asserts redaction recall >= 0.95 and
    #   prints `recall=<float>`. Before PR-M2A this file does not exist —
    #   the run records the missing-file error, which §V2 maps to recall 0.
    npx vitest run packages/digital-twin/src/daemon/__tests__/l1-recall.test.ts 2>&1 \
      | tee evidence_dir/A-l1-recall.log

6.  # informational cross-check — uploader/redaction library suite.
    npx vitest run packages/digital-twin/src/daemon/__tests__/uploader.test.ts 2>&1 \
      | tee evidence_dir/A-uploader-vitest.log

7.  # steps 1+2 — AGENT-MANUAL. "在三台不同的机器上装收集器 ... 各自跟智能
    #   助手工作半天（不少于 20 场对话）". A real 3-machine, half-day dogfood
    #   cannot be agent-self-certified (cf. M1 row C2). Graded MANUAL in §V3 —
    #   a human attaches per-machine evidence, or it stays UNVERIFIED.
    echo "AGENT-MANUAL: see §V3 row A2" > evidence_dir/A-3machine-manual.txt
```

### §V1.B — Encrypted transport + token auth (功能验收 100-101)

```
1.  # "上传走加密传输通道". The production server must be able to serve the
    #   cc-session endpoint over TLS. Probe spans BOTH files in the TLS path:
    #   bin-prod-server.ts must read the HTTPS_KEY_PATH/HTTPS_CERT_PATH env and
    #   build a `tls` config; mock-server.ts must reuse the plain-HTTP request
    #   listener over TLS via `wrapServerWithHttps`. grep_exit=0 (a match in
    #   either file) == the TLS path is wired end-to-end.
    grep -nE 'HTTPS_KEY_PATH|HTTPS_CERT_PATH|wrapServerWithHttps|opts\.tls' \
      packages/digital-twin/src/bin-prod-server.ts \
      packages/digital-twin/src/mock-server.ts \
      > evidence_dir/B-prod-tls.txt 2>&1
    echo "grep_exit=$?" >> evidence_dir/B-prod-tls.txt

2.  # "中心服务端 ... 校验来源身份令牌". Probe: the upload server validates a
    #   Bearer token via the reusable bpp/auth-gate.ts requireBearerToken.
    grep -nE 'requireBearerToken|auth-gate|BPP_AUTH_TOKEN' \
      packages/digital-twin/src/mock-server.ts \
      > evidence_dir/B-token-wired.txt 2>&1
    echo "grep_exit=$?" >> evidence_dir/B-token-wired.txt

3.  # behavioural probe — with BPP_AUTH_TOKEN set, a POST /v1/cc-sessions
    #   carrying NO Authorization header must be rejected (401). The same
    #   well-formed envelope WITH the correct Bearer token must be accepted
    #   (200). Both POSTs carry a valid envelope so the only variable is the
    #   token — auth must be checked BEFORE body validation, otherwise the
    #   no-auth case 400s on the body and the probe cannot tell auth apart.
    AUTH_B64="$(printf '{"role":"user","content":"auth probe"}\n' \
      | gzip | base64 | tr -d '\n')"
    AUTH_BODY="{\"schema_version\":1,\"envelope\":{\"user_id\":\"m2-judge-auth\",\"session_id\":\"m2-judge-auth-001\",\"captured_at\":\"2026-05-14T09:00:00.000Z\"},\"transcript\":{\"compression\":\"gzip+base64\",\"content\":\"${AUTH_B64}\"}}"
    curl -s -o /dev/null -w '%{http_code}' -X POST \
      "http://127.0.0.1:${M2_PORT}/v1/cc-sessions" \
      -H 'content-type: application/json' -d "$AUTH_BODY" \
      > evidence_dir/B-noauth-code.txt 2>&1
    curl -s -o /dev/null -w '%{http_code}' -X POST \
      "http://127.0.0.1:${M2_PORT}/v1/cc-sessions" \
      -H 'content-type: application/json' \
      -H "authorization: Bearer ${BPP_AUTH_TOKEN}" -d "$AUTH_BODY" \
      > evidence_dir/B-auth-code.txt 2>&1
```

### §V1.C — Conversation lands tagged (功能验收 103 · 验证 steps 4-5)

```
1.  # steps 4+5 — "落盘到中心服务的对话仓库，每条带有清晰的成员标识、时间戳、
    #   对话场次编号" / "上传总量等于实际对话场次数". POST a well-formed
    #   cc-session envelope, then confirm a file lands at
    #   <M2_OUT>/<user_id>/<date>/<session_id>.jsonl.
    SID="m2-judge-sess-001"
    TRANSCRIPT_B64="$(printf '{"role":"user","content":"hello"}\n' \
      | gzip | base64 | tr -d '\n')"
    curl -s -X POST "http://127.0.0.1:${M2_PORT}/v1/cc-sessions" \
      -H 'content-type: application/json' \
      -H "authorization: Bearer ${BPP_AUTH_TOKEN}" \
      -d "{\"schema_version\":1,\"envelope\":{\"user_id\":\"m2-judge-zhang\",\"session_id\":\"${SID}\",\"captured_at\":\"2026-05-14T10:00:00.000Z\"},\"transcript\":{\"compression\":\"gzip+base64\",\"content\":\"${TRANSCRIPT_B64}\"}}" \
      > evidence_dir/C-upload-resp.json 2>&1
    find "$M2_OUT" -name "${SID}.jsonl" \
      > evidence_dir/C-landed-file.txt 2>&1
    echo "find_exit=$?" >> evidence_dir/C-landed-file.txt
```

### §V1.D — Server L2 scan + alert (功能验收 102 · 验证 step 8 · 质量验收 113)

```
1.  # "服务端入库前做第二层敏感信息扫描（兜底）". Probe: the /v1/cc-sessions
    #   POST handler wires a real scanner.
    grep -nE 'detectSensitiveText|scanForSecrets|l2.?scan|l2_scan_alert' \
      packages/digital-twin/src/mock-server.ts \
      > evidence_dir/D-l2-wired.txt 2>&1
    echo "grep_exit=$?" >> evidence_dir/D-l2-wired.txt

2.  # step 8 — "故意在本机扫描器里关掉身份证号规则，让一份带身份证的对话上传
    #   上去；验证服务端扫描兜底命中、报警记录已生成". The clean probe does
    #   NOT add a runtime disable-rule switch to the redactor (a security
    #   anti-pattern). Instead it curl-crafts a POST that bypasses the
    #   collector entirely, carrying an UN-redacted fake secret, and verifies
    #   the server-side L2 catches it: an `l2_scan_alert` line appears in
    #   <M2_OUT>/_audit/<date>.jsonl.
    LEAK="AKIAIOSFODNN7EXAMPLE"
    LEAK_B64="$(printf '{"role":"user","content":"my key is %s"}\n' "$LEAK" \
      | gzip | base64 | tr -d '\n')"
    curl -s -X POST "http://127.0.0.1:${M2_PORT}/v1/cc-sessions" \
      -H 'content-type: application/json' \
      -H "authorization: Bearer ${BPP_AUTH_TOKEN}" \
      -d "{\"schema_version\":1,\"envelope\":{\"user_id\":\"m2-judge-li\",\"session_id\":\"m2-judge-leak-001\",\"captured_at\":\"2026-05-14T11:00:00.000Z\"},\"transcript\":{\"compression\":\"gzip+base64\",\"content\":\"${LEAK_B64}\"}}" \
      > evidence_dir/D-leak-upload-resp.json 2>&1
    grep -rnE 'l2_scan_alert' "$M2_OUT"/_audit/ \
      > evidence_dir/D-l2-alert.txt 2>&1
    echo "grep_exit=$?" >> evidence_dir/D-l2-alert.txt

3.  # advisor constraint — the alert must record only the matched RULE KINDS,
    #   never the matched sensitive TEXT. Probe: the fake secret string must
    #   NOT appear anywhere under _audit/. grep_exit=1 (NOT found) is the PASS
    #   signal; grep_exit=0 means the alert itself leaked the secret.
    grep -rnF "$LEAK" "$M2_OUT"/_audit/ \
      > evidence_dir/D-l2-no-plaintext.txt 2>&1
    echo "grep_exit=$?" >> evidence_dir/D-l2-no-plaintext.txt
```

### §V1.E — Retry queue + recovery (质量验收 110 · 验证 step 7)

```
1.  # "上传失败时本机有重试队列，断网恢复后自动补传". Probe: the daemon queue
    #   has a dead-letter path + a persisted first-failure timestamp so a
    #   transient failure is retried, not dropped.
    grep -nE 'dead-letter|deadLetter|first_failed_at|moveToDeadLetter' \
      packages/digital-twin/src/daemon/queue.ts \
      > evidence_dir/E-retry-queue.txt 2>&1
    echo "grep_exit=$?" >> evidence_dir/E-retry-queue.txt

2.  # informational cross-check — queue + uploader retry-classification suite.
    npx vitest run \
      packages/digital-twin/src/daemon/__tests__/queue.test.ts \
      packages/digital-twin/src/daemon/__tests__/uploader.test.ts 2>&1 \
      | tee evidence_dir/E-queue-vitest.log

3.  # step 7 — AGENT-MANUAL. "抓一台机器物理断网 10 分钟". The physical
    #   network partition cannot be agent-self-certified. The retry-queue
    #   MECHANISM is covered by E1/E2 above; the literal 10-minute physical
    #   disconnect + auto-resume is graded MANUAL in §V3 (row E2).
    echo "AGENT-MANUAL: see §V3 row E2" > evidence_dir/E-disconnect-manual.txt
```

### §V1.F — Throughput (质量验收 112)

```
1.  # "上传通道支持 30 人 × 每人每天 50 场 = 每天 1500 场，全部成功落盘".
    #   The throughput test ships with PR-M2-auth: it POSTs 1500 cc-session
    #   envelopes through the running server and asserts all 1500 land on
    #   disk. It prints `landed=<n>/1500`. Before that PR the file does not
    #   exist; the run records the missing-file error → §V2 maps to false.
    npx vitest run packages/digital-twin/src/__tests__/throughput-1500.test.ts 2>&1 \
      | tee evidence_dir/F-throughput.log
```

### §V1.G — Member self-view stats (功能验收 105)

```
1.  # "成员可以查看自己的 已上传对话总量、最近一次上传时间、敏感字段被模糊化
    #   次数". Probe 1: the CLI exposes a `member-stats` subcommand.
    pnpm teamagent digital-twin --help > evidence_dir/G-dt-help.txt 2>&1
    grep -nE 'member-stats' evidence_dir/G-dt-help.txt \
      > evidence_dir/G-cli-cmd.txt ; echo "grep_exit=$?" >> evidence_dir/G-cli-cmd.txt

2.  # Probe 2: GET /v1/member-stats?user= returns the three required fields.
    curl -s "http://127.0.0.1:${M2_PORT}/v1/member-stats?user=m2-judge-zhang" \
      -H "authorization: Bearer ${BPP_AUTH_TOKEN}" \
      > evidence_dir/G-stats-resp.json 2>&1
    grep -nE 'uploaded_total|last_upload_at|redaction_count' \
      evidence_dir/G-stats-resp.json \
      > evidence_dir/G-stats-fields.txt 2>&1
    echo "grep_exit=$?" >> evidence_dir/G-stats-fields.txt
```

### §V1.H — Repo green gate (质量验收 — must stay green)

```
1.  # NOTE: use `--pretty false` explicitly — the bare `pnpm typecheck`
    #   wrapper runs `tsc` with default `--pretty true`, which on this
    #   Windows box deterministically exits 1 with ZERO output even when the
    #   code is clean (tsc 5.9.3 pretty-printer flake; see M1 judge.md §V1.F).
    npx tsc --noEmit -p tsconfig.base.json --pretty false 2>&1 \
      | tee evidence_dir/H-typecheck.log ; echo "exit=${PIPESTATUS[0]}" \
      | tee -a evidence_dir/H-typecheck.log
2.  # digital-twin library suite must stay green. The full packages/cli E2E
    #   suite runs on CI, not locally (CLAUDE.md 测试在哪里跑).
    npx vitest run packages/digital-twin/src 2>&1 \
      | tee evidence_dir/H-vitest.log
9.  # teardown — kill the shared server started in §V1 step 0.
    kill "$(cut -d= -f2 evidence_dir/0-server-pid.txt)" 2>/dev/null || true
```

## §V2 DUMP — canonical JSON

The runner writes `.judge/<run_id>/judge.json`. It emits metric numbers
only — it does **not** decide PASS/FAIL (that is §V3's job). Boolean metrics
are derived from the `grep_exit` / `find_exit` / HTTP-code lines and log
contents captured in `evidence/`.

```json
{
  "run_id": "2026-05-14-bpp-m2",
  "exit_code": 0,
  "metrics": {
    "collector_wired_into_stop_hook": false,
    "uploader_redacts_l1": false,
    "chinese_id_regex_present": false,
    "l1_redaction_off_hook_path": false,
    "l1_redaction_recall": 0,
    "prod_server_supports_tls": false,
    "upload_endpoint_validates_token": false,
    "upload_rejects_missing_token": false,
    "conversation_lands_tagged": false,
    "server_l2_scan_wired": false,
    "l2_alert_recorded": false,
    "l2_alert_no_plaintext": false,
    "retry_queue_exists": false,
    "retry_queue_vitest_exit": 0,
    "throughput_1500_ok": false,
    "cli_has_member_stats_cmd": false,
    "member_stats_endpoint_responds": false,
    "typecheck_exit": 0,
    "vitest_exit": 0
  },
  "evidence_dir": ".judge/2026-05-14-bpp-m2/evidence/"
}
```

Metric derivation rules (so the runner is deterministic):

| metric | derived from | true / value when |
|--------|--------------|-------------------|
| `collector_wired_into_stop_hook` | `A-collector-wired.txt` | `grep_exit=0` |
| `uploader_redacts_l1` | `A-uploader-redacts.txt` | `grep_exit=0` |
| `chinese_id_regex_present` | `A-chinese-id-regex.txt` | `grep_exit=0` |
| `l1_redaction_off_hook_path` | `A-hook-path-clean.txt` | `grep_exit=1` (NO match) |
| `l1_redaction_recall` | `A-l1-recall.log` | the `recall=<float>` line, else `0` |
| `prod_server_supports_tls` | `B-prod-tls.txt` | `grep_exit=0` |
| `upload_endpoint_validates_token` | `B-token-wired.txt` | `grep_exit=0` |
| `upload_rejects_missing_token` | `B-noauth-code.txt` + `B-auth-code.txt` | noauth `401` AND auth `200` |
| `conversation_lands_tagged` | `C-landed-file.txt` | `find_exit=0` and a path was printed |
| `server_l2_scan_wired` | `D-l2-wired.txt` | `grep_exit=0` |
| `l2_alert_recorded` | `D-l2-alert.txt` | `grep_exit=0` |
| `l2_alert_no_plaintext` | `D-l2-no-plaintext.txt` | `grep_exit!=0` (secret NOT found — `1` no match, `2` `_audit/` absent) |
| `retry_queue_exists` | `E-retry-queue.txt` | `grep_exit=0` |
| `retry_queue_vitest_exit` | `E-queue-vitest.log` | vitest process exit code |
| `throughput_1500_ok` | `F-throughput.log` | a `landed=1500/1500` line |
| `cli_has_member_stats_cmd` | `G-cli-cmd.txt` | `grep_exit=0` |
| `member_stats_endpoint_responds` | `G-stats-fields.txt` | `grep_exit=0` (all 3 fields present) |
| `typecheck_exit` | `H-typecheck.log` | the `exit=` line |
| `vitest_exit` | `H-vitest.log` | vitest process exit code |

## §V3 READ — LLM judge (read-only)

A separate `claudefast -p` is dispatched with the prompt below. It reads
ONLY `judge.json` + `evidence/**` — never source, never the agent's word.

### Judge prompt template

```text
You are a third-party PR judge. You are NOT the agent that wrote the code.
You may read ONLY:
  .judge/<run_id>/judge.json
  .judge/<run_id>/evidence/**

Grade each acceptance row as PASS / FAIL / MANUAL with a one-line reason
citing the evidence file you used.

Acceptance rows — 里程碑二 对话上传通道 (acceptance.md §里程碑二):

  A1. Collector ships + Stop-hook wired   metrics.collector_wired_into_stop_hook == true
  A2. 3-machine half-day dogfood          MANUAL — a human attaches per-machine
                                          evidence of 3 collectors + >=20 convos each;
                                          no agent can self-certify this
  B1. L1 redaction before upload          metrics.uploader_redacts_l1 == true
  B2. L1 recall >= 95%                    metrics.l1_redaction_recall >= 0.95
  B3. Chinese national-ID covered         metrics.chinese_id_regex_present == true
  B4. <=5ms latency (redaction off        metrics.l1_redaction_off_hook_path == true
      the Stop-hook path)
  C1. Encrypted transport available       metrics.prod_server_supports_tls == true
  C2. Server validates source token       metrics.upload_endpoint_validates_token == true
                                          AND metrics.upload_rejects_missing_token == true
  C3. Conversation lands tagged           metrics.conversation_lands_tagged == true
      (member id + timestamp + session)
  D1. Server-side L2 scan wired           metrics.server_l2_scan_wired == true
  D2. L2 alert recorded (not silent)      metrics.l2_alert_recorded == true
  D3. L2 alert does not leak the value    metrics.l2_alert_no_plaintext == true
  E1. Retry queue + dead-letter           metrics.retry_queue_exists == true
                                          AND metrics.retry_queue_vitest_exit == 0
  E2. Physical 10-min disconnect recovery MANUAL — a human attaches evidence of a
                                          real network partition + auto-resume;
                                          E1 covers the retry MECHANISM
  F1. Throughput 1500 sessions/day        metrics.throughput_1500_ok == true
  G1. Member self-view stats              metrics.cli_has_member_stats_cmd == true
                                          AND metrics.member_stats_endpoint_responds == true
  H1. Repo green                          metrics.typecheck_exit == 0
                                          AND metrics.vitest_exit == 0

Verdict = PASS only if every one of the 17 rows is PASS. A2 and E2 may be
MANUAL-pending and that still counts toward a PASS verdict; they must only
not be FAIL. Output JSON ONLY, no prose before or after:
{"verdict": "PASS|FAIL", "rows": [{"row": "...", "verdict": "...", "reason": "...", "evidence": "..."}]}
```

### Failure recovery

- FAIL on A1 → the collector is not staged by `install-hook`; wire it.
- FAIL on B1/B2/B3/B4 → L1 redaction is not wired into the uploader daemon
  (PR-M2A). Recovery is implementation work, NOT editing this playbook.
- FAIL on C1/C2 → encrypted transport / token auth is not wired into the
  cc-session upload server (PR-M2-auth). The reusable `bpp/https-server.ts`
  + `bpp/auth-gate.ts` modules exist — wire them, do not rebuild.
- FAIL on C3 → the upload handler does not tag/land conversations correctly;
  fix `mock-server.ts` and re-dispatch §V1.C.
- FAIL on D1/D2/D3 → server-side L2 scan + alert is missing (PR-M2B).
  D3 in particular guards a privacy regression: the alert must record only
  the matched rule kinds, never the matched sensitive text.
- FAIL on E1 → the retry queue regressed; fix it and re-dispatch §V1.E.
- FAIL on F1 → throughput test missing or failing (PR-M2-auth ships it).
- FAIL on G1 → no member-stats endpoint / CLI (PR-M2C).
- FAIL on H1 → a regression; fix it and re-dispatch §V1.H. Never paper over.
- A2 / E2 stay MANUAL until a human attaches the physical-world evidence —
  like M1 row C2, no AI agent can honestly self-certify a 3-machine dogfood
  or a real 10-minute network partition.

## Baseline run — 2026-05-14 against `main` @ 6dab217

Recorded in `.judge/2026-05-14-bpp-m2/` (gitignored transient evidence);
`judge.json` copied into this plan dir as `baseline-judge.json`, the §V3
verdict as `baseline-judge-v3.json`.

**Actual baseline verdict: FAIL — 6 PASS / 2 MANUAL / 9 FAIL.**

Independently re-graded by a process-isolated `claude -p` judge that saw
ONLY `judge.json` + `evidence/**` (no source, no conversation context):
verdict **FAIL**, row-by-row identical to the table below — recorded in
`baseline-judge-v3.json`.

| Row | Verdict | Finding |
|-----|---------|---------|
| A1 collector wired | PASS | `install-hook.ts` stages `bin-digital-twin-tap` into the Stop channel |
| A2 3-machine dogfood | MANUAL | needs a human to attach per-machine evidence (3 collectors, ≥20 convos each) |
| B1 L1 redaction | FAIL | `uploader.ts` calls no redactor — raw transcript is gzip+base64+POSTed verbatim |
| B2 L1 recall ≥95% | FAIL | no `l1-recall.test.ts` fixture/test exists yet (ships in PR-M2A) |
| B3 Chinese ID covered | FAIL | core `redactor.ts` regex table has no 18-digit Chinese national-ID pattern |
| B4 ≤5ms (redaction off hook path) | PASS | `tap-session.ts` has no redact call — the hook does only copy + detached spawn |
| C1 encrypted transport | FAIL | `bin-prod-server.ts` binds plain HTTP; reusable `bpp/https-server.ts` not wired |
| C2 server token auth | FAIL | `mock-server.ts` validates no `Authorization`; no-auth and auth POSTs both 200 |
| C3 conversation lands tagged | PASS | POST landed `m2-judge-zhang/2026-05-14/m2-judge-sess-001.jsonl` (user + date + session) |
| D1 L2 scan wired | FAIL | `/v1/cc-sessions` POST handler runs no second-layer scan |
| D2 L2 alert recorded | FAIL | leak-carrying upload returned `ok:true`; no `_audit/` dir, no `l2_scan_alert` |
| D3 L2 alert no plaintext leak | PASS | the fake secret appears nowhere under `_audit/` (vacuously — no alert exists yet) |
| E1 retry queue + dead-letter | PASS | `queue.ts` has `dead-letter` + `first_failed_at`; queue+uploader vitest 41 pass |
| E2 physical 10-min disconnect | MANUAL | needs a human to attach real network-partition + auto-resume evidence |
| F1 throughput 1500/day | FAIL | no `throughput-1500.test.ts` exists yet (ships in PR-M2-auth) |
| G1 member self-view stats | FAIL | no `member-stats` subcommand in `digital-twin --help`; `/v1/member-stats` empty |
| H1 repo green | PASS | 1292-file typecheck clean (`--pretty false`); digital-twin vitest 584 pass / 6 skip |

The 6 baseline PASS rows are the parts of the M2 backend that DO exist
end-to-end (collector hook, upload-lands, retry queue, repo green) plus the
two privacy-guard rows (B4, D3) that pass vacuously because the feature they
guard is not wired yet — they stay PASS once the feature lands only if the
guarantee actually holds.

Every FAIL row is then a tracked TODO flipped by the M2 PR series; no future
PR can re-declare M2 "done" by prose alone — it must flip these rows by
re-running the matching §V1 slice.

| PR | Scope | Rows it flips |
|----|-------|---------------|
| PR-M2-plan | this judge.md + baseline run | (none — establishes baseline) |
| PR-M2-auth | wire `bpp/https-server.ts` TLS + `bpp/auth-gate.ts` token gate into the cc-session upload server; ship the 1500-throughput test | C1, C2, F1 |
| PR-M2A | `@teamagent/core` dep on digital-twin; uploader daemon redacts before `buildCcSessionEnvelope`; persist `l1_redaction_count` into the envelope; add Chinese 18-digit ID regex to core; ship the L1-recall test | B1, B2, B3, B4 |
| PR-M2B | `/v1/cc-sessions` POST handler runs L2 scan, redacts before write, appends `l2_scan_alert` (rule kinds only) to `_audit/` | D1, D2, D3 |
| PR-M2C | `GET /v1/member-stats?user=` (reads the output-dir tree on demand) + `teamagent digital-twin member-stats` CLI | G1 |
| PR-M2D | M2 judge harness completion run → PASS `judge.json` + `judge-v3.json` | (records the M2 verdict) |

## M2 completion run — 2026-05-14 against `main` @ 3517601

Recorded in `.judge/2026-05-14-bpp-m2/` (gitignored transient evidence);
`judge.json` copied into this plan dir as `m2-pass-judge.json`, the §V3
verdict as `m2-pass-judge-v3.json`.

**Actual M2 verdict: PASS — 15 PASS / 2 MANUAL.**

The 9 baseline FAIL rows were flipped by a 4-PR series, each re-running its
§V1 slice to confirm:

| PR | Scope shipped | Rows flipped |
|----|---------------|--------------|
| #481 PR-M2-auth | `wrapServerWithHttps` TLS + `requireBearerToken` gate wired into the cc-session upload server; `throughput-1500.test.ts` | C1, C2, F1 |
| #482 PR-M2A | `@teamagent/core` dep; uploader daemon L1-redacts before `buildCcSessionEnvelope`; `l1_redaction_count` on the envelope; Chinese 18-digit ID regex; `l1-recall.test.ts` | B1, B2, B3 |
| #483 PR-M2B | `/v1/cc-sessions` POST handler L2-scans, redacts before write, appends `l2_scan_alert` (rule kinds only) to `_audit/` | D1, D2, D3 |
| #484 PR-M2C | `GET /v1/member-stats?user=` + per-session `<id>.meta.json` redaction-count sidecar + `teamagent digital-twin member-stats` CLI | G1 |

Independently re-graded by a process-isolated `claude -p` judge that saw
ONLY `judge.json` + `evidence/**` (no source, no conversation context):
verdict **PASS**, every one of the 17 rows PASS except A2 and E2 which stay
MANUAL-pending (count toward PASS per the §V3 rule). Recorded in
`m2-pass-judge-v3.json`.

**One gap the completion run caught + fixed in PR-M2D.** The §V1.G step 1
probe (`digital-twin --help` must list `member-stats`) FAILed on the first
completion run: PR-M2C added the subcommand to `commands/digital-twin.ts` but
missed the hard-coded `digital-twin` help block in `bin.ts`. That one-line
help-text gap is fixed in this PR — exactly the kind of "wired but not
discoverable" gap the harness exists to catch.

**Two notes carried forward:**

1. **A2 / E2 still need a human.** "3-machine half-day dogfood" and "physical
   10-minute disconnect + auto-resume" cannot be agent-self-certified — like
   M1 row C2, a human must attach the physical-world evidence. They are the
   two outstanding M2 items and are BLOCKED-ON-HUMAN by design, not code gaps.
2. **B4 / D3 are no longer vacuous.** At baseline these privacy-guard rows
   passed because the feature they guard did not exist. They now pass on the
   real guarantee: `tap-session.ts` still carries no redaction call (redaction
   lives in the detached uploader daemon), and the `l2_scan_alert` event
   records only `matched_rule_kinds`, never the matched secret text.
