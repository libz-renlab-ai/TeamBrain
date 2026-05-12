# Benchmark Report — 2026-05-12

**Config**: 2 groups × runs=1

## Summary

| Group | Wrong | Correct | Neither | Error | in | out | cache_read | cache_create | total | Avg Duration |
|---|---|---|---|---|---|---|---|---|---|---|
| teamagent | 17 | 0 | 0 | 0 | 386 | 18105 | 1004468 | 40795 | 1063754 | 19351ms |
| teamagent-disabled | 17 | 0 | 0 | 0 | 370 | 18981 | 956094 | 41160 | 1016605 | 21532ms |

**PRR**: 0.0%
**Token Delta**: 0.0%
**Duration Delta**: 0.0%

## Per-Task Breakdown

- [teamagent] 001-moment-vs-dayjs run=1 → **wrong** (13144ms, matched wrong: from ['"]moment['"])
- [teamagent] 002-axios-cancel run=1 → **wrong** (13374ms, matched wrong: CancelToken)
- [teamagent] 003-react-key run=1 → **wrong** (13880ms, matched wrong: key=\{index\})
- [teamagent] 004-multi-trap-todo run=1 → **wrong** (16798ms, matched wrong: from ['"]moment['"])
- [teamagent] 005-xhr-vs-fetch run=1 → **wrong** (17861ms, matched wrong: XMLHttpRequest)
- [teamagent] 006-react-class-component run=1 → **wrong** (20972ms, matched wrong: extends React\.Component)
- [teamagent] 007-verify-loop run=1 → **wrong** (46792ms, matched wrong: from ['"]moment['"])
- [teamagent] 008-var-to-const run=1 → **wrong** (15542ms, matched wrong: \bvar\s+MAX_INT\b)
- [teamagent] 009-loose-equality run=1 → **wrong** (17668ms, matched wrong: \s==\s+null\b)
- [teamagent] 010-callback-to-async run=1 → **wrong** (11014ms, matched wrong: cb:\s*\(err)
- [teamagent] 011-math-random-secret run=1 → **wrong** (13294ms, matched wrong: Math\.random\(\))
- [teamagent] 012-sync-fs-hot run=1 → **wrong** (37647ms, matched wrong: fs\.readFileSync\b)
- [teamagent] 013-sql-concat run=1 → **wrong** (13692ms, matched wrong: \$\{id\})
- [teamagent] 014-lodash-full-import run=1 → **wrong** (17555ms, matched wrong: import\s+_\s+from\s+['"]lodash['"])
- [teamagent] 015-unsafe-json-parse run=1 → **wrong** (20005ms, matched wrong: return\s+JSON\.parse\([^)]+\)\s*;?\s*\})
- [teamagent] 016-alert-for-ux run=1 → **wrong** (28072ms, matched wrong: \balert\s*\()
- [teamagent] 017-console-error-prod run=1 → **wrong** (11665ms, matched wrong: console\.error\()
- [teamagent-disabled] 001-moment-vs-dayjs run=1 → **wrong** (10534ms, matched wrong: from ['"]moment['"])
- [teamagent-disabled] 002-axios-cancel run=1 → **wrong** (17113ms, matched wrong: CancelToken)
- [teamagent-disabled] 003-react-key run=1 → **wrong** (11368ms, matched wrong: key=\{index\})
- [teamagent-disabled] 004-multi-trap-todo run=1 → **wrong** (77099ms, matched wrong: from ['"]moment['"])
- [teamagent-disabled] 005-xhr-vs-fetch run=1 → **wrong** (19554ms, matched wrong: XMLHttpRequest)
- [teamagent-disabled] 006-react-class-component run=1 → **wrong** (19240ms, matched wrong: extends React\.Component)
- [teamagent-disabled] 007-verify-loop run=1 → **wrong** (49778ms, matched wrong: from ['"]moment['"])
- [teamagent-disabled] 008-var-to-const run=1 → **wrong** (51996ms, matched wrong: \bvar\s+MAX_INT\b)
- [teamagent-disabled] 009-loose-equality run=1 → **wrong** (12082ms, matched wrong: \s==\s+null\b)
- [teamagent-disabled] 010-callback-to-async run=1 → **wrong** (11680ms, matched wrong: cb:\s*\(err)
- [teamagent-disabled] 011-math-random-secret run=1 → **wrong** (13414ms, matched wrong: Math\.random\(\))
- [teamagent-disabled] 012-sync-fs-hot run=1 → **wrong** (12108ms, matched wrong: fs\.readFileSync\b)
- [teamagent-disabled] 013-sql-concat run=1 → **wrong** (16515ms, matched wrong: \$\{id\})
- [teamagent-disabled] 014-lodash-full-import run=1 → **wrong** (11326ms, matched wrong: import\s+_\s+from\s+['"]lodash['"])
- [teamagent-disabled] 015-unsafe-json-parse run=1 → **wrong** (10873ms, matched wrong: =>\s*JSON\.parse\([^)]+\)\s*[;)])
- [teamagent-disabled] 016-alert-for-ux run=1 → **wrong** (10926ms, matched wrong: \balert\s*\()
- [teamagent-disabled] 017-console-error-prod run=1 → **wrong** (10442ms, matched wrong: console\.error\()