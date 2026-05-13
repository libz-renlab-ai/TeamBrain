import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRESENCE_CONFIG,
  PRESENCE_UNKNOWN,
  computePresenceState,
  presenceColor,
  type PresenceSnapshot,
} from "../presence/index.js";

const ANCHOR_MS = Date.parse("2026-05-13T12:00:00Z");

function snap(
  event: PresenceSnapshot["event"],
  ageMs: number,
  extra: Partial<PresenceSnapshot> = {},
): PresenceSnapshot {
  return {
    event,
    ts: new Date(ANCHOR_MS - ageMs).toISOString(),
    ...extra,
  };
}

describe("computePresenceState — 4-state boundary contract (grill §11)", () => {
  it("active: fresh user_prompt_submit within active_ttl", () => {
    const state = computePresenceState(
      snap("user_prompt_submit", 1_000),
      ANCHOR_MS,
    );
    expect(state).toBe("active");
  });

  it("active: fresh session_start within active_ttl", () => {
    const state = computePresenceState(
      snap("session_start", 30_000),
      ANCHOR_MS,
    );
    expect(state).toBe("active");
  });

  it("idle: user_prompt_submit older than active_ttl but inside offline_after", () => {
    const age = DEFAULT_PRESENCE_CONFIG.activeTtlMs + 60_000; // 11min
    const state = computePresenceState(
      snap("user_prompt_submit", age),
      ANCHOR_MS,
    );
    expect(state).toBe("idle");
  });

  it("idle: session_start older than idle_after but inside offline_after", () => {
    const age = DEFAULT_PRESENCE_CONFIG.idleAfterMs + 60_000;
    const state = computePresenceState(
      snap("session_start", age),
      ANCHOR_MS,
    );
    expect(state).toBe("idle");
  });

  it("offline: Stop event is immediate offline even at age=0", () => {
    const state = computePresenceState(snap("stop", 0), ANCHOR_MS);
    expect(state).toBe("offline");
  });

  it("offline: session_end is immediate offline even at age=0", () => {
    const state = computePresenceState(snap("session_end", 0), ANCHOR_MS);
    expect(state).toBe("offline");
  });

  it("offline: any event older than offline_after", () => {
    const age = DEFAULT_PRESENCE_CONFIG.offlineAfterMs + 60_000; // 61min
    const state = computePresenceState(
      snap("user_prompt_submit", age),
      ANCHOR_MS,
    );
    expect(state).toBe("offline");
  });

  it("error: errorFlag overrides every TTL/event consideration", () => {
    const fresh = computePresenceState(
      snap("user_prompt_submit", 0, { errorFlag: true }),
      ANCHOR_MS,
    );
    const stale = computePresenceState(
      snap(
        "user_prompt_submit",
        DEFAULT_PRESENCE_CONFIG.offlineAfterMs + 5 * 60_000,
        { errorFlag: true },
      ),
      ANCHOR_MS,
    );
    expect(fresh).toBe("error");
    expect(stale).toBe("error");
  });

  it("unknown snapshot (no event ever) renders unknown sentinel as offline", () => {
    const state = computePresenceState(null, ANCHOR_MS);
    expect(state).toBe(PRESENCE_UNKNOWN);
    expect(state).toBe("offline");
  });
});

describe("computePresenceState — edge cases", () => {
  it("accepts Date object as `now`", () => {
    const state = computePresenceState(
      snap("user_prompt_submit", 60_000),
      new Date(ANCHOR_MS),
    );
    expect(state).toBe("active");
  });

  it("returns offline when ts is unparseable", () => {
    const state = computePresenceState(
      { event: "user_prompt_submit", ts: "not-a-date" },
      ANCHOR_MS,
    );
    expect(state).toBe("offline");
  });

  it("returns offline when now is non-finite", () => {
    const state = computePresenceState(
      snap("user_prompt_submit", 60_000),
      Number.NaN,
    );
    expect(state).toBe("offline");
  });

  it("clock skew: ts in the future does not flip to offline", () => {
    // 30s into the future — common when emitter and dashboard clocks drift
    const future = ANCHOR_MS + 30_000;
    const state = computePresenceState(
      { event: "user_prompt_submit", ts: new Date(future).toISOString() },
      ANCHOR_MS,
    );
    expect(state).toBe("active");
  });

  it("config overrides defaults", () => {
    // Tight 1-second active TTL → 5s old prompt becomes idle
    const state = computePresenceState(
      snap("user_prompt_submit", 5_000),
      ANCHOR_MS,
      { activeTtlMs: 1_000, idleAfterMs: 1_000, offlineAfterMs: 60_000 },
    );
    expect(state).toBe("idle");
  });

  it("session_start past active_ttl returns idle even when idle_after > active_ttl", () => {
    // Regression for /review adversarial finding #4: prior fall-through
    // returned "active" when activeTtlMs < idleAfterMs and age was between
    // them, contradicting the decision-order spec. Under a 5min/15min
    // config, a 10-min-old session_start must be idle, not active.
    const state = computePresenceState(
      snap("session_start", 10 * 60_000),
      ANCHOR_MS,
      {
        activeTtlMs: 5 * 60_000,
        idleAfterMs: 15 * 60_000,
        offlineAfterMs: 60 * 60_000,
      },
    );
    expect(state).toBe("idle");
  });

  it("unknown event kind within active_ttl renders active", () => {
    const state = computePresenceState(
      { event: "status", ts: new Date(ANCHOR_MS - 30_000).toISOString() },
      ANCHOR_MS,
    );
    expect(state).toBe("active");
  });

  it("unknown event kind past active_ttl renders idle", () => {
    const state = computePresenceState(
      {
        event: "pretool",
        ts: new Date(
          ANCHOR_MS - (DEFAULT_PRESENCE_CONFIG.activeTtlMs + 60_000),
        ).toISOString(),
      },
      ANCHOR_MS,
    );
    expect(state).toBe("idle");
  });
});

describe("presenceColor", () => {
  it("maps each state to its grill-§11 color", () => {
    expect(presenceColor("active")).toBe("green");
    expect(presenceColor("idle")).toBe("yellow");
    expect(presenceColor("offline")).toBe("gray");
    expect(presenceColor("error")).toBe("red");
  });
});
