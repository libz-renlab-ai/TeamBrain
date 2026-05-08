/**
 * ⚠️ ARCHIVED CONTRACT — frozen historical artifact.
 *
 * 见 docs/adr/0005-archive-hypothetical-port-seams.md。
 * 此文件不再被 CI 跑，但保留以便未来 ≥2 production adapter
 * 出现时可参考原 contract 设计。
 *
 * 不要在这里加新 case；如果当前 lone implementation
 * 演化出 contract 偏差，请直接编辑 lone-impl 的 unit test，
 * 不要"复活"这个 contract。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { BootstrapPort } from "../bootstrap-port.js";
import type { InfectionPlan } from "@teamagent/types";

/**
 * BootstrapPort 契约——任何实现都应通过此套件。
 *
 * 工厂返回一个临时项目 + 对应的 port 实例，并提供 cleanup。
 */
export function runBootstrapPortContract(
  factory: () => Promise<{
    port: BootstrapPort;
    projectRoot: string;
    cleanup: () => Promise<void>;
  }>
): void {
  describe("BootstrapPort contract", () => {
    let port: BootstrapPort;
    let projectRoot: string;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      ({ port, projectRoot, cleanup } = await factory());
    });

    afterEach(async () => {
      await cleanup();
    });

    it("readManifest returns null on a fresh project", async () => {
      const m = await port.readManifest(projectRoot);
      expect(m).toBeNull();
    });

    it("probeProject of fresh project: all flags false", async () => {
      const p = await port.probeProject(projectRoot);
      expect(p).toEqual({
        has_manifest: false,
        has_team_dir: false,
        has_shared_skills_dir: false,
        has_shared_claude_md: false,
        has_githooks_dir: false,
        has_pre_commit_hook: false,
        has_post_merge_hook: false,
      });
    });

    it("applyInfection creates files and dirs; readManifest then returns content", async () => {
      const plan: InfectionPlan = {
        required: true,
        files_to_create: {
          ".teamagent/manifest.json": '{"schema_version":1}',
          ".githooks/pre-commit": "#!/usr/bin/env bash\necho hi\n",
        },
        dirs_to_create: [".teamagent/team", ".teamagent/shared-skills"],
      };
      await port.applyInfection(projectRoot, plan);

      const m = await port.readManifest(projectRoot);
      expect(m).toBe('{"schema_version":1}');

      const p = await port.probeProject(projectRoot);
      expect(p.has_manifest).toBe(true);
      expect(p.has_team_dir).toBe(true);
      expect(p.has_shared_skills_dir).toBe(true);
      expect(p.has_pre_commit_hook).toBe(true);
    });

    it("applyInfection is idempotent: existing files not overwritten", async () => {
      const plan1: InfectionPlan = {
        required: true,
        files_to_create: { ".teamagent/manifest.json": "FIRST" },
        dirs_to_create: [],
      };
      await port.applyInfection(projectRoot, plan1);

      const plan2: InfectionPlan = {
        required: true,
        files_to_create: { ".teamagent/manifest.json": "SECOND" },
        dirs_to_create: [],
      };
      await port.applyInfection(projectRoot, plan2);

      const m = await port.readManifest(projectRoot);
      expect(m).toBe("FIRST");
    });

    it("getLocalState returns a structurally valid LocalState", async () => {
      const s = await port.getLocalState();
      expect(
        typeof s.teamagent_version === "string" || s.teamagent_version === null
      ).toBe(true);
      expect(Array.isArray(s.installed_plugins)).toBe(true);
      expect(Array.isArray(s.installed_project_skills)).toBe(true);
      expect(Array.isArray(s.installed_hooks)).toBe(true);
    });
  });
}
