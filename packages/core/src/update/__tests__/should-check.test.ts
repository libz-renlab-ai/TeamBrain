import { describe, it, expect } from "vitest";
import { shouldCheckUpdate, type ShouldCheckInput } from "../should-check.js";
import { defaultUpdateState } from "../update-state.js";

const HOUR = 60 * 60 * 1000;

function input(overrides: Partial<ShouldCheckInput> = {}): ShouldCheckInput {
  return {
    now: 10 * HOUR,
    state: defaultUpdateState(),
    env: {},
    disabledMarkerExists: false,
    ...overrides,
  };
}

describe("shouldCheckUpdate", () => {
  it("returns true when state never checked (last_check_ts=0)", () => {
    expect(shouldCheckUpdate(input())).toBe(true);
  });

  it("returns false when interval has not elapsed", () => {
    expect(shouldCheckUpdate(input({
      state: { ...defaultUpdateState(), last_check_ts: 9.5 * HOUR, interval_hours: 1 },
    }))).toBe(false);
  });

  it("returns true when interval elapsed", () => {
    expect(shouldCheckUpdate(input({
      state: { ...defaultUpdateState(), last_check_ts: 8 * HOUR, interval_hours: 1 },
    }))).toBe(true);
  });

  it("returns false when TEAMAGENT_AUTO_UPDATE=0", () => {
    expect(shouldCheckUpdate(input({ env: { TEAMAGENT_AUTO_UPDATE: "0" } }))).toBe(false);
  });

  it("returns false when disabled marker exists", () => {
    expect(shouldCheckUpdate(input({ disabledMarkerExists: true }))).toBe(false);
  });

  it("backs off 24h after 3 consecutive failures", () => {
    const state = { ...defaultUpdateState(), consecutive_install_failures: 3, last_check_ts: 9.5 * HOUR };
    expect(shouldCheckUpdate(input({ state }))).toBe(false);
    expect(shouldCheckUpdate(input({ state, now: state.last_check_ts + 25 * HOUR }))).toBe(true);
  });

  it("respects custom interval_hours=24", () => {
    const state = { ...defaultUpdateState(), interval_hours: 24, last_check_ts: 1 * HOUR };
    expect(shouldCheckUpdate(input({ state, now: 12 * HOUR }))).toBe(false);
    expect(shouldCheckUpdate(input({ state, now: 25 * HOUR + 1 }))).toBe(true);
  });
});
