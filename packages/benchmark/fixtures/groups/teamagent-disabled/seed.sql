INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-moment-to-dayjs',
  'personal',
  'tech_choice',
  'avoidance',
  'objective',
  'using moment for date formatting in TypeScript/JavaScript',
  'moment',
  'from ''dayjs''',
  'Prefer dayjs over moment: smaller bundle (~2KB vs ~70KB), immutable API, same-style format strings.',
  'moment is in maintenance mode and bloats client bundles; dayjs is a drop-in modern replacement.',
  0.9, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-react-class-to-fn',
  'personal',
  'framework',
  'avoidance',
  'objective',
  'writing a React class component',
  'extends React.Component|extends Component',
  'functional component + hooks',
  'Use a functional component with useState/useEffect — typically 2-3x shorter than a class component for the same behaviour, no constructor/bind/this pitfalls.',
  'Class components bloat with constructor/super/this.setState/bind/lifecycle methods. The hooks equivalent is shorter, simpler, and the standard React pattern since 16.8 (2019).',
  0.95, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-xhr-to-fetch',
  'personal',
  'api_currency',
  'avoidance',
  'objective',
  'using XMLHttpRequest for HTTP requests',
  'XMLHttpRequest|xhr.open|xhr.send|onreadystatechange',
  'fetch() with async/await',
  'Use the native fetch() API with async/await — ~5 lines instead of ~25 lines of XHR boilerplate. IE11 compatibility is no longer a valid reason; use a polyfill if truly needed.',
  'XMLHttpRequest requires manual state tracking, event listeners, explicit parsing, and branching error handling. fetch() with async/await gives the same capability in a fraction of the code and integrates with modern async patterns.',
  0.95, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-react-key-stable',
  'personal',
  'framework',
  'avoidance',
  'objective',
  'using array index as React list key',
  'key={index}',
  'key={item.id} or stable identifier',
  'React keys should be stable identifiers (item.id or a unique string), never array index — index causes state desync, DOM thrash, and broken animations when the list reorders.',
  'Array index as key breaks React reconciliation when list items are inserted, removed, or reordered; React treats same-index-different-data as mutation rather than move, losing component state and wasting DOM work.',
  0.92, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

-- issue #343 PR-2: 10 additional curated rules pairing with fixtures 008-017.
-- Same schema as 001-004 above; each rule is stable/block avoidance.

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-var-to-const',
  'personal',
  'modern_syntax',
  'avoidance',
  'objective',
  'declaring a variable with var instead of const/let in modern JS/TS',
  'var ',
  'const or let',
  'Use const for immutable bindings, let for mutable. var has function-scope hoisting which is a known footgun and predates ES2015.',
  'var has function-scope, hoisting, and silent redeclaration — all common bug sources. const/let are block-scoped and TDZ-enforced.',
  0.95, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-loose-equality',
  'personal',
  'modern_syntax',
  'avoidance',
  'objective',
  'using == or != instead of === / !== in JS/TS comparisons',
  ' == | != ',
  '=== / !==',
  'Use strict equality (===) by default. Loose equality has surprising coercion (e.g. [] == false is true).',
  '== triggers type coercion with non-obvious rules; === is type-strict and matches what 99% of comparisons mean.',
  0.95, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-callback-to-async',
  'personal',
  'api_currency',
  'avoidance',
  'objective',
  'using Node-style (err, data) callbacks instead of async/await + fs.promises',
  '(err, data) =>|cb: (err',
  'async function + fs.promises + try/catch',
  'Use fs.promises with async/await. Node-callback signatures are legacy and turn a 3-line operation into 10 with manual error branching.',
  'Callbacks force manual error propagation and nested control flow; async/await gives flat try/catch semantics.',
  0.9, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-math-random-secret',
  'personal',
  'security',
  'avoidance',
  'objective',
  'using Math.random() to generate security tokens, session IDs, or any cryptographic material',
  'Math.random()',
  'crypto.randomBytes() or crypto.randomUUID()',
  'Never use Math.random() for security: it is a predictable PRNG. Use crypto.randomBytes(n).toString(''hex'') or crypto.randomUUID() from node:crypto.',
  'Math.random() is a Mulberry/Xorshift PRNG that can be predicted from a few samples; using it for session tokens is a known credential-leak class.',
  0.98, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-sync-fs-hot',
  'personal',
  'perf',
  'avoidance',
  'objective',
  'calling fs.readFileSync (or writeFileSync) inside an HTTP request handler, Promise body, or event loop hot path',
  'fs.readFileSync|readFileSync(',
  'fs.promises.readFile + await',
  'Sync fs blocks the event loop. In request handlers use fs.promises.readFile with await.',
  'Sync fs in a hot path stalls every concurrent request until the read completes; async fs gives the same data with no blocking.',
  0.92, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-sql-concat',
  'personal',
  'security',
  'avoidance',
  'objective',
  'building SQL queries by concatenating or template-literal-interpolating user input directly into the SQL string',
  '+ id +|SELECT.*\${',
  'parameterized query with $1 / ? placeholder and values array',
  'Always use parameterized queries. db.query(''SELECT * FROM users WHERE id = $1'', [id]). Never interpolate user input into SQL.',
  'String-concatenated SQL is the canonical SQL-injection vector; parameterized queries delegate escaping to the driver and eliminate the entire class of attack.',
  0.98, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-lodash-full-import',
  'personal',
  'perf_bundle',
  'avoidance',
  'objective',
  'importing the entire lodash namespace via default import instead of per-function imports',
  'import _ from ''lodash''|import _ from "lodash"',
  'import get from ''lodash/get''',
  'Use per-function imports (import get from ''lodash/get'') so bundlers can tree-shake unused helpers — typical savings ~70KB gzipped.',
  'The default lodash import pulls in the whole namespace and defeats tree-shaking; per-function imports only ship the helpers actually used.',
  0.85, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-unsafe-json-parse',
  'personal',
  'robustness',
  'avoidance',
  'objective',
  'calling JSON.parse on untrusted input without try/catch around the parse',
  'JSON.parse(|return JSON.parse',
  'try { JSON.parse(raw) } catch (e) { ... }',
  'Wrap JSON.parse on untrusted input in try/catch — invalid JSON throws a SyntaxError that crashes the handler if uncaught.',
  'JSON.parse throws on malformed input; in a request handler an unwrapped parse turns a bad body into a 500 instead of a 400.',
  0.88, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-alert-for-ux',
  'personal',
  'ux',
  'avoidance',
  'objective',
  'using window.alert() to show messages to end users in a production web app',
  'alert(|window.alert(',
  'toast / notification / inline status',
  'Use a non-blocking toast or inline status message; alert() blocks the entire page and looks 1995.',
  'alert() blocks user interaction, is unstyled, and is universally seen as a dev-only / placeholder UI — production apps use toast/notification components.',
  0.85, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);

INSERT INTO knowledge (
  id, scope_level, category, type, nature, trigger,
  wrong_pattern, correct_pattern, correct_pattern_tldr,
  reasoning, confidence, demerit,
  current_tier, max_tier_ever, tier_entered_at,
  enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  source, created_at
) VALUES (
  'rule-console-error-prod',
  'personal',
  'observability',
  'avoidance',
  'objective',
  'using console.error for production error logging instead of a structured logger',
  'console.error(',
  'logger.error() with structured fields',
  'Use a structured logger (pino, winston, etc.) so errors are queryable in your log aggregator with severity, fields, and stack frames.',
  'console.error writes unstructured strings to stderr; aggregators cannot reliably parse severity/fields/stack, making prod debugging slow.',
  0.8, 0,
  'stable', 'stable', datetime('now'),
  'block', 'active',
  0, 0, 0, 0,
  'preset', datetime('now')
);
