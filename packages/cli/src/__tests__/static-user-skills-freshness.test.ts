import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATIC_USER_SKILLS,
  STATIC_USER_SKILL_CONTENT,
} from "@teamagent/core";

/**
 * Freshness gate for the inline SKILL.md strings shipped by
 * `teamagent init` (per `docs/INIT-PROPAGATION.md`).
 *
 * The generator script `scripts/regen-static-user-skills.cjs` reads
 * `.claude/skills/<name>/SKILL.md` and writes the inline `STATIC_USER_SKILL_CONTENT`
 * map. This test asserts the inline value matches the on-disk file byte-for-byte;
 * CI fails if a maintainer edits `.claude/skills/<name>/SKILL.md` without
 * re-running the generator.
 *
 * Recovery: `node scripts/regen-static-user-skills.cjs && pnpm vitest run packages/cli/src/__tests__/static-user-skills-freshness.test.ts`.
 */
describe("static-user-skills inline content freshness", () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // packages/cli/src/__tests__ → repo root is four levels up.
  const REPO_ROOT = path.resolve(__dirname, "../../../..");

  for (const name of STATIC_USER_SKILLS) {
    test(`inline ${name} matches .claude/skills/${name}/SKILL.md`, () => {
      const filePath = path.join(REPO_ROOT, ".claude", "skills", name, "SKILL.md");
      expect(fs.existsSync(filePath)).toBe(true);
      const fileContent = fs.readFileSync(filePath, "utf8");
      const inlineContent = STATIC_USER_SKILL_CONTENT[name];
      expect(inlineContent).toBe(fileContent);
    });
  }
});
