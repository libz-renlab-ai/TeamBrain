import { describe, expect, it } from "vitest";
import {
  InstallStateSchema,
  InstallStateV1Schema,
  STEP_KEYS,
} from "../schema.js";

describe("InstallStateSchema", () => {
  it("STEP_KEYS covers all currently supported install steps", () => {
    expect(STEP_KEYS).toEqual([
      "npm-global-install",
      "hook-write",
      "plugin-copy",
      "config-write",
      "migration-apply",
      "post-install-verify",
    ]);
  });

  it("accepts a well-formed v1 object", () => {
    const result = InstallStateSchema.safeParse({
      schemaVersion: "v1",
      projectId: "p_deadbeef00112233",
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
      completedSteps: ["npm-global-install", "hook-write"],
      lastRunAt: 1700000001000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown schemaVersion (e.g. 'v2' from the future)", () => {
    const result = InstallStateSchema.safeParse({
      schemaVersion: "v2",
      projectId: "p_x",
      createdAt: 0,
      updatedAt: 0,
      completedSteps: [],
      lastRunAt: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing schemaVersion", () => {
    const result = InstallStateSchema.safeParse({
      projectId: "p_x",
      createdAt: 0,
      updatedAt: 0,
      completedSteps: [],
      lastRunAt: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown step key in completedSteps", () => {
    const result = InstallStateSchema.safeParse({
      schemaVersion: "v1",
      projectId: "p_x",
      createdAt: 0,
      updatedAt: 0,
      completedSteps: ["this-is-not-a-real-step"],
      lastRunAt: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative timestamps", () => {
    const result = InstallStateSchema.safeParse({
      schemaVersion: "v1",
      projectId: "p_x",
      createdAt: -1,
      updatedAt: 0,
      completedSteps: [],
      lastRunAt: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty projectId", () => {
    const result = InstallStateSchema.safeParse({
      schemaVersion: "v1",
      projectId: "",
      createdAt: 0,
      updatedAt: 0,
      completedSteps: [],
      lastRunAt: 0,
    });
    expect(result.success).toBe(false);
  });

  it("InstallStateV1Schema is the same shape", () => {
    expect(InstallStateV1Schema).toBe(InstallStateSchema);
  });
});
