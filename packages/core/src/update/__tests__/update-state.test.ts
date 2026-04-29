import { describe, it, expect } from "vitest";
import {
  parseUpdateState,
  serializeUpdateState,
  defaultUpdateState,
  type UpdateState,
} from "../update-state.js";

describe("UpdateState", () => {
  it("defaultUpdateState() returns zero-state with interval_hours=1", () => {
    const s = defaultUpdateState();
    expect(s.interval_hours).toBe(1);
    expect(s.last_check_ts).toBe(0);
    expect(s.last_installed_sha).toBe("");
    expect(s.consecutive_install_failures).toBe(0);
    expect(s.pending_banner).toBeNull();
  });

  it("parseUpdateState parses valid JSON", () => {
    const json = JSON.stringify({
      last_check_ts: 1000,
      interval_hours: 6,
      last_installed_sha: "abc",
      last_installed_version: "0.10.1",
      installed_at: 999,
      consecutive_install_failures: 0,
      last_install_error: null,
      pending_banner: null,
    });
    const s = parseUpdateState(json);
    expect(s.interval_hours).toBe(6);
    expect(s.last_installed_sha).toBe("abc");
  });

  it("parseUpdateState falls back to defaults on malformed JSON", () => {
    expect(parseUpdateState("not-json").interval_hours).toBe(1);
    expect(parseUpdateState("").last_installed_sha).toBe("");
  });

  it("parseUpdateState fills missing fields from defaults", () => {
    const s = parseUpdateState(JSON.stringify({ last_installed_sha: "xyz" }));
    expect(s.last_installed_sha).toBe("xyz");
    expect(s.interval_hours).toBe(1);
    expect(s.consecutive_install_failures).toBe(0);
  });

  it("serializeUpdateState round-trips", () => {
    const s: UpdateState = {
      last_check_ts: 123,
      interval_hours: 1,
      last_installed_sha: "deadbeef",
      last_installed_version: "0.10.1",
      installed_at: 456,
      consecutive_install_failures: 2,
      last_install_error: "boom",
      pending_banner: { from: "a", to: "b", at: 789, shown: false },
    };
    expect(parseUpdateState(serializeUpdateState(s))).toEqual(s);
  });
});
