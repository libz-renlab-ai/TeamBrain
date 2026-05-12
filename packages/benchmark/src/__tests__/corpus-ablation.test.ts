import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * issue #343 PR-2: Counterfactual Ablation corpus invariants.
 *
 * The bench fixtures + groups need to satisfy:
 *   1. All 17 tasks (001-017) are loadable JSON.
 *   2. Each task has `id`, `prompt`, and a pattern `evaluator` with at
 *      least one wrong_pattern and one correct_pattern.
 *   3. Three groups exist (baseline / teamagent / teamagent-disabled).
 *   4. `teamagent` and `teamagent-disabled` have IDENTICAL
 *      settings.template.json (control-variable property — the only
 *      difference at runtime is the TEAMAGENT_DISABLED=1 env that
 *      bin.ts injects for the disabled group).
 *   5. `teamagent` and `teamagent-disabled` have IDENTICAL seed.sql
 *      (same seeded rules, same install footprint).
 *   6. `baseline` has empty hooks (truly no-TB baseline, kept as
 *      reference; not the primary pair for #343 ablation).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, "..", "..", "fixtures");
const TASKS_DIR = path.join(FIXTURES, "tasks");
const GROUPS_DIR = path.join(FIXTURES, "groups");

describe("issue-343 PR-2 corpus invariants", () => {
  it("loads all 17 tasks (001-017) with valid pattern evaluators", () => {
    const files = readdirSync(TASKS_DIR).filter((f) => f.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThanOrEqual(17);
    for (const file of files) {
      const raw = readFileSync(path.join(TASKS_DIR, file), "utf8");
      const t = JSON.parse(raw);
      expect(t.id, `${file}: missing id`).toBeTypeOf("string");
      expect(t.prompt, `${file}: missing prompt`).toBeTypeOf("string");
      expect(t.evaluator, `${file}: missing evaluator`).toBeDefined();
      expect(t.evaluator.type, `${file}: evaluator.type`).toBe("pattern");
      expect(
        Array.isArray(t.evaluator.wrong_patterns) && t.evaluator.wrong_patterns.length > 0,
        `${file}: wrong_patterns must be non-empty array`,
      ).toBe(true);
      expect(
        Array.isArray(t.evaluator.correct_patterns) && t.evaluator.correct_patterns.length > 0,
        `${file}: correct_patterns must be non-empty array`,
      ).toBe(true);
      // wrong/correct patterns must compile as regex
      for (const p of t.evaluator.wrong_patterns) {
        expect(() => new RegExp(p), `${file}: invalid wrong_pattern ${p}`).not.toThrow();
      }
      for (const p of t.evaluator.correct_patterns) {
        expect(() => new RegExp(p), `${file}: invalid correct_pattern ${p}`).not.toThrow();
      }
    }
  });

  it("three groups exist: baseline / teamagent / teamagent-disabled", () => {
    for (const g of ["baseline", "teamagent", "teamagent-disabled"]) {
      expect(existsSync(path.join(GROUPS_DIR, g)), `group ${g} missing`).toBe(true);
      expect(
        existsSync(path.join(GROUPS_DIR, g, "settings.template.json")),
        `${g}/settings.template.json missing`,
      ).toBe(true);
    }
  });

  it("teamagent and teamagent-disabled have IDENTICAL settings.template.json", () => {
    const a = readFileSync(path.join(GROUPS_DIR, "teamagent", "settings.template.json"), "utf8");
    const b = readFileSync(
      path.join(GROUPS_DIR, "teamagent-disabled", "settings.template.json"),
      "utf8",
    );
    expect(b, "teamagent-disabled must be byte-identical to teamagent (control variable)").toBe(a);
  });

  it("teamagent and teamagent-disabled have IDENTICAL seed.sql", () => {
    const a = readFileSync(path.join(GROUPS_DIR, "teamagent", "seed.sql"), "utf8");
    const b = readFileSync(path.join(GROUPS_DIR, "teamagent-disabled", "seed.sql"), "utf8");
    expect(b, "teamagent-disabled seed.sql must be byte-identical to teamagent").toBe(a);
  });

  it("baseline has empty hooks (truly no-TB)", () => {
    const raw = readFileSync(path.join(GROUPS_DIR, "baseline", "settings.template.json"), "utf8");
    const cfg = JSON.parse(raw);
    // hooks key can be missing or an empty object; both qualify as "no hooks".
    const hooks = cfg.hooks ?? {};
    expect(Object.keys(hooks)).toHaveLength(0);
  });

  it("teamagent has 3 wired hooks (PreToolUse / PostToolUse / UserPromptSubmit)", () => {
    const raw = readFileSync(path.join(GROUPS_DIR, "teamagent", "settings.template.json"), "utf8");
    const cfg = JSON.parse(raw);
    expect(cfg.hooks.PreToolUse).toBeDefined();
    expect(cfg.hooks.PostToolUse).toBeDefined();
    expect(cfg.hooks.UserPromptSubmit).toBeDefined();
  });

  it("seed.sql includes the 10 new rules paired with tasks 008-017", () => {
    const raw = readFileSync(path.join(GROUPS_DIR, "teamagent", "seed.sql"), "utf8");
    for (const ruleId of [
      "rule-var-to-const",
      "rule-loose-equality",
      "rule-callback-to-async",
      "rule-math-random-secret",
      "rule-sync-fs-hot",
      "rule-sql-concat",
      "rule-lodash-full-import",
      "rule-unsafe-json-parse",
      "rule-alert-for-ux",
      "rule-console-error-prod",
    ]) {
      expect(raw, `seed.sql missing rule ${ruleId}`).toContain(`'${ruleId}'`);
    }
  });

  it("each task 008-017 has a wrong_pattern that overlaps semantically with its paired rule", () => {
    // Soft contract: regex compilation alone is not enough; we want a basic
    // signal that the task and rule are talking about the same anti-pattern.
    // This is a lightweight string-substring check, not full semantic equiv.
    const pairs: Array<[string, string]> = [
      ["008-var-to-const", "var"],
      ["009-loose-equality", "=="],
      ["010-callback-to-async", "err"],
      ["011-math-random-secret", "Math.random"],
      ["012-sync-fs-hot", "readFileSync"],
      ["013-sql-concat", "id"],
      ["014-lodash-full-import", "lodash"],
      ["015-unsafe-json-parse", "JSON.parse"],
      ["016-alert-for-ux", "alert"],
      ["017-console-error-prod", "console.error"],
    ];
    for (const [taskId, marker] of pairs) {
      const file = path.join(TASKS_DIR, `${taskId}.json`);
      expect(existsSync(file), `${taskId}.json missing`).toBe(true);
      const t = JSON.parse(readFileSync(file, "utf8"));
      // Strip regex meta-escapes (\.) and quantifier groups (\(\)) so the
      // substring check works on the semantic identifier, not the raw regex.
      const joined = t.evaluator.wrong_patterns.join(" | ").replace(/\\([().{}+*?|^$\\])/g, "$1");
      expect(joined, `${taskId} wrong_patterns missing marker '${marker}'`).toContain(marker);
    }
  });
});
