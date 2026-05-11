/**
 * Static user-level skills shipped by `teamagent init` (per `docs/INIT-PROPAGATION.md`).
 *
 * "Static" = the SKILL.md content is bundled with the teamagent package and
 * mirrored verbatim to `~/.claude/skills/<name>/SKILL.md` and
 * `~/.codex/skills/<name>/SKILL.md` on init. Distinct from teamagent-compiled
 * Skills (`runCompile`) which derive from rules + KB.
 *
 * To add a new static user skill: (1) put SKILL.md at `.claude/skills/<name>/`,
 * (2) add the name to `STATIC_USER_SKILLS` below, (3) run
 * `node scripts/regen-static-user-skills.cjs` to refresh `content.ts`.
 */
export const STATIC_USER_SKILLS = [
  "duck",
  "grill-me",
  "grill-via-web",
  "fixed-flow-driver",
  "claim-to-merge",
] as const;

export type StaticUserSkillName = (typeof STATIC_USER_SKILLS)[number];

/**
 * The pair of user-level destination dirs each static skill must be mirrored
 * into. Order is stable so plans / tests / reports compare deterministically.
 */
export const STATIC_USER_SKILL_TARGETS = ["claude", "codex"] as const;
export type StaticUserSkillTarget = (typeof STATIC_USER_SKILL_TARGETS)[number];

/**
 * Per-(skill, target) action computed by `planStaticUserSkillInstall`.
 *
 * - `create`: target file does not exist; will be written.
 * - `skip-exists`: target file already exists; per the install contract we
 *   do NOT overwrite (preserves user customizations).
 * - `skip-disabled`: caller filtered this target out via `targets` option.
 */
export type StaticUserSkillAction = "create" | "skip-exists" | "skip-disabled";

export interface StaticUserSkillPlanEntry {
  skill: StaticUserSkillName;
  target: StaticUserSkillTarget;
  /** Absolute path the action would touch. */
  destPath: string;
  action: StaticUserSkillAction;
  /** Embedded SKILL.md content. Only meaningful when action === "create". */
  content: string;
}
