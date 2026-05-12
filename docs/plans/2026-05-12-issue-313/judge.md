# Judge harness — issue #313 auto-update for every user

> Third-party verification per `docs/PLAN-RESEARCH-REPORT.md` 三段铁律的第三段。
> Spec：a ton of JSON dump + grep anchors + LLM-judgeable rubric。**永远不基于 internal reasoning 判 PASS/FAIL**，只看 captured evidence。

## V1 — Network capture (PR-CI gate)

### Setup

Fresh tmp directory，**显式不设**:
```bash
unset TEAMAGENT_GITHUB_TOKEN GITHUB_TOKEN GH_TOKEN
```

如果在 CI runner 上跑，需要 instrumented `https.get` 钩子或 mitmproxy（`gh-actions` 上首选 instrumented wrapper；本地首选 mitmproxy with `--mode reverse:https://api.github.com@8443` + iptables redirect）。

### Steps

```bash
# 1. fresh install (用 PR 构建的 tarball or npm dist-tag)
npm install -g <tarball-or-dist-tag>

# 2. baseline status capture
teamagent update --status > step2-status.json

# 3. trigger version-check (foreground)
teamagent update --check 2>&1 | tee step3-check.log

# 4. trigger SessionStart hook ×5 to exercise background updater
for i in 1 2 3 4 5; do
  node "$(npm root -g)/teamagent/dist/bin-session-start.cjs" < /dev/null
done

# 5. dump outbound HTTP capture
cat http-capture.jsonl | jq '.' > step5-http-capture.json

# 6. final status
teamagent update --status > step6-status.json
```

### PASS conditions (all must hold)

```jsonc
{
  "v1_pages_or_npm_called": true,           // ≥1 request to libz-renlab-ai.github.io OR registry.npmjs.org
  "v1_zero_api_github_calls": true,         // 0 requests to api.github.com/*
  "v1_zero_raw_github_calls": true,         // 0 requests to raw.githubusercontent.com/*
  "v1_status_shows_latest": true,           // step6-status.json contains last_installed_version >= latest_version
  "v1_check_log_clean": true                // step3-check.log does not include "rate limit" or "ENOTFOUND api.github.com"
}
```

### Grep anchors (LLM-judgeable, case-insensitive)

| Anchor | Required in | Negative example (FAIL) |
|--------|-------------|--------------------------|
| `libz-renlab-ai.github.io/TeamBrain/latest.json` | step5-http-capture.json | (absence = FAIL) |
| `api.github.com` | step5-http-capture.json | **MUST be ABSENT**; if present anywhere → FAIL |
| `rate limit` | step3-check.log | **MUST be ABSENT**; presence = FAIL |
| `up-to-date` OR `update available` OR `npm i -g teamagent` | step3-check.log | one of these required |

## V2 — Multi-environment matrix (PR review)

5 个环境分别跑 V1，列表 + 期望 PASS 条件：

| Env | Setup | Expected source | Tier-3 fires? |
|-----|-------|----------------|----------------|
| direct | unrestricted internet | `pages` | No |
| corporate proxy | `HTTPS_PROXY=http://127.0.0.1:3128` (squid) | `pages` (through proxy) | No |
| mobile throttle | `tc qdisc add` 100kbps | `pages` (slow but ok) | No |
| api-blocked | iptables drop `api.github.com:443` | `pages` (Tier 1 不依赖 api) | No |
| npm-blocked | iptables drop `registry.npmjs.org:443` | `pages` (用不到 Tier 2) | No |
| pages+npm 双挂 | iptables drop both | `null` (V4 测试) | **Yes** |

### V2 PASS

```jsonc
{
  "v2_direct": "PASS",
  "v2_corp_proxy": "PASS",
  "v2_mobile": "PASS",
  "v2_api_blocked": "PASS",
  "v2_npm_blocked": "PASS"
}
```

## V3 — Volume test (PR-CI gate)

```bash
START_TS=$(date +%s)
for i in $(seq 1 200); do
  teamagent update --check 2>&1 | tee -a v3-check-${i}.log
done
END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

# Grep: count rate-limit-shaped failures
COUNT_RATE_LIMIT=$(grep -c "rate limit" v3-check-*.log || echo 0)
COUNT_403=$(grep -c "HTTP 403" v3-check-*.log || echo 0)
COUNT_BACKOFF=$(grep -c "backoff active" v3-check-*.log || echo 0)

cat <<EOF > v3-verdict.json
{
  "elapsed_sec": $ELAPSED,
  "iterations": 200,
  "rate_limit_hits": $COUNT_RATE_LIMIT,
  "http_403_hits": $COUNT_403,
  "backoff_messages": $COUNT_BACKOFF
}
EOF
```

### V3 PASS

```jsonc
{
  "v3_rate_limit_hits": 0,            // strict 0
  "v3_http_403_hits": 0,              // strict 0
  "v3_backoff_messages": 0,           // strict 0
  "v3_elapsed_under_600s": true       // 10 min wall budget
}
```

## V4 — Tier 3 readability (人工 review 或 LLM judge)

### Setup
Mock Pages + npm 双挂：

```bash
sudo iptables -A OUTPUT -d libz-renlab-ai.github.io -j DROP
sudo iptables -A OUTPUT -d registry.npmjs.org -j DROP
teamagent update --check 2>&1 > v4-tier3-output.log
node "$(npm root -g)/teamagent/dist/bin-session-start.cjs" < /dev/null 2>&1 > v4-banner-output.log
```

### V4 PASS conditions

Output 必须包含（grep anchors，case-insensitive）：

| Anchor | Required |
|--------|----------|
| `npm i -g teamagent@latest` 或 `npm install -g teamagent` | ✅ at least one |
| `TEAMAGENT_GITHUB_TOKEN` | ✅ |
| `Pages:` 或 `pagesReason` | ✅ |
| `npm:` 或 `npmReason` | ✅ |

Output 必须**不**包含：

| Anti-anchor | Forbidden |
|-------------|-----------|
| `GitHub anonymous rate limit exhausted` | ❌ (内部术语) |
| `consecutive_rate_limits` | ❌ |
| `next_check_after_ts` | ❌ |

### V4 JSON dump

```jsonc
{
  "v4_has_npm_recovery_path": true,
  "v4_has_token_advanced_path": true,
  "v4_names_pages_failure": true,
  "v4_names_npm_failure": true,
  "v4_no_internal_jargon": true
}
```

## Overall verdict shape (LLM judge eats this)

```jsonc
{
  "issue": 313,
  "pr": "<pr-number>",
  "runner": "<hostname/runId>",
  "captured_at": "<ISO>",
  "v1": { "pass": true, "details": { ... } },
  "v2": { "pass": true, "matrix": [ ... ] },
  "v3": { "pass": true, "iterations": 200, "rate_limit_hits": 0 },
  "v4": { "pass": true, "tier3_text": "<verbatim>" },
  "evidence_files": ["step3-check.log", "step5-http-capture.json", "v3-verdict.json", "v4-tier3-output.log"],
  "overall": "PASS"
}
```

LLM judge **only** reads `overall` + flattens the four `pass` booleans. Any single sub-fail → `overall: FAIL`，driver 继续 PR-PLAN fix loop。

## Out of judge scope (acknowledged)

- 真陌生人 hour-level dogfood — 那是 #122/#326/#327 epic 的事。
- Windows-specific 录音 default → 是 #297 的事。
- Recording 命名空间 → 是 #296 的事。
- `Publish per 10 PRs` 节奏 → 不在 #313 范围。

## 与 CI gate 的耦合

PR CI 必须把 V1 + V3 跑通才能 squash-merge（grill 评论 operating constraint 写的）。V2 和 V4 在 PR review 时人工或 follow-up CI 跑一次留档即可。

`docs/feature-verification.md` gate：在 commit message 与 PR body 中写明「如何验证」时引用本 judge.md。
