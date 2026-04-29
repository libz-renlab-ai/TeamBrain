import { describe, it, expect, vi } from "vitest";
import { runWarmup } from "../commands/warmup.js";

describe("warmup", () => {
  it("calls embedder.embed once and returns ok=true", async () => {
    const embed = vi.fn().mockResolvedValue([[0.1, 0.2]]);
    const stderr = vi.fn();
    const result = await runWarmup({ embedder: { embed }, stderr });
    expect(embed).toHaveBeenCalledOnce();
    expect(embed).toHaveBeenCalledWith(["warmup"]);
    expect(result.ok).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns ok=false on embedder error", async () => {
    const embed = vi.fn().mockRejectedValue(new Error("network"));
    const stderr = vi.fn();
    const result = await runWarmup({ embedder: { embed }, stderr });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("network");
  });
});
