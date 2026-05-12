import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsCopyBridge } from "../testing/fs-copy-bridge.js";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(
  projectRoot: string,
  author: string,
  ruleId: string,
  payload: unknown,
): Promise<string> {
  const dir = path.join(projectRoot, ".teamagent", "team", author);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${ruleId}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload), "utf8");
  return filePath;
}

describe("FsCopyBridge.copyTeamRules", () => {
  let src: string;
  let dst: string;

  beforeEach(async () => {
    src = await fs.mkdtemp(path.join(os.tmpdir(), "fs-copy-bridge-src-"));
    dst = await fs.mkdtemp(path.join(os.tmpdir(), "fs-copy-bridge-dst-"));
  });

  afterEach(async () => {
    await fs.rm(src, { recursive: true, force: true });
    await fs.rm(dst, { recursive: true, force: true });
  });

  it("returns 0 and does NOT create dest .teamagent/team/ when source dir does not exist", async () => {
    const bridge = createFsCopyBridge();
    const count = await bridge.copyTeamRules(src, dst);
    expect(count).toBe(0);
    expect(await exists(path.join(dst, ".teamagent", "team"))).toBe(false);
  });

  it("returns 0 when .teamagent/team/ exists but has no author subdirs", async () => {
    await fs.mkdir(path.join(src, ".teamagent", "team"), { recursive: true });
    const bridge = createFsCopyBridge();
    const count = await bridge.copyTeamRules(src, dst);
    expect(count).toBe(0);
  });

  it("returns 0 when author dirs exist but contain no .json files", async () => {
    await fs.mkdir(path.join(src, ".teamagent", "team", "alice"), {
      recursive: true,
    });
    const bridge = createFsCopyBridge();
    const count = await bridge.copyTeamRules(src, dst);
    expect(count).toBe(0);
  });

  it("copies a single .json file from a single author and preserves content", async () => {
    await writeJson(src, "alice", "rule-1", { rule_id: "rule-1", v: 1 });
    const bridge = createFsCopyBridge();
    const count = await bridge.copyTeamRules(src, dst);
    expect(count).toBe(1);
    const destPath = path.join(
      dst,
      ".teamagent",
      "team",
      "alice",
      "rule-1.json",
    );
    expect(await exists(destPath)).toBe(true);
    const content = await fs.readFile(destPath, "utf8");
    expect(JSON.parse(content)).toEqual({ rule_id: "rule-1", v: 1 });
  });

  it("copies all .json files across multiple authors and multiple rules", async () => {
    await writeJson(src, "alice", "rule-1", { id: "a1" });
    await writeJson(src, "alice", "rule-2", { id: "a2" });
    await writeJson(src, "bob", "rule-3", { id: "b3" });
    await writeJson(src, "carol", "rule-4", { id: "c4" });

    const bridge = createFsCopyBridge();
    const count = await bridge.copyTeamRules(src, dst);
    expect(count).toBe(4);

    for (const [author, rule, payload] of [
      ["alice", "rule-1", { id: "a1" }],
      ["alice", "rule-2", { id: "a2" }],
      ["bob", "rule-3", { id: "b3" }],
      ["carol", "rule-4", { id: "c4" }],
    ] as const) {
      const p = path.join(
        dst,
        ".teamagent",
        "team",
        author,
        `${rule}.json`,
      );
      expect(await exists(p)).toBe(true);
      const raw = await fs.readFile(p, "utf8");
      expect(JSON.parse(raw)).toEqual(payload);
    }
  });

  it("does NOT copy non-.json files inside an author dir", async () => {
    await writeJson(src, "alice", "rule-1", { id: "a1" });
    const authorDir = path.join(src, ".teamagent", "team", "alice");
    await fs.writeFile(path.join(authorDir, "README.md"), "readme", "utf8");
    await fs.writeFile(path.join(authorDir, "notes.txt"), "notes", "utf8");
    await fs.writeFile(path.join(authorDir, "rule-1.json.bak"), "{}", "utf8");

    const bridge = createFsCopyBridge();
    const count = await bridge.copyTeamRules(src, dst);
    expect(count).toBe(1);
    const dstAuthor = path.join(dst, ".teamagent", "team", "alice");
    expect(await exists(path.join(dstAuthor, "rule-1.json"))).toBe(true);
    expect(await exists(path.join(dstAuthor, "README.md"))).toBe(false);
    expect(await exists(path.join(dstAuthor, "notes.txt"))).toBe(false);
    expect(await exists(path.join(dstAuthor, "rule-1.json.bak"))).toBe(false);
  });

  it("does NOT recurse into subdirectories inside an author dir", async () => {
    await writeJson(src, "alice", "rule-top", { id: "top" });
    const nestedDir = path.join(
      src,
      ".teamagent",
      "team",
      "alice",
      "nested",
    );
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(
      path.join(nestedDir, "deep.json"),
      JSON.stringify({ id: "deep" }),
      "utf8",
    );

    const bridge = createFsCopyBridge();
    const count = await bridge.copyTeamRules(src, dst);
    expect(count).toBe(1);
    expect(
      await exists(
        path.join(dst, ".teamagent", "team", "alice", "rule-top.json"),
      ),
    ).toBe(true);
    expect(
      await exists(
        path.join(dst, ".teamagent", "team", "alice", "nested", "deep.json"),
      ),
    ).toBe(false);
    expect(
      await exists(path.join(dst, ".teamagent", "team", "alice", "nested")),
    ).toBe(false);
  });

  it("is idempotent: running twice returns the same count both times", async () => {
    await writeJson(src, "alice", "rule-1", { id: "a1" });
    await writeJson(src, "bob", "rule-2", { id: "b2" });
    const bridge = createFsCopyBridge();
    const first = await bridge.copyTeamRules(src, dst);
    const second = await bridge.copyTeamRules(src, dst);
    expect(first).toBe(2);
    expect(second).toBe(2);
    const p1 = path.join(dst, ".teamagent", "team", "alice", "rule-1.json");
    const p2 = path.join(dst, ".teamagent", "team", "bob", "rule-2.json");
    expect(JSON.parse(await fs.readFile(p1, "utf8"))).toEqual({ id: "a1" });
    expect(JSON.parse(await fs.readFile(p2, "utf8"))).toEqual({ id: "b2" });
  });

  it("overwrites existing destination files (last-write-wins)", async () => {
    // Pre-populate destination with old content for the same rule path.
    const destAlice = path.join(dst, ".teamagent", "team", "alice");
    await fs.mkdir(destAlice, { recursive: true });
    await fs.writeFile(
      path.join(destAlice, "rule-1.json"),
      JSON.stringify({ id: "OLD" }),
      "utf8",
    );

    // Source has fresh content.
    await writeJson(src, "alice", "rule-1", { id: "NEW" });

    const bridge = createFsCopyBridge();
    const count = await bridge.copyTeamRules(src, dst);
    expect(count).toBe(1);
    const raw = await fs.readFile(
      path.join(destAlice, "rule-1.json"),
      "utf8",
    );
    expect(JSON.parse(raw)).toEqual({ id: "NEW" });
  });

  it("leaves no .tmp files behind after a successful copy", async () => {
    await writeJson(src, "alice", "rule-1", { id: "a1" });
    await writeJson(src, "alice", "rule-2", { id: "a2" });
    const bridge = createFsCopyBridge();
    await bridge.copyTeamRules(src, dst);
    const dstAuthor = path.join(dst, ".teamagent", "team", "alice");
    const entries = await fs.readdir(dstAuthor);
    for (const e of entries) {
      expect(e.endsWith(".tmp")).toBe(false);
      expect(e.includes(".tmp.")).toBe(false);
    }
    expect(entries.sort()).toEqual(["rule-1.json", "rule-2.json"]);
  });
});
