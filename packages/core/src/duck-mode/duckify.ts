import { TRANSLATIONS, type DuckTranslation } from "./translations.js";
import { isDuckModeEnabled, type IsEnabledOpts } from "./is-enabled.js";

export interface DuckifyOpts extends IsEnabledOpts {
  indent?: string;
}

export function duckify(line: string, opts: DuckifyOpts = {}): string[] {
  if (!isDuckModeEnabled(opts)) return [line];
  const matched = findJargon(line);
  if (matched.length === 0) return [line];
  const indent = opts.indent ?? "   ";
  return [line, ...matched.map((t) => `${indent}${t.duck}`)];
}

export function duckifyText(text: string, opts: DuckifyOpts = {}): string {
  if (!isDuckModeEnabled(opts)) return text;
  return text
    .split("\n")
    .flatMap((line) => duckify(line, opts))
    .join("\n");
}

export function writeDuckified(
  write: (s: string) => void,
  text: string,
  opts: DuckifyOpts = {},
): void {
  write(duckifyText(text, opts));
}

function findJargon(line: string): DuckTranslation[] {
  const lower = line.toLowerCase();
  const seen = new Set<string>();
  const matched: DuckTranslation[] = [];
  for (const t of TRANSLATIONS) {
    if (seen.has(t.term)) continue;
    const candidates = [t.term, ...(t.aliases ?? [])];
    if (candidates.some((c) => lower.includes(c.toLowerCase()))) {
      matched.push(t);
      seen.add(t.term);
    }
  }
  return matched;
}
