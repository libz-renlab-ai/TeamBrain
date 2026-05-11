/**
 * 6 个 M7 验证场景。给 ScenarioRunner 喂这个 list 一次跑全套。
 */
export { pythonVersionScenario } from "./python-version.js";
export { techChoiceScenario } from "./tech-choice.js";
export { apiHallucinationScenario } from "./api-hallucination.js";
export { securityScenario } from "./security.js";
export { workflowOrderScenario } from "./workflow-order.js";
export { momentDayjsScenario } from "./moment-dayjs.js";

import { pythonVersionScenario } from "./python-version.js";
import { techChoiceScenario } from "./tech-choice.js";
import { apiHallucinationScenario } from "./api-hallucination.js";
import { securityScenario } from "./security.js";
import { workflowOrderScenario } from "./workflow-order.js";
import { momentDayjsScenario } from "./moment-dayjs.js";
import type { Scenario } from "../../packages/core/src/index.js";

export const allScenarios: Scenario[] = [
  pythonVersionScenario,
  techChoiceScenario,
  apiHallucinationScenario,
  securityScenario,
  workflowOrderScenario,
  momentDayjsScenario,
];
