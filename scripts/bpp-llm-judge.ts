#!/usr/bin/env tsx
/**
 * bpp-llm-judge.ts — tier (c) LLM-as-judge for BPP semantic-ambiguity bottleneck.
 *
 * Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §8.1 tier (c).
 * Verify doc: docs/verify/BPP-VERIFY-V2.md.
 *
 * Per spec: "主门禁是 tier (a) + (b). tier (c) 仅作 semantic-ambiguity 兜底."
 *
 * Tier (c) handles ONLY the narrow semantic-ambiguity case: e.g. "are these
 * two BPs really conflicting, or are they discussing different scopes?".
 * It is **NOT** the main verification gate — that role is reserved for tier
 * (a) byte-diff (deterministic JSON equality) and tier (b) scipy ttest_rel
 * (deterministic p-value).
 *
 * This script is a **skeleton**:
 *   - it accepts two BestPractice JSON objects on stdin (single line: {bp_a, bp_b}),
 *   - shells out to `claudefast -p '<judge prompt>'` (see docs/CLAUDEFAST.md),
 *   - parses the model's JSON reply,
 *   - emits a normalized verdict to stdout.
 *
 * Limitations (loudly documented):
 *   1. LLM verdicts are NOT deterministic; do NOT use this as a load-bearing
 *      gate in CI. The verdict carries `confidence` so callers can apply a
 *      threshold (e.g. only act on `confidence >= 0.8`).
 *   2. The skeleton runs ONE judge. Production-quality usage requires the
 *      spec §8 voting pattern: 3 judges, majority wins, log dissent — wire
 *      that on top of this primitive when needed.
 *   3. If `claudefast` is not on PATH, this script gracefully degrades to a
 *      static "ambiguous" verdict with confidence 0 (rather than crashing),
 *      so a CI lane that hasn't provisioned a model can still gather signal.
 *   4. The judge prompt is intentionally short — long prompts in the
 *      ambiguity case have empirically been worse signal-to-noise. Tune the
 *      prompt only with paired-comparison evidence.
 *
 * Usage:
 *   echo '{"bp_a": {...}, "bp_b": {...}}' | npx tsx scripts/bpp-llm-judge.ts
 *
 * Output (stdout, single line JSON):
 *   {
 *     "verdict":    "real_conflict" | "not_conflict" | "ambiguous",
 *     "confidence": 0.0 — 1.0,
 *     "reasoning":  "<short model rationale or skeleton fallback message>",
 *     "judge":      "claudefast" | "skeleton-fallback",
 *     "spec_ref":   "docs/superpowers/specs/2026-05-13-best-practice-push-design.md §8.1 tier (c)"
 *   }
 *
 * Exit codes:
 *   0 — verdict emitted (regardless of verdict value or claudefast availability)
 *   1 — stdin malformed or two BP ids missing
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface BpLike {
  id?: string;
  title?: string;
  body?: string;
  topic?: string;
  type?: string;
}

interface JudgeInput {
  bp_a: BpLike;
  bp_b: BpLike;
}

type Verdict = 'real_conflict' | 'not_conflict' | 'ambiguous';

interface JudgeOutput {
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  judge: 'claudefast' | 'skeleton-fallback';
  spec_ref: string;
}

const SPEC_REF =
  'docs/superpowers/specs/2026-05-13-best-practice-push-design.md §8.1 tier (c)';

function readStdin(): string {
  // Read all of stdin (file-descriptor 0). Synchronous so we can run inside
  // simple pipes without async plumbing.
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function buildPrompt(bpA: BpLike, bpB: BpLike): string {
  return [
    'You are a tier-(c) BPP conflict-detection judge.',
    'Decide whether the two Best Practices below are in REAL semantic conflict',
    '(they cannot both be followed at the same time on the same code path),',
    'or NOT_CONFLICT (they apply to different scopes / are reconcilable),',
    'or AMBIGUOUS (genuinely unclear from the title/body alone).',
    '',
    `BP_A (id=${bpA.id ?? '?'}, type=${bpA.type ?? '?'}, topic=${bpA.topic ?? '?'}):`,
    `  title: ${bpA.title ?? ''}`,
    `  body: ${bpA.body ?? ''}`,
    '',
    `BP_B (id=${bpB.id ?? '?'}, type=${bpB.type ?? '?'}, topic=${bpB.topic ?? '?'}):`,
    `  title: ${bpB.title ?? ''}`,
    `  body: ${bpB.body ?? ''}`,
    '',
    'Reply ONLY with a single line of JSON, no prose, no code fences:',
    '{"verdict":"real_conflict"|"not_conflict"|"ambiguous","confidence":<0..1>,"reasoning":"<≤30 words>"}',
  ].join('\n');
}

function invokeClaudefast(prompt: string): { ok: true; raw: string } | { ok: false } {
  // Try `claudefast -p '<prompt>' --output-format text` non-interactively.
  // If the binary is missing or fails, fall back to skeleton.
  const result = spawnSync(
    'claudefast',
    ['-p', prompt, '--output-format', 'text', '--permission-mode', 'acceptEdits'],
    { encoding: 'utf8', timeout: 30000 },
  );
  if (result.error || result.status !== 0) {
    return { ok: false };
  }
  return { ok: true, raw: (result.stdout ?? '').trim() };
}

function parseJudgeReply(raw: string): JudgeOutput {
  // Extract the first {...} chunk; LLM may wrap it. If it cannot be parsed,
  // return an ambiguous fallback rather than throwing — tier (c) is bestow-
  // -of-signal, not a gate.
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) {
    return {
      verdict: 'ambiguous',
      confidence: 0,
      reasoning: 'judge reply did not contain JSON',
      judge: 'claudefast',
      spec_ref: SPEC_REF,
    };
  }
  try {
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    const v = String(obj.verdict ?? 'ambiguous');
    const verdict: Verdict =
      v === 'real_conflict' || v === 'not_conflict' ? (v as Verdict) : 'ambiguous';
    const conf = Number(obj.confidence ?? 0);
    return {
      verdict,
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0,
      reasoning: String(obj.reasoning ?? ''),
      judge: 'claudefast',
      spec_ref: SPEC_REF,
    };
  } catch {
    return {
      verdict: 'ambiguous',
      confidence: 0,
      reasoning: 'judge reply was not valid JSON',
      judge: 'claudefast',
      spec_ref: SPEC_REF,
    };
  }
}

function main(): number {
  const raw = readStdin();
  if (!raw.trim()) {
    process.stderr.write('expected JSON on stdin: {"bp_a":..., "bp_b":...}\n');
    return 1;
  }
  let input: JudgeInput;
  try {
    input = JSON.parse(raw) as JudgeInput;
  } catch {
    process.stderr.write('stdin was not valid JSON\n');
    return 1;
  }
  if (!input.bp_a || !input.bp_b || !input.bp_a.id || !input.bp_b.id) {
    process.stderr.write('input must include bp_a and bp_b each with an id\n');
    return 1;
  }

  const prompt = buildPrompt(input.bp_a, input.bp_b);
  const replied = invokeClaudefast(prompt);
  let out: JudgeOutput;
  if (replied.ok) {
    out = parseJudgeReply(replied.raw);
  } else {
    out = {
      verdict: 'ambiguous',
      confidence: 0,
      reasoning:
        'claudefast not available — tier (c) skeleton fallback. Install per docs/CLAUDEFAST.md to enable real judging.',
      judge: 'skeleton-fallback',
      spec_ref: SPEC_REF,
    };
  }
  process.stdout.write(JSON.stringify(out) + '\n');
  return 0;
}

process.exit(main());
