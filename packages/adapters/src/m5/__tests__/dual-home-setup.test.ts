import { promises as fs } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { setupDualHomes } from "../testing/dual-home-setup.js";

async function isDirectory(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("setupDualHomes", () => {
  it("returns 4 distinct absolute paths that exist as directories", async () => {
    const ctx = await setupDualHomes();
    try {
      const paths = [ctx.homeA, ctx.homeB, ctx.projectA, ctx.projectB];
      for (const p of paths) {
        expect(path.isAbsolute(p)).toBe(true);
        expect(await isDirectory(p)).toBe(true);
      }
      const unique = new Set(paths);
      expect(unique.size).toBe(4);
    } finally {
      await ctx.cleanup();
    }
  });

  it("creates .teamagent/team/ inside each project dir", async () => {
    const ctx = await setupDualHomes();
    try {
      expect(
        await isDirectory(path.join(ctx.projectA, ".teamagent", "team")),
      ).toBe(true);
      expect(
        await isDirectory(path.join(ctx.projectB, ".teamagent", "team")),
      ).toBe(true);
    } finally {
      await ctx.cleanup();
    }
  });

  it("creates .claude/ inside each HOME dir", async () => {
    const ctx = await setupDualHomes();
    try {
      expect(await isDirectory(path.join(ctx.homeA, ".claude"))).toBe(true);
      expect(await isDirectory(path.join(ctx.homeB, ".claude"))).toBe(true);
    } finally {
      await ctx.cleanup();
    }
  });

  it("cleanup removes everything and is idempotent", async () => {
    const ctx = await setupDualHomes();
    expect(await exists(ctx.homeA)).toBe(true);

    await ctx.cleanup();
    expect(await exists(ctx.homeA)).toBe(false);
    expect(await exists(ctx.homeB)).toBe(false);
    expect(await exists(ctx.projectA)).toBe(false);
    expect(await exists(ctx.projectB)).toBe(false);

    await expect(ctx.cleanup()).resolves.toBeUndefined();
  });

  it("honors custom prefix in the tmp dir basename", async () => {
    const prefix = "custom-prefix-test";
    const ctx = await setupDualHomes({ prefix });
    try {
      const parent = path.dirname(ctx.homeA);
      const base = path.basename(parent);
      expect(base.startsWith(prefix)).toBe(true);
    } finally {
      await ctx.cleanup();
    }
  });

  it("uses default prefix teamagent-m5-l4 when none provided", async () => {
    const ctx = await setupDualHomes();
    try {
      const parent = path.dirname(ctx.homeA);
      const base = path.basename(parent);
      expect(base.startsWith("teamagent-m5-l4")).toBe(true);
    } finally {
      await ctx.cleanup();
    }
  });

  it("concurrent calls produce distinct parent dirs and no path collisions", async () => {
    const ctxs = await Promise.all([
      setupDualHomes(),
      setupDualHomes(),
      setupDualHomes(),
    ]);
    try {
      const allPaths = ctxs.flatMap((c) => [
        c.homeA,
        c.homeB,
        c.projectA,
        c.projectB,
      ]);
      const unique = new Set(allPaths);
      expect(unique.size).toBe(allPaths.length);
    } finally {
      await Promise.all(ctxs.map((c) => c.cleanup()));
    }
  });
});
