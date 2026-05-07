/**
 * install-from-md.ts — Parses INSTALL.md and runs each install step.
 *
 * Usage:
 *   pnpm install:from-md              # run all steps
 *   pnpm install:from-md --dry-run    # parse + print, no execution
 *   pnpm install:from-md --step s1    # run single step by id
 *
 * Exit codes:
 *   0 = all steps succeeded
 *   1 = one or more steps failed (fix hint printed to stdout)
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Schema types (mirrors INSTALL.md fenced yaml install-step blocks)
// ---------------------------------------------------------------------------

interface CommonError {
  pattern: string;
  fix: string;
}

export interface InstallStep {
  id: string;
  command: string;
  explanation: string;
  progress?: string;
  common_errors?: CommonError[];
}

// ---------------------------------------------------------------------------
// Parser — minimal hand-rolled yaml parser for fenced ```yaml install-step blocks
// ---------------------------------------------------------------------------

/**
 * Extracts all ```yaml install-step ... ``` fenced blocks from markdown text.
 * Returns an array of raw yaml strings (the content inside the fences).
 */
function extractFencedBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  // Matches ```yaml install-step\n...\n``` fences
  const fenceRe = /^```yaml install-step\s*\n([\s\S]*?)^```/gm;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(markdown)) !== null) {
    if (match[1] !== undefined) {
      blocks.push(match[1]);
    }
  }
  return blocks;
}

/**
 * Minimal YAML parser for the install-step schema.
 * Handles: scalar strings, multi-line "|" scalars, and the common_errors list.
 * Does NOT handle general YAML — only the fields defined in the schema.
 */
export function parseInstallStep(yaml: string): InstallStep {
  const lines = yaml.split("\n");
  const step: Partial<InstallStep> = {};
  const commonErrors: CommonError[] = [];

  let i = 0;

  function readScalar(startLine: string, indent: number): string {
    // Inline value on same line as key
    const colonIdx = startLine.indexOf(":");
    const rest = startLine.slice(colonIdx + 1).trim();
    if (rest === "|") {
      // Block scalar: collect following lines until indent drops
      const collected: string[] = [];
      i++;
      while (i < lines.length) {
        const line = lines[i];
        if (line === undefined) break;
        if (line.trim() === "") {
          collected.push("");
          i++;
          continue;
        }
        const lineIndent = line.search(/\S/);
        if (lineIndent <= indent) break;
        collected.push(line.slice(indent + 2)); // strip leading indent
        i++;
      }
      // Back up one so the outer i++ lands on the correct next field.
      i--;
      return collected.join("\n").trimEnd();
    }
    if (rest.startsWith('"') && rest.endsWith('"')) {
      return rest.slice(1, -1);
    }
    if (rest.startsWith("'") && rest.endsWith("'")) {
      return rest.slice(1, -1);
    }
    return rest;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) { i++; continue; }
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) { i++; continue; }

    const indent = line.search(/\S/);

    if (trimmed.startsWith("id:")) {
      step.id = readScalar(trimmed, indent);
      i++;
    } else if (trimmed.startsWith("command:")) {
      step.command = readScalar(trimmed, indent);
      i++;
    } else if (trimmed.startsWith("explanation:")) {
      step.explanation = readScalar(trimmed, indent);
      i++;
    } else if (trimmed.startsWith("progress:")) {
      step.progress = readScalar(trimmed, indent);
      i++;
    } else if (trimmed === "common_errors:") {
      // Parse list of {pattern, fix} maps
      i++;
      while (i < lines.length) {
        const errLine = lines[i];
        if (errLine === undefined) break;
        const errTrimmed = errLine.trim();
        if (errTrimmed === "") { i++; continue; }
        const errIndent = errLine.search(/\S/);
        if (errIndent <= indent && errTrimmed !== "") break; // back to parent level
        if (errTrimmed.startsWith("- pattern:")) {
          const patternVal = errTrimmed.slice("- pattern:".length).trim();
          const errEntry: Partial<CommonError> = { pattern: unquote(patternVal) };
          i++;
          // Look for matching fix on next line
          while (i < lines.length) {
            const fixLine = lines[i];
            if (fixLine === undefined) break;
            const fixTrimmed = fixLine.trim();
            if (fixTrimmed === "") { i++; continue; }
            if (fixTrimmed.startsWith("fix:")) {
              const fixVal = fixTrimmed.slice("fix:".length).trim();
              errEntry.fix = unquote(fixVal);
              i++;
              break;
            }
            break;
          }
          if (errEntry.pattern !== undefined && errEntry.fix !== undefined) {
            commonErrors.push(errEntry as CommonError);
          }
        } else {
          i++;
        }
      }
    } else {
      i++;
    }
  }

  if (commonErrors.length > 0) {
    step.common_errors = commonErrors;
  }

  if (!step.id || !step.command || !step.explanation) {
    throw new Error(
      `Invalid install-step: missing required field(s). Got: ${JSON.stringify(step)}`
    );
  }

  return step as InstallStep;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Parse an INSTALL.md file and return ordered steps.
 */
export function parseInstallMd(markdown: string): InstallStep[] {
  const blocks = extractFencedBlocks(markdown);
  if (blocks.length === 0) {
    throw new Error("No install-step blocks found in INSTALL.md");
  }
  return blocks.map((block, idx) => {
    try {
      return parseInstallStep(block);
    } catch (err) {
      throw new Error(`Failed to parse install-step block #${idx + 1}: ${String(err)}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface StepResult {
  id: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  fixPrinted?: string;
}

function runStep(step: InstallStep): StepResult {
  console.log(`\n[${step.id}] ${step.explanation}`);
  if (step.progress) {
    console.log(`      ${step.progress}`);
  }
  console.log(`  $ ${step.command}`);

  const result = spawnSync(step.command, {
    shell: true,
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = result.status ?? 1;

  if (stdout.trim()) process.stdout.write(stdout);

  if (exitCode !== 0) {
    const combined = stdout + "\n" + stderr;
    const matched = matchCommonError(step, combined);
    if (matched) {
      console.log(`\n[${step.id}] Fix hint:`);
      console.log(`  ${matched.fix}`);
      return { id: step.id, command: step.command, exitCode, stdout, stderr, fixPrinted: matched.fix };
    } else {
      // Print stderr lines without raw JS stack trace
      const safeLines = filterSafeLines(stderr);
      if (safeLines.length > 0) {
        console.log(`\n[${step.id}] Error output:`);
        safeLines.forEach(l => console.log(`  ${l}`));
      }
    }
  }

  return { id: step.id, command: step.command, exitCode, stdout, stderr };
}

function matchCommonError(step: InstallStep, output: string): CommonError | undefined {
  if (!step.common_errors) return undefined;
  for (const ce of step.common_errors) {
    try {
      const re = new RegExp(ce.pattern, "i");
      if (re.test(output)) return ce;
    } catch {
      // Treat pattern as literal substring if invalid regex
      if (output.includes(ce.pattern)) return ce;
    }
  }
  return undefined;
}

/** Remove lines that look like raw Node.js stack traces. */
function filterSafeLines(text: string): string[] {
  return text
    .split("\n")
    .filter(l => !/^\s+at\s+/.test(l))   // stack frames: "    at Foo (bar.js:1:2)"
    .filter(l => l.trim() !== "");
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function printUsage() {
  console.log("Usage: pnpm install:from-md [--dry-run] [--step <id>] [<path>]");
  console.log("  Default path: INSTALL.md");
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const dryRun = args.includes("--dry-run");
  const stepIdx = args.indexOf("--step");
  const stepFilter = stepIdx !== -1 ? args[stepIdx + 1] : undefined;

  // Find INSTALL.md path (last non-flag arg or default)
  const mdPath = args.filter(a => !a.startsWith("-") && a !== stepFilter).at(-1) ?? "INSTALL.md";
  const resolvedPath = resolve(process.cwd(), mdPath);

  let markdown: string;
  try {
    markdown = readFileSync(resolvedPath, "utf-8");
  } catch {
    console.error(`Cannot read ${resolvedPath}`);
    process.exit(1);
  }

  let steps: InstallStep[];
  try {
    steps = parseInstallMd(markdown);
  } catch (err) {
    console.error(`Parse error: ${String(err)}`);
    process.exit(1);
  }

  const toRun = stepFilter
    ? steps.filter(s => s.id === stepFilter)
    : steps;

  if (stepFilter && toRun.length === 0) {
    console.error(`No step with id "${stepFilter}" found.`);
    console.error(`Available: ${steps.map(s => s.id).join(", ")}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`Dry run — ${toRun.length} step(s) from ${mdPath}:`);
    for (const step of toRun) {
      console.log(`  [${step.id}] ${step.command}`);
      console.log(`    ${step.explanation}`);
    }
    process.exit(0);
  }

  let anyFailed = false;
  for (const step of toRun) {
    const result = runStep(step);
    if (result.exitCode !== 0) {
      anyFailed = true;
      break; // stop on first failure so user can fix before continuing
    }
  }

  process.exit(anyFailed ? 1 : 0);
}

main();
