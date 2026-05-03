import { describe, expect, it } from "vitest";
import {
  DashboardArgsError,
  dashboardHealthPayload,
  parseDashboardArgs,
  renderDashboardLaunch,
} from "../commands/dashboard.js";

describe("parseDashboardArgs", () => {
  it("defaults to real-time watch mode", () => {
    expect(parseDashboardArgs([])).toMatchObject({
      watch: true,
      host: "127.0.0.1",
      port: 8787,
      intervalMs: 2_000,
    });
  });

  it("parses serve options", () => {
    expect(parseDashboardArgs(["--watch", "--open", "--port=0", "--host=0.0.0.0", "--interval=5s"]))
      .toMatchObject({
        watch: true,
        open: true,
        port: 0,
        host: "0.0.0.0",
        intervalMs: 5_000,
      });
  });

  it("supports one-shot generation", () => {
    const opts = parseDashboardArgs(["--once"]);
    expect(opts.once).toBe(true);
    expect(opts.watch).toBeUndefined();
  });

  it("rejects incompatible modes", () => {
    expect(() => parseDashboardArgs(["--once", "--watch"])).toThrow(DashboardArgsError);
  });

  it("rejects invalid ports", () => {
    expect(() => parseDashboardArgs(["--port=70000"])).toThrow(DashboardArgsError);
  });
});

describe("renderDashboardLaunch", () => {
  it("renders the real-time dashboard URL and stop hint", () => {
    const out = renderDashboardLaunch({
      mode: "watch",
      outputPath: "/repo/docs/dashboard.html",
      url: "http://127.0.0.1:8787/dashboard.html",
      host: "127.0.0.1",
      port: 8787,
      intervalMs: 2_000,
    });
    expect(out).toContain("Real-time TeamAgent dashboard");
    expect(out).toContain("http://127.0.0.1:8787/dashboard.html");
    expect(out).toContain("Ctrl+C");
  });
});

describe("dashboardHealthPayload", () => {
  it("exposes a stable structured dashboard health signal", () => {
    expect(dashboardHealthPayload({
      outputPath: "/repo/docs/dashboard.html",
      lastGeneratedAt: "2026-05-03T00:00:00.000Z",
    })).toEqual({
      service: "teamagent-dashboard",
      ok: true,
      status: "ok",
      stableHealthSignal: "teamagent-dashboard-health",
      outputPath: "/repo/docs/dashboard.html",
      lastGeneratedAt: "2026-05-03T00:00:00.000Z",
      lastError: "",
    });
  });
});
