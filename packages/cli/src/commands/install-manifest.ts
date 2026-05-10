/**
 * Issue #155 / Order 1 — install --preview manifest renderer.
 *
 * Pure function (Functional Core, Imperative Shell). NO `fs`, NO `child_process`,
 * NO `os`. Side-effect free; injectable options; testable without a filesystem.
 *
 * The CLI shell (`bin.ts` `case "install"`) calls `renderInstallManifest()`,
 * stringifies via `formatInstallManifest()`, prints to stdout, and exits 0
 * when `--preview` is present. When `--preview` is absent, install execution
 * path is left untouched (Order 1's anti-goal). Order 3 (install-merge) will
 * fill in the real install behaviour and reuse this same renderer at startup
 * for double-safety (decision 6 of #155).
 *
 * 5-section schema (per issue #155 + plan order-1-preview):
 *
 *   [config]   user-level config writes
 *   [skills]   project-level skill files at <project>/.claude/skills/<id>/SKILL.md
 *              (NOT user-level ~/.claude/skills/teamagent/<id>/SKILL.md, which
 *               is the `compile` output downstream of [kb])
 *   [kb]       project knowledge base files
 *   [download] vector model (~120 MB) — detached background warmup per
 *              ADR-0001 revised 2026-05-09; Stage-1 install returns ~3s.
 *              Order 3 finalized this as a detached background warmup with no
 *              foreground skip flag.
 *   [refusal]  refusal contract — pressing No leaves no half-state
 */

/**
 * Default project-level skill ids (from CLAUDE.md "Gstack skills 与 brain
 * sync bin 路径" + plan order-1-preview § 1). These are the skills compiled
 * into `<project>/.claude/skills/<id>/SKILL.md`. Order 1 hard-codes the list
 * for preview output; Order 3 may swap in a dynamic enumeration once the
 * skills install path is wired through `runInstall()`.
 */
export const DEFAULT_PROJECT_SKILLS: readonly string[] = [
  "canary",
  "design-html",
  "design-shotgun",
  "office-hours",
  "plan-ceo-review",
  "claim-to-merge",
];

/** Approximate vector model download size in MiB (issue #155 body says "120MB"). */
export const VECTOR_MODEL_SIZE_MB = 120;

/** Configuration write size estimate (per plan CLI shape). */
export const CONFIG_WRITE_KB = 1;

/** Options accepted by the pure renderer. All fields optional + injectable for tests. */
export interface RenderInstallManifestOptions {
  /**
   * Project-level skill ids that would be installed at
   * `<projectDir>/.claude/skills/<id>/SKILL.md`. Defaults to
   * `DEFAULT_PROJECT_SKILLS`.
   */
  projectSkills?: readonly string[];
  /**
   * Approximate vector model download size in MiB. Defaults to
   * `VECTOR_MODEL_SIZE_MB`.
   */
  vectorModelSizeMb?: number;
  /**
   * Approximate config-file write size in KiB. Defaults to `CONFIG_WRITE_KB`.
   */
  configWriteKb?: number;
}

/** Single-section payload. Lines are pre-rendered for predictable output. */
export interface InstallManifestSection {
  /** Bracketed header, e.g. "[config]". */
  header: string;
  /** Pre-rendered lines, NOT including the header. */
  lines: readonly string[];
}

/** Structured 5-section manifest. Stable schema for tests + Order 3 reuse. */
export interface InstallManifest {
  config: InstallManifestSection;
  skills: InstallManifestSection;
  kb: InstallManifestSection;
  download: InstallManifestSection;
  refusal: InstallManifestSection;
}

/**
 * Pure: build the structured 5-section manifest for `pnpm teamagent install --preview`.
 * No IO, no env reads, no `os.homedir()` — anything that varies is a parameter.
 *
 * Section ordering is fixed: config → skills → kb → download → refusal.
 * Tests assert presence by key; the integration test asserts the printed
 * order via the regex `/\[config\].*\[skills\].*\[kb\].*\[download\].*\[refusal\]/s`
 * defined in plan § 2 (test 3).
 */
export function renderInstallManifest(
  opts: RenderInstallManifestOptions = {},
): InstallManifest {
  const skillIds = opts.projectSkills ?? DEFAULT_PROJECT_SKILLS;
  const modelMb = opts.vectorModelSizeMb ?? VECTOR_MODEL_SIZE_MB;
  const configKb = opts.configWriteKb ?? CONFIG_WRITE_KB;

  return {
    config: {
      header: "[config]",
      lines: [
        `~/.teamagent/config.json  (~${configKb} KB write)`,
        "  user-level config; created on first run, idempotent on rerun.",
      ],
    },
    skills: {
      header: "[skills]",
      lines: [
        `<project>/.claude/skills/  (${skillIds.length} project-level skill files: ${skillIds.join(", ")})`,
        "  user-level ~/.claude/skills/teamagent/<id>/SKILL.md is the compile output downstream of [kb] and is NOT listed here.",
      ],
    },
    kb: {
      header: "[kb]",
      lines: [
        ".teamagent/kb/  (project knowledge base; user-level ~/.claude/skills/teamagent/<id>/SKILL.md is the compile output downstream of [kb], not listed here)",
      ],
    },
    download: {
      header: "[download]",
      lines: [
        `vector model: ~${modelMb} MB  (downloaded in background after install; can be stopped any time via kill or rm)`,
        "  detached warmup per ADR-0001 (revised 2026-05-09); Stage-1 install returns ~3s.",
        "  no foreground skip flag is exposed; abort by killing the warmup pid or removing in-progress files.",
      ],
    },
    refusal: {
      header: "[refusal]",
      lines: [
        "Pressing No leaves no half-state; the vector-model background warmup can be killed or removed at any time.",
      ],
    },
  };
}

/**
 * Stringify the manifest into the exact stdout the integration test asserts:
 * 5 section headers, in order, separated by blank lines. The regex
 * `/\[config\].*\[skills\].*\[kb\].*\[download\].*\[refusal\]/s` (plan § 2
 * test 3) passes against this output.
 *
 * Pure: takes an `InstallManifest` only.
 */
export function formatInstallManifest(manifest: InstallManifest): string {
  const sections: InstallManifestSection[] = [
    manifest.config,
    manifest.skills,
    manifest.kb,
    manifest.download,
    manifest.refusal,
  ];
  const blocks: string[] = [];
  for (const section of sections) {
    const block = [section.header, ...section.lines].join("\n");
    blocks.push(block);
  }
  return blocks.join("\n\n") + "\nExit code: 0\n";
}

/**
 * One-shot helper: render + format. Used by `bin.ts` `case "install"` when
 * `--preview` is present.
 */
export function renderInstallPreviewOutput(
  opts: RenderInstallManifestOptions = {},
): string {
  return formatInstallManifest(renderInstallManifest(opts));
}

/**
 * Args parsed from the install command. Currently only `preview` is recognised;
 * Order 3 will extend this when the real install behaviour lands.
 */
export interface InstallArgs {
  preview: boolean;
  yes: boolean;
  nonInteractive: boolean;
  help: boolean;
}

/**
 * Parse `pnpm teamagent install` args. Order 1 only handles `--preview`;
 * any other flag is silently passed through (Order 3's parser will own
 * the strict-flag check).
 */
export function parseInstallArgs(argv: readonly string[]): InstallArgs {
  return {
    preview: argv.includes("--preview"),
    yes: argv.includes("--yes") || argv.includes("-y"),
    nonInteractive: argv.includes("--non-interactive"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}
