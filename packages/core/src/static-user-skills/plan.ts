import {
  STATIC_USER_SKILLS,
  STATIC_USER_SKILL_TARGETS,
  type StaticUserSkillName,
  type StaticUserSkillTarget,
  type StaticUserSkillPlanEntry,
} from "./types.js";
import { STATIC_USER_SKILL_CONTENT } from "./content.js";

/**
 * Filesystem probe injected by the caller (Imperative Shell). The plan is a
 * pure function — the caller does the actual `fs.existsSync`.
 */
export type FileExistsProbe = (absPath: string) => boolean;

export interface StaticUserSkillPlanOptions {
  /** User HOME. Used to derive `~/.claude/skills/<name>/SKILL.md` etc. */
  homeDir: string;
  /** Existence probe. Pure-function contract: same input → same output. */
  fileExists: FileExistsProbe;
  /**
   * Filter — only plan entries for these targets. Defaults to all of
   * `STATIC_USER_SKILL_TARGETS`. Caller passes a subset to honor
   * `teamagent init --target=claude` / `--target=codex`.
   */
  targets?: readonly StaticUserSkillTarget[];
  /**
   * Filter — only plan entries for these skills. Defaults to all of
   * `STATIC_USER_SKILLS`. Test injection point; not exposed via init CLI.
   */
  skills?: readonly StaticUserSkillName[];
  /**
   * POSIX-style path join. Caller injects `path.posix.join` or
   * `path.join` from `node:path`. Pure function takes no IO module by import.
   */
  joinPath: (...segments: string[]) => string;
}

/**
 * Compute the install plan for all (skill, target) pairs.
 *
 * Pure function — no fs, no IO, no time. Caller is responsible for actually
 * writing the files (per FCIS rule from CLAUDE.md root: "packages/core/ 下
 * 禁止 import fs / node:fs / node:child_process").
 *
 * Contract:
 * - Always returns `STATIC_USER_SKILLS.length * STATIC_USER_SKILL_TARGETS.length`
 *   entries (one per (skill, target) pair) when no filters are applied.
 * - Filtered entries get `action: "skip-disabled"` so the caller still sees
 *   them for reporting / dry-run preview.
 * - Existing target files get `action: "skip-exists"` — we do NOT overwrite
 *   user customizations (install contract — `docs/INIT-PROPAGATION.md`).
 * - Missing target files get `action: "create"` with the embedded content
 *   inlined from `STATIC_USER_SKILL_CONTENT`.
 */
export function planStaticUserSkillInstall(
  opts: StaticUserSkillPlanOptions,
): StaticUserSkillPlanEntry[] {
  const allowedTargets = new Set(
    opts.targets ?? STATIC_USER_SKILL_TARGETS,
  );
  const allowedSkills = new Set(opts.skills ?? STATIC_USER_SKILLS);

  const entries: StaticUserSkillPlanEntry[] = [];

  for (const skill of STATIC_USER_SKILLS) {
    for (const target of STATIC_USER_SKILL_TARGETS) {
      const destPath = computeDestPath(opts.joinPath, opts.homeDir, target, skill);
      const skillEnabled = allowedSkills.has(skill);
      const targetEnabled = allowedTargets.has(target);

      let action: StaticUserSkillPlanEntry["action"];
      if (!skillEnabled || !targetEnabled) {
        action = "skip-disabled";
      } else if (opts.fileExists(destPath)) {
        action = "skip-exists";
      } else {
        action = "create";
      }

      entries.push({
        skill,
        target,
        destPath,
        action,
        content: STATIC_USER_SKILL_CONTENT[skill],
      });
    }
  }

  return entries;
}

/**
 * `~/.claude/skills/<skill>/SKILL.md` or `~/.codex/skills/<skill>/SKILL.md`.
 * Exported so tests can independently assert path derivation.
 */
export function computeDestPath(
  joinPath: (...segments: string[]) => string,
  homeDir: string,
  target: StaticUserSkillTarget,
  skill: StaticUserSkillName,
): string {
  const baseDir = target === "claude" ? ".claude" : ".codex";
  return joinPath(homeDir, baseDir, "skills", skill, "SKILL.md");
}
