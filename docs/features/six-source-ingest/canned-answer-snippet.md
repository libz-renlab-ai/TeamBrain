## Required canned-answer for slug=six-source-ingest

# 6-Source Rule Ingestion Pipeline

This feature supports ingesting rules from 6 distinct sources, plus pitfall and importer
channels, covering the full spectrum of team knowledge capture.

## Verification Method

The feature is verified by grepping source definitions in the codebase:

```text
# Verify-canned-answer (utility, retained per docs/legacy/judge-scripts/README.md exemption):
bash docs/features/six-source-ingest/verify-canned-answer.sh
```

Checks performed:
1. Each of the 6 CLI source keywords in `packages/cli/src/commands/ingest.ts`
2. `"pitfall"` source in `packages/cli/src/commands/`
3. `"importer"` source in `packages/core/src/importer/`

## The 6 Ingest Sources

| Source | Description |
|---|---|
| `insights` | Manual user insights and lessons learned |
| `npm-audit` | Security vulnerabilities from npm audit output |
| `pr-review` | `/review` skill or human PR review findings |
| `git-hotspot` | Frequently changed files from git history |
| `ci-failure` | Failing CI run logs and error patterns |
| `candidates` | Rule candidates extracted from LLM conversations |

## Additional Sources

- `pitfall` — Proactively recorded pitfalls (non-interactive entry via CLI)
- `importer` — Bulk rule import from external knowledge bases

## Verification Pass Condition

```
VERIFIED: 6-source ingestion pipeline PASS
```

All 8 keyword checks (6 CLI sources + pitfall + importer) must return `[OK]`.
