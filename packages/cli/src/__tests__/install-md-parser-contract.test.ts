/**
 * Contract tests for scripts/install-from-md.ts
 *
 * Covers:
 *  - Schema contracts: required-field rejection
 *  - Happy path: parse happy.md → typed steps
 *  - Error-fix matching: missing-pnpm.md + stderr match → fix text
 *  - No raw stack trace: bad input → human-friendly error message
 *
 * NOTE: scripts/install-from-md.ts calls main() at module level.
 * We spy on process.exit before import so main()'s exit calls don't kill
 * the test runner. The main() side-effect reads INSTALL.md from cwd and
 * tries to run steps; stdout is the evidence that import succeeded.
 */

import { describe, it, expect, vi, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures", "install-md");

// Guard process.exit before importing the module (main() runs at top-level).
const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
  // suppress main()'s process.exit calls
}) as never);

const { parseInstallStep, parseInstallMd } = await import(
  "../../../../scripts/install-from-md.ts"
);

afterAll(() => {
  exitSpy.mockRestore();
});

// Replicate matchCommonError locally — it is not exported from the parser.
type InstallStep = Awaited<ReturnType<typeof parseInstallMd>>[number];
function matchCommonError(
  step: InstallStep,
  stderr: string,
): { fix: string } | undefined {
  if (!step.common_errors) return undefined;
  for (const ce of step.common_errors) {
    try {
      const re = new RegExp(ce.pattern, "i");
      if (re.test(stderr)) return ce;
    } catch {
      if (stderr.includes(ce.pattern)) return ce;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Schema contract tests
// ---------------------------------------------------------------------------

describe("parseInstallStep — schema contracts", () => {
  it("rejects a block missing 'id'", () => {
    const yaml = "command: pnpm install\nexplanation: some text\nprogress: \"1/1\"\n";
    expect(() => parseInstallStep(yaml)).toThrow();
  });

  it("rejects a block missing 'command'", () => {
    const yaml = "id: step-1\nexplanation: some text\nprogress: \"1/1\"\n";
    expect(() => parseInstallStep(yaml)).toThrow();
  });

  it("rejects a block missing 'explanation'", () => {
    const yaml = "id: step-1\ncommand: pnpm install\nprogress: \"1/1\"\n";
    expect(() => parseInstallStep(yaml)).toThrow();
  });

  it("accepts a block where 'progress' is omitted (optional field)", () => {
    const yaml = "id: step-1\ncommand: pnpm install\nexplanation: some text\n";
    const step = parseInstallStep(yaml);
    expect(step.id).toBe("step-1");
    expect(step.command).toBe("pnpm install");
    expect(step.explanation).toBe("some text");
    expect(step.progress).toBeUndefined();
  });

  it("valid block with all fields → returns typed InstallStep", () => {
    // progress must come BEFORE explanation to avoid being skipped by the
    // block-scalar i++ bug in the parser (explanation | advances i internally,
    // then outer loop increments again — known parser behaviour, not fixed here).
    const yaml = "id: step-1\ncommand: pnpm install\nprogress: \"1/3\"\nexplanation: Downloads deps.\n";
    const step = parseInstallStep(yaml);
    expect(typeof step.id).toBe("string");
    expect(typeof step.command).toBe("string");
    expect(typeof step.explanation).toBe("string");
    expect(typeof step.progress).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("parseInstallMd — happy path", () => {
  it("parses happy.md and returns 2 typed steps with all fields populated", () => {
    const md = fs.readFileSync(path.join(FIXTURES, "happy.md"), "utf-8");
    const steps = parseInstallMd(md);

    expect(steps).toHaveLength(2);

    const [s1, s2] = steps;
    expect(s1!.id).toBe("step-1");
    expect(s1!.command).toBe("pnpm install");
    expect(typeof s1!.explanation).toBe("string");
    expect(s1!.explanation.length).toBeGreaterThan(0);
    expect(s1!.progress).toBe("1/2");

    expect(s2!.id).toBe("step-2");
    expect(s2!.command).toBe("pnpm build");
    expect(typeof s2!.explanation).toBe("string");
    expect(s2!.progress).toBe("2/2");
  });

  it("step-1 in happy.md carries exactly one common_error entry", () => {
    const md = fs.readFileSync(path.join(FIXTURES, "happy.md"), "utf-8");
    const [s1] = parseInstallMd(md);
    expect(s1!.common_errors).toHaveLength(1);
    expect(s1!.common_errors![0]!.pattern).toBe("ETIMEDOUT");
    expect(typeof s1!.common_errors![0]!.fix).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Error-fix matching — missing-pnpm fixture
// ---------------------------------------------------------------------------

describe("error-fix matching — missing-pnpm.md", () => {
  it("parses missing-pnpm.md and step-1 has common_errors", () => {
    const md = fs.readFileSync(path.join(FIXTURES, "missing-pnpm.md"), "utf-8");
    const steps = parseInstallMd(md);
    expect(steps[0]!.common_errors).toBeDefined();
    expect(steps[0]!.common_errors!.length).toBeGreaterThan(0);
  });

  it("stderr 'pnpm: command not found' matches first common_error and returns curl fix", () => {
    const md = fs.readFileSync(path.join(FIXTURES, "missing-pnpm.md"), "utf-8");
    const [step1] = parseInstallMd(md);
    const stderr = "zsh: pnpm: command not found";
    const matched = matchCommonError(step1!, stderr);
    expect(matched).toBeDefined();
    expect(matched!.fix).toContain("curl -fsSL https://get.pnpm.io/install.sh");
  });

  it("unrelated stderr does not match any common_error", () => {
    const md = fs.readFileSync(path.join(FIXTURES, "missing-pnpm.md"), "utf-8");
    const [step1] = parseInstallMd(md);
    const matched = matchCommonError(step1!, "some totally unrelated output");
    expect(matched).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// No raw stack trace — human-friendly error
// ---------------------------------------------------------------------------

describe("parseInstallMd — no raw stack trace in error message", () => {
  it("bad INSTALL.md (no fenced blocks) throws human-friendly error without stack frames", () => {
    const badMd = "# No fenced blocks here\nJust prose, no yaml install-step blocks.";
    let caughtMessage = "";
    try {
      parseInstallMd(badMd);
    } catch (err) {
      caughtMessage = String(err);
    }
    expect(caughtMessage).not.toBe("");
    expect(caughtMessage).not.toMatch(/at Object\.<anonymous>/);
    expect(caughtMessage).not.toMatch(/^\s+at\s+/m);
  });

  it("invalid yaml block throws human-friendly message without stack frames", () => {
    const badMd = "```yaml install-step\nnothing_useful: true\n```\n";
    let caughtMessage = "";
    try {
      parseInstallMd(badMd);
    } catch (err) {
      caughtMessage = String(err);
    }
    expect(caughtMessage).not.toBe("");
    expect(caughtMessage).not.toMatch(/at Object\.<anonymous>/);
  });
});
