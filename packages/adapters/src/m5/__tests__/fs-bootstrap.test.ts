import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runBootstrapPortContract } from "@teamagent/ports/contracts";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  FsBootstrap,
  augmentHookWithTeamagentBlock,
  wrapHookWithTeamagentBlock,
  TEAMAGENT_HOOK_BLOCK_START,
  TEAMAGENT_HOOK_BLOCK_END,
} from "../fs-bootstrap.js";
import type { InfectionPlan } from "@teamagent/types";

describe("FsBootstrap", () => {
  runBootstrapPortContract(async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "m5-fs-bootstrap-")
    );
    const port = new FsBootstrap({
      readTeamagentVersion: async () => "0.9.4",
      readInstalledPlugins: async () => ["playground"],
      readInstalledProjectSkills: async () => [],
      readInstalledHooks: async () => ["UserPromptSubmit", "Stop"],
    });
    return {
      port,
      projectRoot,
      cleanup: async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
      },
    };
  });
});

describe("hook chain-load helpers (W15-003)", () => {
  const TEAMAGENT_BODY = "teamagent m5-sync --quiet\n";

  it("wraps fresh content with markers + shebang", () => {
    const out = wrapHookWithTeamagentBlock(
      "#!/usr/bin/env bash\n" + TEAMAGENT_BODY,
    );
    expect(out.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(out).toContain(TEAMAGENT_HOOK_BLOCK_START);
    expect(out).toContain(TEAMAGENT_HOOK_BLOCK_END);
    expect(out).toContain("teamagent m5-sync --quiet");
  });

  it("inserts default shebang when content has none", () => {
    const out = wrapHookWithTeamagentBlock(TEAMAGENT_BODY);
    expect(out.startsWith("#!/usr/bin/env bash\n")).toBe(true);
  });

  it("appends teamagent block after user's existing hook", () => {
    const userHook = "#!/bin/sh\necho [user-custom-post-merge]\n";
    const augmented = augmentHookWithTeamagentBlock(
      userHook,
      "#!/usr/bin/env bash\n" + TEAMAGENT_BODY,
    );
    expect(augmented).toContain("echo [user-custom-post-merge]");
    expect(augmented).toContain(TEAMAGENT_HOOK_BLOCK_START);
    expect(augmented).toContain("teamagent m5-sync --quiet");
    expect(augmented).toContain(TEAMAGENT_HOOK_BLOCK_END);
    // user content must stay before TeamAgent block
    expect(augmented.indexOf("[user-custom-post-merge]")).toBeLessThan(
      augmented.indexOf(TEAMAGENT_HOOK_BLOCK_START),
    );
  });

  it("idempotent: augment twice with same payload yields identical content", () => {
    const userHook = "#!/bin/sh\necho [user]\n";
    const once = augmentHookWithTeamagentBlock(
      userHook,
      "#!/usr/bin/env bash\n" + TEAMAGENT_BODY,
    );
    const twice = augmentHookWithTeamagentBlock(
      once,
      "#!/usr/bin/env bash\n" + TEAMAGENT_BODY,
    );
    expect(twice).toBe(once);
  });

  it("PR #282 review: refuses to overwrite when only START marker is present (corrupted hook)", () => {
    const corrupted =
      "#!/bin/sh\necho [user-top]\n" +
      TEAMAGENT_HOOK_BLOCK_START +
      "\nold-body-no-end\nuser-trailing-code\n";
    expect(() =>
      augmentHookWithTeamagentBlock(
        corrupted,
        "#!/usr/bin/env bash\n" + TEAMAGENT_BODY,
      ),
    ).toThrow(/markers are corrupted/);
  });

  it("PR #282 review: refuses to overwrite when only END marker is present (corrupted hook)", () => {
    const corrupted =
      "#!/bin/sh\necho [user-top]\n" +
      "user-body\n" +
      TEAMAGENT_HOOK_BLOCK_END +
      "\nuser-trailing-code\n";
    expect(() =>
      augmentHookWithTeamagentBlock(
        corrupted,
        "#!/usr/bin/env bash\n" + TEAMAGENT_BODY,
      ),
    ).toThrow(/markers are corrupted/);
  });

  it("PR #282 review: refuses to overwrite when END appears before START (corrupted hook)", () => {
    const corrupted =
      "#!/bin/sh\n" +
      TEAMAGENT_HOOK_BLOCK_END +
      "\nuser-middle\n" +
      TEAMAGENT_HOOK_BLOCK_START +
      "\n";
    expect(() =>
      augmentHookWithTeamagentBlock(
        corrupted,
        "#!/usr/bin/env bash\n" + TEAMAGENT_BODY,
      ),
    ).toThrow(/markers are corrupted/);
  });

  it("replaces TeamAgent block when payload changes (block, not duplicate)", () => {
    const userHook = "#!/bin/sh\necho [user]\n";
    const v1 = augmentHookWithTeamagentBlock(
      userHook,
      "#!/usr/bin/env bash\nteamagent m5-sync --v1\n",
    );
    const v2 = augmentHookWithTeamagentBlock(
      v1,
      "#!/usr/bin/env bash\nteamagent m5-sync --v2\n",
    );
    expect(v2).not.toContain("teamagent m5-sync --v1");
    expect(v2).toContain("teamagent m5-sync --v2");
    // exactly one start marker and one end marker
    expect(v2.split(TEAMAGENT_HOOK_BLOCK_START).length - 1).toBe(1);
    expect(v2.split(TEAMAGENT_HOOK_BLOCK_END).length - 1).toBe(1);
  });
});

describe("FsBootstrap.applyInfection chain-load (W15-003)", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "m5-fs-bootstrap-chain-"),
    );
  });
  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  function makePort(): FsBootstrap {
    return new FsBootstrap({
      readTeamagentVersion: async () => "0.9.4",
      readInstalledPlugins: async () => [],
      readInstalledProjectSkills: async () => [],
      readInstalledHooks: async () => [],
    });
  }

  it("chain-loads when user already has a post-merge hook", async () => {
    await fs.mkdir(path.join(projectRoot, ".githooks"), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, ".githooks", "post-merge"),
      "#!/bin/sh\necho [user-custom-post-merge]\n",
    );

    const plan: InfectionPlan = {
      required: true,
      files_to_create: {
        ".githooks/post-merge":
          "#!/usr/bin/env bash\nteamagent m5-sync --quiet\n",
      },
      dirs_to_create: [],
    };
    const r = await makePort().applyInfection(projectRoot, plan);

    expect(r.chained).toContain(".githooks/post-merge");
    expect(r.written).not.toContain(".githooks/post-merge");
    expect(r.skipped).not.toContain(".githooks/post-merge");

    const merged = await fs.readFile(
      path.join(projectRoot, ".githooks", "post-merge"),
      "utf8",
    );
    expect(merged).toContain("echo [user-custom-post-merge]");
    expect(merged).toContain("teamagent m5-sync --quiet");
    expect(merged).toContain(TEAMAGENT_HOOK_BLOCK_START);
    expect(merged).toContain(TEAMAGENT_HOOK_BLOCK_END);
  });

  it("PR #282 review: corrupted markers in user hook are skipped (no data loss, no abort)", async () => {
    await fs.mkdir(path.join(projectRoot, ".githooks"), { recursive: true });
    const corrupted =
      "#!/bin/sh\necho [user-top]\n" +
      TEAMAGENT_HOOK_BLOCK_START +
      "\nold-body-with-missing-end\necho [user-trailing-that-would-be-lost]\n";
    await fs.writeFile(
      path.join(projectRoot, ".githooks", "post-merge"),
      corrupted,
    );

    const plan: InfectionPlan = {
      required: true,
      files_to_create: {
        ".githooks/post-merge":
          "#!/usr/bin/env bash\nteamagent m5-sync --quiet\n",
      },
      dirs_to_create: [],
    };
    const r = await makePort().applyInfection(projectRoot, plan);

    // skipped bucket, not chained or written — user content preserved verbatim
    expect(r.skipped).toContain(".githooks/post-merge");
    expect(r.chained).not.toContain(".githooks/post-merge");
    expect(r.written).not.toContain(".githooks/post-merge");

    const onDisk = await fs.readFile(
      path.join(projectRoot, ".githooks", "post-merge"),
      "utf8",
    );
    expect(onDisk).toBe(corrupted);
  });

  it("fresh write wraps payload with markers (so re-apply is a no-op)", async () => {
    const plan: InfectionPlan = {
      required: true,
      files_to_create: {
        ".githooks/post-merge":
          "#!/usr/bin/env bash\nteamagent m5-sync --quiet\n",
      },
      dirs_to_create: [],
    };
    const port = makePort();
    const first = await port.applyInfection(projectRoot, plan);
    expect(first.written).toContain(".githooks/post-merge");

    const second = await port.applyInfection(projectRoot, plan);
    expect(second.skipped).toContain(".githooks/post-merge");
    expect(second.chained).not.toContain(".githooks/post-merge");
  });

  it("non-hook files (manifest.json) keep idempotency: existing wins", async () => {
    await fs.mkdir(path.join(projectRoot, ".teamagent"), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, ".teamagent", "manifest.json"),
      "FIRST",
    );
    const plan: InfectionPlan = {
      required: true,
      files_to_create: { ".teamagent/manifest.json": "SECOND" },
      dirs_to_create: [],
    };
    const r = await makePort().applyInfection(projectRoot, plan);
    expect(r.skipped).toContain(".teamagent/manifest.json");
    const m = await fs.readFile(
      path.join(projectRoot, ".teamagent", "manifest.json"),
      "utf8",
    );
    expect(m).toBe("FIRST");
  });
});
