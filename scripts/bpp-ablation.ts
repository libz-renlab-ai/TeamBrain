#!/usr/bin/env tsx
/**
 * bpp-ablation.ts — Counterfactual Ablation skeleton for BPP mining.
 *
 * Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §8.1 tier (b).
 * Verify doc: docs/verify/BPP-VERIFY.md.
 *
 * Reads tests/fixtures/scenarios/bpp-brainstorm-habit/transcript.jsonl and
 * runs the placeholder miner twice:
 *   (a) bpp-on  — normal mining behavior
 *   (b) bpp-off — mining is short-circuited to return []
 *
 * Emits a single-line JSON verdict to stdout. This is a **single-task**
 * skeleton — a real p-value requires scipy.stats.ttest_rel on the 17-task
 * corpus (issue #343); this script exists to lock the JSON shape and CLI
 * contract so the corpus version is a drop-in.
 *
 * Not a vitest test — a dev tool. Run directly:
 *   npx tsx scripts/bpp-ablation.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Hard-coded inline copy of the placeholder miner, so this script has zero
// runtime deps on the digital-twin package's internal API surface (which is
// still in flux during Phase 2).
function mineHabit(transcriptJsonl: string): number {
  const lines = transcriptJsonl
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  let bpCount = 0;
  let patternCount = 0;
  let lastBrainstormSeen = false;
  for (const line of lines) {
    const ev = JSON.parse(line) as Record<string, unknown>;
    if (ev.type !== 'assistant') continue;
    const msg = ev.message as { content?: unknown } | undefined;
    const content = msg?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b.type !== 'tool_use') continue;
      const name = b.name;
      const input = b.input as Record<string, unknown> | undefined;
      if (name === 'Skill' && input?.skill === 'superpowers:brainstorming') {
        lastBrainstormSeen = true;
      } else if (name === 'Write' && lastBrainstormSeen) {
        patternCount += 1;
        lastBrainstormSeen = false;
      }
    }
  }
  if (patternCount > 0) bpCount = 1;
  return bpCount;
}

function main(): void {
  const fixturePath = join(
    process.cwd(),
    'tests',
    'fixtures',
    'scenarios',
    'bpp-brainstorm-habit',
    'transcript.jsonl',
  );
  const transcript = readFileSync(fixturePath, 'utf8');

  // bpp-on: run the real miner.
  const bppOnCount = mineHabit(transcript);

  // bpp-off: short-circuit. In the corpus version this means the BPP module
  // is gated off via env flag; here it's a hard 0.
  const bppOffCount = 0;

  const verdict = {
    ablation: 'brainstorm-habit',
    bpp_on_bp_count: bppOnCount,
    bpp_off_bp_count: bppOffCount,
    delta: bppOnCount - bppOffCount,
    p_value_placeholder: 0.01,
    note:
      'real p-value needs scipy.stats.ttest_rel on 17-task corpus, this is single-task placeholder',
    fixture: 'tests/fixtures/scenarios/bpp-brainstorm-habit/transcript.jsonl',
    spec_ref:
      'docs/superpowers/specs/2026-05-13-best-practice-push-design.md §8.1 tier (b)',
  };

  process.stdout.write(JSON.stringify(verdict) + '\n');
}

main();
