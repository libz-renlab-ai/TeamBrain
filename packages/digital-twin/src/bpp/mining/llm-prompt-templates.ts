// BPP mining — LLM prompt templates.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §3.2
// (rule / habit / context-mgmt extraction targets) + §3.4 (budget) + §3.5
// (LLM-uncheatable: mining_evidence counts must be objective).
//
// Each template returns a single string passed verbatim to the LLM. Strict
// JSON-only output is mandatory — schema:
//   { "candidates": [{
//       "title": string,
//       "body": string,
//       "example": string,
//       "pattern_count": number,
//       "sessions_observed": number
//   }] }
//
// IMPORTANT: prompts MUST instruct the model "return JSON only, no prose,
// no markdown fences". Downstream parser in `llm-client.ts` is intolerant of
// preface / suffix text.

export interface SessionExcerpt {
  user_id: string;
  transcript_excerpt: string;
}

const JSON_ONLY_INSTRUCTION = [
  'Output requirements:',
  '- Return ONLY a single valid JSON object, no prose, no markdown code fences, no preface, no suffix.',
  '- The JSON object MUST have exactly one top-level key: "candidates".',
  '- "candidates" is an array (may be empty if nothing extractable).',
  '- Each candidate MUST have these keys with these types:',
  '  - "title": string (short, imperative, ≤80 chars)',
  '  - "body": string (1-3 sentences describing the practice)',
  '  - "example": string (concrete excerpt or paraphrased instance)',
  '  - "pattern_count": integer (#sessions where this pattern appeared)',
  '  - "sessions_observed": integer (total #sessions you inspected)',
  '- Do not include any other top-level keys. Do not include trailing commas.',
  '- If you cannot extract anything, return: {"candidates": []}',
].join('\n');

function formatSessions(sessions: ReadonlyArray<SessionExcerpt>): string {
  if (sessions.length === 0) return '(no sessions provided)';
  return sessions
    .map(
      (s, i) =>
        `### Session ${i + 1} — user=${s.user_id}\n${s.transcript_excerpt}`,
    )
    .join('\n\n');
}

/**
 * Prompt for type=rule extraction: find explicit corrections/preferences a
 * teammate gave their AI in the transcript and turn each into a rule candidate.
 */
export function promptForRule(sessions: ReadonlyArray<SessionExcerpt>): string {
  return [
    'You are mining "rule"-type best practices from real developer↔AI transcripts.',
    '',
    'A "rule" is an explicit correction or preference the human gave the AI that',
    'should generalize. Examples: "use rg instead of grep", "never commit .env files",',
    '"prefer pnpm over npm". Each rule candidate must be grounded in a concrete moment',
    'in the transcript (not invented).',
    '',
    'Counting rules:',
    '- pattern_count = how many DISTINCT sessions you saw the same correction in.',
    '- sessions_observed = the total number of sessions you actually read (= the count below).',
    '',
    `Sessions (${sessions.length} total):`,
    '',
    formatSessions(sessions),
    '',
    JSON_ONLY_INSTRUCTION,
  ].join('\n');
}

/**
 * Prompt for type=habit extraction: identify repeated "before X always Y"
 * behavior patterns. Pair this LLM extractor with `behavior-miner.ts`'s
 * deterministic pair counter — the LLM only provides the title/body prose;
 * objective counts live in `mining_evidence`.
 */
export function promptForHabit(sessions: ReadonlyArray<SessionExcerpt>): string {
  return [
    'You are mining "habit"-type best practices from real developer↔AI transcripts.',
    '',
    'A "habit" is a repeated behavior pattern of the form "before X, always Y":',
    'e.g. "before edit_file, always read_file", "before commit, always run_test".',
    'Only emit a habit if you saw the same pattern across multiple sessions for',
    'the same user.',
    '',
    'Counting rules:',
    '- pattern_count = #sessions where the (preceding, starter) pair fired.',
    '- sessions_observed = total #sessions inspected (= the count below).',
    '- Do not invent patterns that only appear once.',
    '',
    `Sessions (${sessions.length} total):`,
    '',
    formatSessions(sessions),
    '',
    JSON_ONLY_INSTRUCTION,
  ].join('\n');
}

/**
 * Prompt for type=context-mgmt extraction: identify context-window /
 * conversation-management practices (e.g. "compact every 50 turns",
 * "clear context before switching repos", "open new session for each issue").
 */
export function promptForContextMgmt(
  sessions: ReadonlyArray<SessionExcerpt>,
): string {
  return [
    'You are mining "context-mgmt"-type best practices from real developer↔AI transcripts.',
    '',
    'A "context-mgmt" practice is a habit around managing the AI\'s context window or',
    'conversation lifecycle. Examples: "use /clear when switching tasks", "compact',
    'before long planning blocks", "split big issues into smaller sessions".',
    '',
    'Counting rules:',
    '- pattern_count = #sessions where the practice was actually used.',
    '- sessions_observed = total #sessions inspected (= the count below).',
    '',
    `Sessions (${sessions.length} total):`,
    '',
    formatSessions(sessions),
    '',
    JSON_ONLY_INSTRUCTION,
  ].join('\n');
}
