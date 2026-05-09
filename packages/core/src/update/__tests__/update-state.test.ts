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
      reinstall_banner_shown_at: 999,
      last_branch_etag: "",
      last_branch_sha: "",
      next_check_after_ts: 0,
      consecutive_rate_limits: 0,
    };
    expect(parseUpdateState(serializeUpdateState(s))).toEqual(s);
  });

  // B-104: backwards compat — pre-B-104 state files have no
  // reinstall_banner_shown_at field; parser must default to 0 so old users
  // get the banner on first SessionStart after the upgrade.
  it("parseUpdateState 兼容旧版没有 reinstall_banner_shown_at 的 state 文件", () => {
    const legacy = JSON.stringify({
      consecutive_install_failures: 3,
      last_install_error: "ssh fail",
    });
    const s = parseUpdateState(legacy);
    expect(s.reinstall_banner_shown_at).toBe(0);
    expect(s.consecutive_install_failures).toBe(3);
  });

  // § 2.2 new fields — (a) round-trip
  it("serializeUpdateState round-trips new ETag/backoff fields", () => {
    const s: UpdateState = {
      last_check_ts: 1000,
      interval_hours: 1,
      last_installed_sha: "abc123",
      last_installed_version: "1.0.0",
      installed_at: 2000,
      consecutive_install_failures: 0,
      last_install_error: null,
      pending_banner: null,
      reinstall_banner_shown_at: 0,
      last_branch_etag: 'W/"5e8c4dabc"',
      last_branch_sha: "deadbeef",
      next_check_after_ts: 1700000000000,
      consecutive_rate_limits: 2,
    };
    expect(parseUpdateState(serializeUpdateState(s))).toEqual(s);
  });

  // § 2.2 new fields — (b) backwards-compat: old state files without new fields
  it("parseUpdateState fills new fields with defaults when absent (backwards-compat)", () => {
    const oldState = JSON.stringify({
      last_check_ts: 500,
      interval_hours: 6,
      last_installed_sha: "old-sha",
      last_installed_version: "0.9.0",
      installed_at: 100,
      consecutive_install_failures: 0,
      last_install_error: null,
      pending_banner: null,
      reinstall_banner_shown_at: 0,
      // No last_branch_etag, last_branch_sha, next_check_after_ts, consecutive_rate_limits
    });
    const s = parseUpdateState(oldState);
    expect(s.last_branch_etag).toBe("");
    expect(s.last_branch_sha).toBe("");
    expect(s.next_check_after_ts).toBe(0);
    expect(s.consecutive_rate_limits).toBe(0);
    // Existing fields should still parse correctly
    expect(s.last_installed_sha).toBe("old-sha");
    expect(s.interval_hours).toBe(6);
  });

  // § 2.2 new fields — (c) malformed new-field types: typeof guard fallback
  it("parseUpdateState falls back to 0 when next_check_after_ts is a string", () => {
    const malformed = JSON.stringify({
      last_check_ts: 0,
      interval_hours: 1,
      last_installed_sha: "",
      last_installed_version: "",
      installed_at: 0,
      consecutive_install_failures: 0,
      last_install_error: null,
      pending_banner: null,
      reinstall_banner_shown_at: 0,
      last_branch_etag: 42,          // wrong type: number instead of string
      last_branch_sha: true,         // wrong type: boolean instead of string
      next_check_after_ts: "1700000000000",  // wrong type: string instead of number
      consecutive_rate_limits: "3",          // wrong type: string instead of number
    });
    const s = parseUpdateState(malformed);
    expect(s.next_check_after_ts).toBe(0);
    expect(s.consecutive_rate_limits).toBe(0);
    expect(s.last_branch_etag).toBe("");
    expect(s.last_branch_sha).toBe("");
  });

  // § 2.2 new fields — (d) defaultUpdateState includes all four new fields
  it("defaultUpdateState() includes all four new fields with default values", () => {
    const d = defaultUpdateState();
    expect(d.last_branch_etag).toBe("");
    expect(d.last_branch_sha).toBe("");
    expect(d.next_check_after_ts).toBe(0);
    expect(d.consecutive_rate_limits).toBe(0);
  });
});
