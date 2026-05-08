import { describe, it, expect } from "vitest";
import { planInfection, type ProjectSnapshot } from "../infect-planner.js";

function snapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    has_manifest: false,
    has_team_dir: false,
    has_shared_skills_dir: false,
    has_shared_claude_md: false,
    has_githooks_dir: false,
    has_pre_commit_hook: false,
    has_post_merge_hook: false,
    ...overrides,
  };
}

describe("planInfection", () => {
  it("clean project: required=true with all artifacts", () => {
    const plan = planInfection(snapshot(), {
      author: "alice",
      now: "2026-05-06T10:00:00Z",
      teamagent_version: "0.9.4",
    });
    expect(plan.required).toBe(true);
    expect(Object.keys(plan.files_to_create)).toContain(
      ".teamagent/manifest.json"
    );
    expect(Object.keys(plan.files_to_create)).toContain(
      ".teamagent/shared-claude.md"
    );
    expect(Object.keys(plan.files_to_create)).toContain(".githooks/pre-commit");
    expect(Object.keys(plan.files_to_create)).toContain(".githooks/post-merge");
    expect(plan.dirs_to_create).toContain(".teamagent/team");
    expect(plan.dirs_to_create).toContain(".teamagent/shared-skills");
    expect(plan.dirs_to_create).toContain(".githooks");
  });

  it("manifest already present: required=false, no files", () => {
    const plan = planInfection(
      snapshot({
        has_manifest: true,
        has_team_dir: true,
        has_shared_skills_dir: true,
        has_shared_claude_md: true,
        has_githooks_dir: true,
        has_pre_commit_hook: true,
        has_post_merge_hook: true,
      }),
      {
        author: "alice",
        now: "2026-05-06T10:00:00Z",
        teamagent_version: "0.9.4",
      }
    );
    expect(plan.required).toBe(false);
    expect(plan.files_to_create).toEqual({});
    expect(plan.dirs_to_create).toEqual([]);
  });

  it("partial: only fills missing pieces", () => {
    const plan = planInfection(
      snapshot({ has_manifest: true, has_team_dir: true }),
      {
        author: "alice",
        now: "2026-05-06T10:00:00Z",
        teamagent_version: "0.9.4",
      }
    );
    expect(plan.required).toBe(true);
    expect(Object.keys(plan.files_to_create)).not.toContain(
      ".teamagent/manifest.json"
    );
    expect(Object.keys(plan.files_to_create)).toContain(
      ".teamagent/shared-claude.md"
    );
    expect(plan.dirs_to_create).not.toContain(".teamagent/team");
    expect(plan.dirs_to_create).toContain(".teamagent/shared-skills");
  });

  it("manifest content includes author and version from input", () => {
    const plan = planInfection(snapshot(), {
      author: "alice",
      now: "2026-05-06T10:00:00Z",
      teamagent_version: "0.9.4",
    });
    const manifestJson = plan.files_to_create[".teamagent/manifest.json"];
    expect(manifestJson).toContain('"created_by": "alice"');
    expect(manifestJson).toContain('"teamagent_version": "0.9.4"');
    expect(manifestJson).toContain('"created_at": "2026-05-06T10:00:00Z"');
  });

  it("pre-commit hook starts with shebang", () => {
    const plan = planInfection(snapshot(), {
      author: "a",
      now: "2026-05-06T10:00:00Z",
      teamagent_version: "0.0.0",
    });
    expect(plan.files_to_create[".githooks/pre-commit"]).toMatch(/^#!\/usr\/bin\/env bash/);
  });

  it("W15-003: hooks emitted into plan even when has_post_merge_hook=true (so adapter can chain-load)", () => {
    const plan = planInfection(
      snapshot({
        has_manifest: false,
        has_post_merge_hook: true,
        has_pre_commit_hook: true,
      }),
      {
        author: "a",
        now: "2026-05-06T10:00:00Z",
        teamagent_version: "0.0.0",
      },
    );
    expect(plan.required).toBe(true);
    expect(plan.files_to_create[".githooks/post-merge"]).toBeDefined();
    expect(plan.files_to_create[".githooks/pre-commit"]).toBeDefined();
  });

  it("W15-003: hook-only missing still requires infect", () => {
    const plan = planInfection(
      snapshot({
        has_manifest: true,
        has_team_dir: true,
        has_shared_skills_dir: true,
        has_shared_claude_md: true,
        has_githooks_dir: true,
        has_pre_commit_hook: true,
        has_post_merge_hook: false,
      }),
      {
        author: "a",
        now: "2026-05-06T10:00:00Z",
        teamagent_version: "0.0.0",
      },
    );
    expect(plan.required).toBe(true);
    expect(plan.files_to_create[".githooks/post-merge"]).toBeDefined();
  });
});
