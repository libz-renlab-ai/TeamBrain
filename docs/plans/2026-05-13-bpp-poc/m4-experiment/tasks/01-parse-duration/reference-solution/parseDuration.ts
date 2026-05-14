// Reference solution — coordinator-only. NEVER ship to participants.
// Used by judge to sanity-check that score.test.ts is solvable.
export function parseDuration(input: string): number {
  if (typeof input !== 'string') throw new Error(`expected string, got ${typeof input}`);
  const trimmed = input.trim();
  if (trimmed === '') throw new Error('empty input');

  const unitToMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  const re = /(\d+)(ms|s|m|h|d)/g;
  let total = 0;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed)) !== null) {
    if (match.index !== consumed) throw new Error(`bad input at index ${consumed}`);
    const n = Number(match[1]);
    const factor = unitToMs[match[2] ?? ''];
    if (factor == null) throw new Error(`unknown unit "${match[2]}"`);
    total += n * factor;
    consumed += match[0].length;
  }
  if (consumed !== trimmed.length) {
    throw new Error(`unparsed tail: "${trimmed.slice(consumed)}"`);
  }
  if (consumed === 0) throw new Error('no recognizable duration in input');
  return total;
}
