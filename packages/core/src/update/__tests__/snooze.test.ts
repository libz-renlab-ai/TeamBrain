import { describe, it, expect } from "vitest";
import { nextSnooze, shouldPromptUpgrade, SNOOZE_DURATIONS_MS } from "../snooze.js";
import { defaultUpdateState } from "../update-state.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("nextSnooze", () => {
  it("level 0 → 1 silences 24h", () => {
    const r = nextSnooze(0, 0);
    expect(r.snooze_level).toBe(1);
    expect(r.snooze_until_ts).toBe(24 * HOUR);
  });

  it("level 1 → 2 silences 48h", () => {
    const r = nextSnooze(1, 0);
    expect(r.snooze_level).toBe(2);
    expect(r.snooze_until_ts).toBe(48 * HOUR);
  });

  it("level 2 → 3 silences 7d", () => {
    const r = nextSnooze(2, 0);
    expect(r.snooze_level).toBe(3);
    expect(r.snooze_until_ts).toBe(7 * DAY);
  });

  it("caps at 7d for any level >= 2", () => {
    expect(nextSnooze(99, 0).snooze_until_ts).toBe(7 * DAY);
    expect(nextSnooze(99, 0).snooze_level).toBe(100);
  });

  it("clamps negative level to 0", () => {
    const r = nextSnooze(-3, 0);
    expect(r.snooze_level).toBe(1);
    expect(r.snooze_until_ts).toBe(24 * HOUR);
  });

  it("returns durations using injected now (no Date.now() leak)", () => {
    const T0 = 1_700_000_000_000;
    expect(nextSnooze(0, T0).snooze_until_ts - T0).toBe(SNOOZE_DURATIONS_MS[0]);
    expect(nextSnooze(1, T0).snooze_until_ts - T0).toBe(SNOOZE_DURATIONS_MS[1]);
    expect(nextSnooze(2, T0).snooze_until_ts - T0).toBe(SNOOZE_DURATIONS_MS[2]);
  });
});

describe("shouldPromptUpgrade", () => {
  const baseState = () => ({
    ...defaultUpdateState(),
    pending_banner: { from: "abc1234", to: "def5678", at: 0, shown: false },
  });

  it("returns true when banner pending + no snooze + not never", () => {
    expect(
      shouldPromptUpgrade({ state: baseState(), now: 0, env: {} }),
    ).toBe(true);
  });

  it("returns false when never_prompt is true", () => {
    expect(
      shouldPromptUpgrade({
        state: { ...baseState(), never_prompt: true },
        now: 0,
        env: {},
      }),
    ).toBe(false);
  });

  it("returns false when TEAMAGENT_NEVER_PROMPT=1 (env override)", () => {
    expect(
      shouldPromptUpgrade({
        state: baseState(),
        now: 0,
        env: { TEAMAGENT_NEVER_PROMPT: "1" },
      }),
    ).toBe(false);
  });

  it("returns false when snooze window still active", () => {
    expect(
      shouldPromptUpgrade({
        state: { ...baseState(), snooze_until_ts: 24 * HOUR },
        now: 12 * HOUR,
        env: {},
      }),
    ).toBe(false);
  });

  it("returns true once snooze window has elapsed", () => {
    expect(
      shouldPromptUpgrade({
        state: { ...baseState(), snooze_until_ts: 24 * HOUR },
        now: 25 * HOUR,
        env: {},
      }),
    ).toBe(true);
  });

  it("returns false when no pending banner and no explicit pending version", () => {
    expect(
      shouldPromptUpgrade({
        state: defaultUpdateState(), // pending_banner = null
        now: 0,
        env: {},
      }),
    ).toBe(false);
  });

  it("returns true when explicit pendingToVersion provided even without banner", () => {
    expect(
      shouldPromptUpgrade({
        state: defaultUpdateState(),
        now: 0,
        env: {},
        pendingToVersion: "0.10.5",
      }),
    ).toBe(true);
  });

  it("returns false when banner shown=true and no explicit pending", () => {
    expect(
      shouldPromptUpgrade({
        state: {
          ...baseState(),
          pending_banner: { from: "a", to: "b", at: 0, shown: true },
        },
        now: 0,
        env: {},
      }),
    ).toBe(false);
  });
});
