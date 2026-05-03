import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findUpdaterBinary,
  runUpdateCommand,
  parseUpdateArgs,
  writeState,
} from "../commands/update.js";
import { defaultUpdateState } from "@teamagent/core";

let tmpHome: string;
let envBak: string | undefined;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tg-upd-cmd-"));
  envBak = process.env["TEAMAGENT_HOME"];
  process.env["TEAMAGENT_HOME"] = tmpHome;
});

afterEach(() => {
  if (envBak === undefined) delete process.env["TEAMAGENT_HOME"];
  else process.env["TEAMAGENT_HOME"] = envBak;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("update command", () => {
  it("status default returns full snapshot", async () => {
    const s = defaultUpdateState();
    s.last_installed_sha = "abcdef1234";
    writeState(s);
    const r = await runUpdateCommand("status");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("abcdef1234");
    expect(r.output).toContain("updater_binary:");
  });

  it("findUpdaterBinary exposes missing updater without running install", () => {
    const fakeModule = path.join(tmpHome, "src", "commands", "update.js");
    expect(findUpdaterBinary(`file://${fakeModule}`)).toBeNull();
  });

  it("disable creates marker, enable removes", async () => {
    const dis = await runUpdateCommand("disable");
    expect(dis.ok).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, "auto-update.disabled"))).toBe(true);
    const en = await runUpdateCommand("enable");
    expect(en.ok).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, "auto-update.disabled"))).toBe(false);
  });

  it("logs shows tail or empty", async () => {
    const r = await runUpdateCommand("logs");
    expect(r.output).toBe("(empty)\n");
    fs.writeFileSync(path.join(tmpHome, "update.log"), "line1\nline2\n");
    const r2 = await runUpdateCommand("logs");
    expect(r2.output).toContain("line1");
  });

  it("parseUpdateArgs picks correct subcommand", () => {
    expect(parseUpdateArgs(["--status"]).sub).toBe("status");
    expect(parseUpdateArgs(["--check"]).sub).toBe("check");
    expect(parseUpdateArgs(["--rollback", "abc"]).rest).toEqual(["abc"]);
    expect(parseUpdateArgs([]).sub).toBe("status");
  });

  it("rollback with no backups returns error", async () => {
    const r = await runUpdateCommand("rollback", []);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("no backups");
  });
});
