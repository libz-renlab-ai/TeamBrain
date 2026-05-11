export {
  STATIC_USER_SKILLS,
  STATIC_USER_SKILL_TARGETS,
  type StaticUserSkillName,
  type StaticUserSkillTarget,
  type StaticUserSkillAction,
  type StaticUserSkillPlanEntry,
} from "./types.js";
export { STATIC_USER_SKILL_CONTENT } from "./content.js";
export {
  planStaticUserSkillInstall,
  computeDestPath,
  type FileExistsProbe,
  type StaticUserSkillPlanOptions,
} from "./plan.js";
