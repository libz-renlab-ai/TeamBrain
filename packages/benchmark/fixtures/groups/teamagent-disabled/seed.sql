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
