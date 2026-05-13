import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Issue #290 — project-level Codex hook config + adapters.
 *
 * Static contract test: `.codex/hooks.json` is the single source of truth
 * for how Codex CLI discovers TeamBrain lifecycle hooks (shape defined in
 * docs/features/codex-hooks-spec.md §1 + §3). The test checks the file
 * ships with the three required event registrations and that the
 * PreToolUse adapter script lives where the registration points.
 *
 * Out of scope (covered by sibling issues):
 *   - Running the adapter or invoking Codex itself — install-hook
 *     idempotency lives in #292.
 *   - `teamagent init --target=codex/both` parameterization — #291.
 *   - hook parity ASCII diagram in hooks-status.md — #293.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(): string {
  // Walk up from this test file until we find pnpm-workspace.yaml (TeamBrain
  // monorepo marker). Don't trust process.cwd() — vitest can run from any
  // package depending on invocation.
  let dir = here;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("repo root not found (no pnpm-workspace.yaml in ancestors)");
}

const repoRoot = findRepoRoot();
const hooksJsonPath = path.join(repoRoot, ".codex", "hooks.json");

interface CodexHookEntry {
  matcher?: string;
  hooks: Array<{ type: string; command: string; timeout?: number }>;
}
interface CodexHooksConfig {
  hooks: Record<string, CodexHookEntry[]>;
}

function loadConfig(): CodexHooksConfig {
  return JSON.parse(readFileSync(hooksJsonPath, "utf8")) as CodexHooksConfig;
}

describe(".codex/hooks.json (issue #290)", () => {
  it("registers SessionStart, PreToolUse, and Stop events", () => {
    const cfg = loadConfig();
    expect(Object.keys(cfg.hooks).sort()).toEqual([
      "PreToolUse",
      "SessionStart",
      "Stop",
    ]);
  });

  it("PreToolUse matcher targets Bash, apply_patch, and WebFetch", () => {
    const cfg = loadConfig();
    const block = cfg.hooks.PreToolUse?.[0];
    // Per docs/features/codex-hooks-spec.md §5.4 + §4: Codex collapses
    // Write+Edit into the single `apply_patch` tool, so the direct
    // translation of Claude's installHook() matcher `Bash|Write|Edit|WebFetch`
    // is `Bash|apply_patch|WebFetch`.
    expect(block?.matcher).toBe("Bash|apply_patch|WebFetch");
  });

  it("PreToolUse command routes to the project-local adapter shell script", () => {
    const cfg = loadConfig();
    const cmd = cfg.hooks.PreToolUse?.[0]?.hooks?.[0]?.command ?? "";
    expect(cmd).toContain(".codex/hooks/pre-tool-use-adapter.sh");
    expect(cfg.hooks.PreToolUse?.[0]?.hooks?.[0]?.type).toBe("command");
  });

  it("PreToolUse timeout is 30s, matching Claude installHook() PreToolUse default", () => {
    const cfg = loadConfig();
    expect(cfg.hooks.PreToolUse?.[0]?.hooks?.[0]?.timeout).toBe(30);
  });

  it("PreToolUse adapter script file exists in repo", () => {
    expect(
      existsSync(path.join(repoRoot, ".codex", "hooks", "pre-tool-use-adapter.sh")),
    ).toBe(true);
  });

  it("PreToolUse adapter contains the exec-node-on-cjs handoff", () => {
    // Adapter is a thin passthrough: it must locate bin-pre-tool-use.cjs
    // and exec node on it (not re-implement the matcher in bash).
    const adapter = readFileSync(
      path.join(repoRoot, ".codex", "hooks", "pre-tool-use-adapter.sh"),
      "utf8",
    );
    expect(adapter).toMatch(/exec node\s+["']?\$cjs/);
    expect(adapter).toContain("bin-pre-tool-use.cjs");
  });

  it("does NOT mutate Claude scripts — no .claude/* path string in adapter", () => {
    const adapter = readFileSync(
      path.join(repoRoot, ".codex", "hooks", "pre-tool-use-adapter.sh"),
      "utf8",
    );
    // Issue #290 Acceptance: "no Claude script is mutated". The adapter is
    // allowed to mention paths into ~/.teamagent/ and dist/, but must not
    // poke into the user's .claude/ tree.
    expect(adapter).not.toMatch(/\.claude\//);
  });
});
