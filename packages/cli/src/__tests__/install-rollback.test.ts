import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  backupExistingInstall,
  rollbackFromBackup,
  pruneOldBackups,
  type BackupResult,
} from "../lib/install-backup.js";

let tmp: string;
let homeDir: string;
let installDir: string;
let backupDir: string;
let logFile: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "install-rollback-"));
  homeDir = path.join(tmp, "home");
  installDir = path.join(tmp, "lib", "teamagent");
  backupDir = path.join(homeDir, ".teamagent", "backups");
  logFile = path.join(homeDir, ".teamagent", "postinstall.log");
  fs.mkdirSync(homeDir, { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
});

function seedInstall(filename = "marker.txt", content = "v0"): void {
  fs.mkdirSync(path.join(installDir, "dist"), { recursive: true });
  fs.writeFileSync(path.join(installDir, filename), content);
  fs.writeFileSync(path.join(installDir, "dist", "bin.js"), "console.log('stub')");
}

function readLogLines(): string[] {
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, "utf-8").trim().split(/\r?\n/).filter(Boolean);
}

describe("backupExistingInstall", () => {
  it("returns skipped status when no existing install present", () => {
    const r = backupExistingInstall({ homeDir, installDir });
    expect(r.status).toBe("skipped");
    expect(r.reason).toBe("no-existing-install");
    expect(fs.existsSync(backupDir)).toBe(false);
  });

  it("returns skipped status when install dir is empty", () => {
    fs.mkdirSync(installDir, { recursive: true });
    const r = backupExistingInstall({ homeDir, installDir });
    expect(r.status).toBe("skipped");
    expect(r.reason).toBe("empty-install");
  });

  it("creates a .tgz backup when install dir is present and non-empty", () => {
    seedInstall();
    const r = backupExistingInstall({
      homeDir,
      installDir,
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(r.status).toBe("ok");
    expect(r.backupPath).toBeDefined();
    expect(fs.existsSync(r.backupPath!)).toBe(true);
    expect(r.backupPath!.endsWith(".tgz")).toBe(true);
    // ISO timestamp shape (we strip colons / dots for filesystem-safe filenames)
    expect(path.basename(r.backupPath!)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}.*\.tgz$/,
    );
  });
});

describe("pruneOldBackups", () => {
  function plant(name: string, mtimeOffsetMs: number): string {
    fs.mkdirSync(backupDir, { recursive: true });
    const full = path.join(backupDir, name);
    fs.writeFileSync(full, "stub-tgz");
    const t = Date.now() + mtimeOffsetMs;
    fs.utimesSync(full, t / 1000, t / 1000);
    return full;
  }

  it("keeps the 3 most recent backups, evicts older (FIFO)", () => {
    plant("2026-05-01T00-00-00Z.tgz", -50_000);
    plant("2026-05-02T00-00-00Z.tgz", -40_000);
    plant("2026-05-03T00-00-00Z.tgz", -30_000);
    plant("2026-05-04T00-00-00Z.tgz", -20_000);
    plant("2026-05-05T00-00-00Z.tgz", -10_000);
    pruneOldBackups({ homeDir, keep: 3 });
    const left = fs.readdirSync(backupDir).sort();
    expect(left).toEqual([
      "2026-05-03T00-00-00Z.tgz",
      "2026-05-04T00-00-00Z.tgz",
      "2026-05-05T00-00-00Z.tgz",
    ]);
  });

  it("no-op when backup dir does not exist", () => {
    expect(() => pruneOldBackups({ homeDir, keep: 3 })).not.toThrow();
  });

  it("ignores non-.tgz files in backup dir", () => {
    plant("README.md", -10_000);
    plant("2026-05-05T00-00-00Z.tgz", -5_000);
    pruneOldBackups({ homeDir, keep: 1 });
    const left = fs.readdirSync(backupDir).sort();
    expect(left).toContain("README.md");
    expect(left).toContain("2026-05-05T00-00-00Z.tgz");
  });
});

describe("rollbackFromBackup", () => {
  it("restores files from a real backup created by backupExistingInstall", () => {
    seedInstall("marker.txt", "ORIGINAL");
    const b = backupExistingInstall({
      homeDir,
      installDir,
      now: new Date("2026-05-09T10:00:00.000Z"),
    });
    expect(b.status).toBe("ok");
    // Simulate a destructive failed install: wipe + rewrite with broken content
    fs.rmSync(installDir, { recursive: true, force: true });
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, "marker.txt"), "BROKEN-HALF-INSTALL");

    const r = rollbackFromBackup({
      homeDir,
      installDir,
      backupPath: b.backupPath!,
    });
    expect(r.status).toBe("ok");
    const restored = fs.readFileSync(path.join(installDir, "marker.txt"), "utf-8");
    expect(restored).toBe("ORIGINAL");
    // log line contract
    const lines = readLogLines();
    const rollback = lines.find((l) => l.includes("stage=install") && l.includes("status=rolled-back"));
    expect(rollback).toBeDefined();
    expect(rollback).toContain(`source=${b.backupPath}`);
  });

  it("returns error status when backup file is missing / corrupt", () => {
    const phantom = path.join(backupDir, "does-not-exist.tgz");
    const r = rollbackFromBackup({
      homeDir,
      installDir,
      backupPath: phantom,
    });
    expect(r.status).toBe("error");
    expect(r.reason).toMatch(/missing|not.*exist|corrupt/i);
  });

  it("normalizes Windows-style backslash paths", () => {
    seedInstall();
    const b = backupExistingInstall({
      homeDir,
      installDir,
      now: new Date("2026-05-09T11:00:00.000Z"),
    });
    expect(b.status).toBe("ok");
    // pass the same path with backslashes (simulates Windows shell quoting)
    const winStyle = b.backupPath!.replace(/\//g, path.sep);
    fs.rmSync(installDir, { recursive: true, force: true });
    const r = rollbackFromBackup({
      homeDir,
      installDir,
      backupPath: winStyle,
    });
    expect(r.status).toBe("ok");
  });

  it("refuses to rm installDir when the backup tarball is corrupt (#158 iter-1 hardening)", () => {
    // Seed a real install that we expect to survive the rollback attempt.
    seedInstall("marker.txt", "PRESERVED");

    // Plant a "backup" file that exists, has size > 0, and ends in .tgz —
    // but is NOT a valid gzip stream. This is exactly what an interrupted
    // backup write or a bit-flipped on-disk file looks like to the existsSync
    // + statSync gate. Without `tar -tzf` validation, rollbackFromBackup
    // would `rm -rf installDir` first and tar -xzf fails second, leaving
    // the install empty — exactly the partial-install corruption #158 set
    // out to prevent.
    fs.mkdirSync(backupDir, { recursive: true });
    const corruptBackup = path.join(backupDir, "2026-05-09T13-00-00-000Z.tgz");
    fs.writeFileSync(corruptBackup, "this is not a gzip stream\n");

    const r = rollbackFromBackup({
      homeDir,
      installDir,
      backupPath: corruptBackup,
    });

    expect(r.status).toBe("error");
    expect(r.reason ?? "").toMatch(/backup-validation-failed|tar/i);

    // The crucial assertion: the existing install must still be present.
    // If this fails, we've recreated the very bug #158 was filed for.
    expect(fs.existsSync(path.join(installDir, "marker.txt"))).toBe(true);
    expect(
      fs.readFileSync(path.join(installDir, "marker.txt"), "utf-8"),
    ).toBe("PRESERVED");
    // Log entry must record the skip with reason=backup-validation-failed.
    const lines = readLogLines();
    const skip = lines.find((l) =>
      l.includes("stage=install") && l.includes("status=rollback-skipped"),
    );
    expect(skip).toBeDefined();
    expect(skip).toContain("reason=backup-validation-failed");
  });
});

describe("end-to-end policy", () => {
  it("backup → simulated install failure → rollback restores prior state", () => {
    seedInstall("v.txt", "1.0.0");
    const b = backupExistingInstall({
      homeDir,
      installDir,
      now: new Date("2026-05-09T12:00:00.000Z"),
    });
    expect(b.status).toBe("ok");

    // Simulate npm reify mid-failure: removes old content, fails before installing new
    fs.rmSync(installDir, { recursive: true, force: true });

    expect(fs.existsSync(installDir)).toBe(false);

    const r = rollbackFromBackup({
      homeDir,
      installDir,
      backupPath: b.backupPath!,
    });
    expect(r.status).toBe("ok");
    expect(fs.readFileSync(path.join(installDir, "v.txt"), "utf-8")).toBe("1.0.0");
  });
});
