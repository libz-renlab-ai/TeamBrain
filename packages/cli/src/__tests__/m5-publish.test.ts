import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runM5Publish, parseM5PublishArgs } from "../commands/m5-publish.js";

async function mkRepo(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-publish-test-"));
  execSync("git init -q", { cwd: root });
  execSync("git config user.email test@local", { cwd: root });
  execSync("git config user.name tester", { cwd: root });
  await fs.writeFile(path.join(root, "README.md"), "# test\n");
  execSync("git add .", { cwd: root });
  execSync("git commit -qm init", { cwd: root });
  await fs.mkdir(path.join(root, ".teamagent", "team", "tester"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".teamagent", "team", "tester", "rule-1.json"),
    JSON.stringify({ author: "tester", rule_id: "rule-1", current: { content: "x", scope: "team", confidence: 0.5, deleted: false, modified_by: "tester", modified_ts: "2026-05-07T00:00:00Z" } }),
  );
  return {
    root,
    cleanup: async () => fs.rm(root, { recursive: true, force: true }),
  };
}

describe("m5-publish — B-111 default push behavior", () => {
  it("does NOT push by default (matches CLI help: '--push 同时推 origin')", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      const result = await runM5Publish({ projectRoot: root });
      expect(result.committed).toBe(true);
      // Default: pushed must be false because --push was not given.
      expect(result.pushed).toBe(false);
      // No push attempt was made — push_error stays undefined.
      expect(result.push_error).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("pushes only when push=true is explicit", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      const result = await runM5Publish({ projectRoot: root, push: true });
      expect(result.committed).toBe(true);
      // No remote configured — push will fail, but the attempt happened.
      expect(result.pushed).toBe(false);
      expect(result.push_error).toBeDefined();
      expect(result.push_error).toMatch(/push|remote/i);
    } finally {
      await cleanup();
    }
  });

  it("--push sets push=true", () => {
    const opts = parseM5PublishArgs(["--push", "--project-root=/x"]);
    expect(opts.push).toBe(true);
  });

  it("--no-push sets push=false (explicit)", () => {
    const opts = parseM5PublishArgs(["--no-push", "--project-root=/x"]);
    expect(opts.push).toBe(false);
  });

  it("absent flag leaves push undefined (default applies inside runM5Publish)", () => {
    const opts = parseM5PublishArgs(["--project-root=/x"]);
    expect(opts.push).toBeUndefined();
  });
});
