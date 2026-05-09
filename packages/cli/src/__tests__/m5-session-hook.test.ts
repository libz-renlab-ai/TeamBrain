import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { isInfected } from "../m5-session-hook.js";

describe("isInfected walk-up (#161)", () => {
  it("finds manifest.json in parent when cwd is a subfolder", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-"));
    try {
      // Create knowledge.db and manifest.json at root
      const teamagentDir = path.join(root, ".teamagent");
      fs.mkdirSync(teamagentDir, { recursive: true });
      fs.writeFileSync(path.join(teamagentDir, "knowledge.db"), "");
      fs.writeFileSync(path.join(teamagentDir, "manifest.json"), "{}");
      // Subfolder has no .teamagent
      const sub = path.join(root, "sub");
      fs.mkdirSync(sub, { recursive: true });
      expect(isInfected(sub)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
