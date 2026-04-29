import { describe, it, expect, vi } from "vitest";
import { runMigrateAuto } from "../commands/migrate-auto.js";

describe("runMigrateAuto", () => {
  it("returns ok when all steps exit 0", async () => {
    const runStep = vi.fn().mockResolvedValue(0);
    const r = await runMigrateAuto({ runStep });
    expect(r.ok).toBe(true);
    expect(r.steps).toHaveLength(2);
    expect(r.steps.map((s) => s.cmd)).toEqual(["migrate-v6", "migrate-v7"]);
  });

  it("stops + returns error on first failure", async () => {
    const runStep = vi.fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2);
    const r = await runMigrateAuto({ runStep });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("migrate-v7");
    expect(r.steps).toEqual([
      { cmd: "migrate-v6", code: 0 },
      { cmd: "migrate-v7", code: 2 },
    ]);
  });
});
