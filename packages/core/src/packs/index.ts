/**
 * Packs core (pure logic).
 *
 * No fs / no child_process — see CLAUDE.md "Functional Core, Imperative Shell".
 *
 * The stdout prompt format rendered by renderPackPromptBody is an **API
 * contract** consumed by external coding agents (Claude Code / Codex). Any
 * change to the markers, observed-file ordering, or section field names is a
 * breaking change and requires bumping PROMPT_VERSION.
 */
import { z } from "zod";

export const PROMPT_VERSION = 1 as const;
export const PROMPT_OPEN_MARKER = `<!-- teamagent-pack-prompt v${PROMPT_VERSION} -->`;
export const PROMPT_CLOSE_MARKER = `<!-- /teamagent-pack-prompt v${PROMPT_VERSION} -->`;

/**
 * Frozen v1 ordered list of well-known files surfaced in the prompt's
 * "Observed" section. Reordering or extending this list is a breaking
 * change to the prompt contract.
 */
export const OBSERVED_FILE_LIST = [
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "Dockerfile",
  "requirements.txt",
  "go.mod",
] as const;

export type ObservedFile = (typeof OBSERVED_FILE_LIST)[number];
export type ObservedFiles = Record<ObservedFile, boolean>;

export const PackMetaSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()),
  file_hints: z.array(z.string()),
  prompt_version: z.literal(PROMPT_VERSION),
});

export type PackMeta = z.infer<typeof PackMetaSchema>;

export function parsePackMeta(text: string): PackMeta {
  const obj = JSON.parse(text) as unknown;
  return PackMetaSchema.parse(obj);
}

export function packTag(name: string): string {
  return `pack:${name}`;
}

export function entryHasPackTag(
  entry: { tags: string[] },
  name: string,
): boolean {
  if (!entry.tags || entry.tags.length === 0) return false;
  return entry.tags.includes(packTag(name));
}

export interface DiffPackRequestInput {
  requested: string[];
  available: string[];
  installed: string[];
}

export interface DiffPackRequestResult {
  toAdd: string[];
  alreadyInstalled: string[];
  notFound: string[];
}

/**
 * Classify requested pack names into actionable buckets.
 * The literal name "all" expands to every available pack (in registry order).
 */
export function diffPackRequest(
  input: DiffPackRequestInput,
): DiffPackRequestResult {
  const expanded = expandAll(input.requested, input.available);
  const seen = new Set<string>();
  const toAdd: string[] = [];
  const alreadyInstalled: string[] = [];
  const notFound: string[] = [];
  const installedSet = new Set(input.installed);
  const availableSet = new Set(input.available);

  for (const name of expanded) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (!availableSet.has(name)) {
      notFound.push(name);
      continue;
    }
    if (installedSet.has(name)) {
      alreadyInstalled.push(name);
      continue;
    }
    toAdd.push(name);
  }
  return { toAdd, alreadyInstalled, notFound };
}

function expandAll(requested: string[], available: string[]): string[] {
  if (requested.length === 1 && requested[0] === "all") return [...available];
  return requested;
}

export interface RenderPackPromptInput {
  observed: ObservedFiles;
  available: PackMeta[];
  installed: string[];
}

/**
 * Render the versioned markdown prompt block injected into `teamagent init`
 * stdout. Anchors used by the judge harness in
 * docs/features/pack-cli/run-judge.sh:
 *   - PROMPT_OPEN_MARKER, PROMPT_CLOSE_MARKER
 *   - "Observed" header + 6 fixed rows in OBSERVED_FILE_LIST order
 *   - Per-pack row format: **<name>** [tags: a, b, c] — <description>. file_hints: `f1`, `f2`
 *   - Literal "teamagent pack add" in the recommended-action line
 *   - Literal "--pack all" and "--pack X,Y" in the power-user section
 */
export function renderPackPromptBody(input: RenderPackPromptInput): string {
  const lines: string[] = [];
  lines.push(PROMPT_OPEN_MARKER);
  lines.push("## TeamAgent: select stack packs");
  lines.push("");
  lines.push(
    "Observed in your project (file presence only — TeamAgent does not infer stack):",
  );
  lines.push("");
  for (const f of OBSERVED_FILE_LIST) {
    const present = input.observed[f] === true;
    lines.push(`- ${present ? "✓" : "✗"} \`${f}\``);
  }
  lines.push("");

  const installedSet = new Set(input.installed);
  if (input.available.length === 0) {
    lines.push("Available packs: (no packs shipped in this version)");
    lines.push("");
    lines.push(
      "**Recommended action**: this teamagent build ships no stack packs yet. " +
        "Run `teamagent doctor` to check for an updated build, or run `teamagent pack add <name>` " +
        "once packs are available.",
    );
  } else {
    const installedAvailable = input.available.filter((p) =>
      installedSet.has(p.name),
    );
    const remaining = input.available.filter((p) => !installedSet.has(p.name));
    if (installedAvailable.length > 0) {
      lines.push(
        `Already installed: ${installedAvailable.map((p) => p.name).join(", ")}`,
      );
      lines.push("");
    }
    lines.push(`Available packs (${input.available.length}):`);
    lines.push("");
    for (const p of input.available) {
      const installedSuffix = installedSet.has(p.name) ? " (already installed)" : "";
      const fileHints = p.file_hints.map((h) => `\`${h}\``).join(", ");
      lines.push(
        `- **${p.name}** [tags: ${p.tags.join(", ")}] — ${p.description}. file_hints: ${fileHints}${installedSuffix}`,
      );
    }
    lines.push("");
    const sample = (remaining.length > 0 ? remaining : input.available)
      .slice(0, 2)
      .map((p) => p.name)
      .join(",");
    lines.push(
      "**Recommended action** (read by your coding agent): if any of the file_hints above match observed files, pick the relevant pack(s) and run, e.g.",
    );
    lines.push("");
    lines.push(`\`teamagent pack add ${sample}\``);
  }

  lines.push("");
  lines.push("Power-user paths (skip this prompt next time):");
  lines.push("");
  lines.push("- `teamagent init --pack all` — install every available pack");
  const powerSample =
    input.available.length >= 2
      ? `${input.available[0]!.name},${input.available[1]!.name}`
      : input.available.length === 1
        ? input.available[0]!.name
        : "X,Y";
  lines.push(
    `- \`teamagent init --pack ${powerSample}\` — explicit comma-separated list (--pack X,Y form)`,
  );
  lines.push("");
  lines.push(PROMPT_CLOSE_MARKER);
  return lines.join("\n");
}
