import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  check,
  cleanupTemp,
  createAuditContext,
  finalize,
  readText,
  rel,
  runCommand,
  writeArtifact,
  writeJson,
  type AuditContext,
  type CommandRecord,
} from "./lib.js";

const FEATURE = "Feature #11 hooks enable/disable";

const DIST_FILES = [
  "bin.js",
  "bin-pre-tool-use.cjs",
  "bin-post-tool-use.cjs",
  "bin-user-prompt-submit.cjs",
  "bin-stop.cjs",
  "teamagent-statusline.cjs",
];

type StepResult = {
  name: string;
  cli: CommandRecord;
  validator: CommandRecord;
  snapshotPath: string;
  expectedOutput: string;
};

function isolatedEnv(ctx: AuditContext): NodeJS.ProcessEnv {
  return {
    HOME: ctx.homeDir,
    XDG_CONFIG_HOME: path.join(ctx.homeDir, ".config"),
  };
}

function distCheckerScript(): string {
  return String.raw`
const fs = require("node:fs");
const files = process.argv.slice(1);
const missing = files.filter((file) => !fs.existsSync(file));
if (missing.length > 0) {
  console.error("missing dist files: " + missing.join(", "));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, files }));
`;
}

function settingsValidatorScript(): string {
  return String.raw`
const fs = require("node:fs");
const assert = require("node:assert/strict");

const settingsPath = process.argv[1];
const mode = process.argv[2];

function readSettings() {
  const text = fs.readFileSync(settingsPath, "utf8");
  return JSON.parse(text);
}

function hookArrays(settings) {
  return Object.values(settings.hooks ?? {}).filter(Array.isArray);
}

function allHookEntries(settings) {
  return hookArrays(settings).flat();
}

function tagged(settings, name, tag) {
  return (settings.hooks?.[name] ?? []).filter((entry) => entry?._teamagentTag === tag);
}

function countTagged(settings, name, tag) {
  return tagged(settings, name, tag).length;
}

function commandOf(entry) {
  return String(entry?.hooks?.[0]?.command ?? "");
}

function hasUserCommand(settings, name, command) {
  return (settings.hooks?.[name] ?? []).some((entry) =>
    (entry.hooks ?? []).some((hook) => hook.command === command),
  );
}

function assertUserState(settings) {
  assert.equal(settings.someUserSetting, "keep-me");
  assert.equal(hasUserCommand(settings, "PreToolUse", "user-pre.sh"), true, "user PreToolUse hook preserved");
  assert.equal(hasUserCommand(settings, "PostToolUse", "user-post.sh"), true, "user PostToolUse hook preserved");
  assert.equal(hasUserCommand(settings, "UserPromptSubmit", "user-prompt.sh"), true, "user UserPromptSubmit hook preserved");
  assert.equal(hasUserCommand(settings, "Stop", "user-stop.sh"), true, "user Stop hook preserved");
  assert.equal(settings.statusLine?.command, "node /custom/user/status.cjs", "user statusLine preserved");
  assert.equal(settings.statusLine?._teamagentTag, undefined, "user statusLine must not be tagged as TeamAgent");
}

const expectedHooks = {
  PreToolUse: {
    tag: "teamagent-pre-tool-use",
    bundle: "bin-pre-tool-use.cjs",
    matcher: "Bash|Write|Edit|WebFetch",
    timeout: 30,
  },
  PostToolUse: {
    tag: "teamagent-post-tool-use",
    bundle: "bin-post-tool-use.cjs",
    matcher: "Bash|Write|Edit|WebFetch",
    timeout: 30,
  },
  UserPromptSubmit: {
    tag: "teamagent-user-prompt-submit",
    bundle: "bin-user-prompt-submit.cjs",
    timeout: 10,
  },
  Stop: {
    tag: "teamagent-stop",
    bundle: "bin-stop.cjs",
    timeout: 60,
  },
};

function assertTeamAgentHooks(settings) {
  for (const [name, spec] of Object.entries(expectedHooks)) {
    const matches = tagged(settings, name, spec.tag);
    assert.equal(matches.length, 1, name + " TeamAgent tag count");
    const entry = matches[0];
    if (spec.matcher) assert.equal(entry.matcher, spec.matcher, name + " matcher");
    assert.equal(entry.hooks?.[0]?.type, "command", name + " command type");
    assert.equal(entry.hooks?.[0]?.timeout, spec.timeout, name + " timeout");
    assert.match(commandOf(entry), new RegExp(spec.bundle.replace(".", "\\.") + "$"), name + " bundle path");
  }
}

function assertNoTeamAgentHooks(settings) {
  assert.equal(
    allHookEntries(settings).some((entry) => String(entry?._teamagentTag ?? "").startsWith("teamagent-")),
    false,
    "no TeamAgent hook tags remain",
  );
}

function assertTeamAgentStatusLine(settings) {
  assert.equal(settings.statusLine?._teamagentTag, "teamagent-statusline");
  assert.equal(settings.statusLine?.type, "command");
  assert.match(String(settings.statusLine?.command ?? ""), /teamagent-statusline\.cjs$/);
}

function assertNoStatusLine(settings) {
  assert.equal(settings.statusLine, undefined);
}

const settings = readSettings();

switch (mode) {
  case "custom-after-install":
    assertTeamAgentHooks(settings);
    assertUserState(settings);
    break;
  case "custom-after-install-again":
    assertTeamAgentHooks(settings);
    assertUserState(settings);
    for (const [name, spec] of Object.entries(expectedHooks)) {
      assert.equal(countTagged(settings, name, spec.tag), 1, name + " duplicated");
    }
    break;
  case "custom-after-disable":
    assertNoTeamAgentHooks(settings);
    assertUserState(settings);
    break;
  case "custom-after-enable":
    assertTeamAgentHooks(settings);
    assertUserState(settings);
    break;
  case "custom-after-uninstall":
    assertNoTeamAgentHooks(settings);
    assertUserState(settings);
    break;
  case "fresh-after-install":
    assertTeamAgentHooks(settings);
    assertTeamAgentStatusLine(settings);
    break;
  case "fresh-after-disable":
    assert.equal(settings.hooks, undefined);
    assertNoStatusLine(settings);
    break;
  case "fresh-after-enable":
    assertTeamAgentHooks(settings);
    assertTeamAgentStatusLine(settings);
    break;
  case "fresh-after-uninstall":
    assert.deepEqual(settings, {});
    break;
  default:
    throw new Error("unknown validation mode: " + mode);
}

console.log(JSON.stringify({ ok: true, mode, settingsPath }));
`;
}

function seedCustomProject(projectDir: string): string {
  const claudeDir = path.join(projectDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  const settingsPath = path.join(claudeDir, "settings.local.json");
  writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        someUserSetting: "keep-me",
        hooks: {
          PreToolUse: [
            {
              matcher: "Read",
              hooks: [{ type: "command", command: "user-pre.sh" }],
            },
          ],
          PostToolUse: [
            {
              matcher: "Read",
              hooks: [{ type: "command", command: "user-post.sh" }],
            },
          ],
          UserPromptSubmit: [
            {
              hooks: [{ type: "command", command: "user-prompt.sh" }],
            },
          ],
          Stop: [
            {
              hooks: [{ type: "command", command: "user-stop.sh" }],
            },
          ],
        },
        statusLine: { type: "command", command: "node /custom/user/status.cjs" },
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  return settingsPath;
}

function runCliStep(opts: {
  ctx: AuditContext;
  cliPath: string;
  scenario: string;
  projectDir: string;
  settingsPath: string;
  command: "install-hook" | "disable" | "enable" | "uninstall-hook";
  validationMode: string;
  expectedOutput: string;
}): StepResult {
  const stepName = `${opts.scenario}-${opts.command}-${opts.validationMode}`;
  const cli = runCommand(opts.ctx, stepName, ["node", opts.cliPath, opts.command], {
    cwd: opts.projectDir,
    env: isolatedEnv(opts.ctx),
    allowFailure: true,
    timeoutMs: 120_000,
  });
  const validator = runCommand(
    opts.ctx,
    `${stepName}-external-json-parser`,
    ["node", "-e", settingsValidatorScript(), opts.settingsPath, opts.validationMode],
    {
      cwd: opts.projectDir,
      env: isolatedEnv(opts.ctx),
      allowFailure: true,
      timeoutMs: 30_000,
    },
  );
  const snapshotPath = writeArtifact(
    opts.ctx,
    `${stepName}.settings.local.json`,
    readText(opts.settingsPath),
  );
  return {
    name: stepName,
    cli,
    validator,
    snapshotPath,
    expectedOutput: opts.expectedOutput,
  };
}

function stepChecks(step: StepResult): Array<{ name: string; ok: boolean; detail?: string }> {
  const stdout = readText(step.cli.stdoutPath);
  const validatorStderr = readText(step.validator.stderrPath).trim();
  return [
    check(`${step.name}: cli exit 0`, step.cli.exitCode === 0, `exit=${String(step.cli.exitCode)}`),
    check(
      `${step.name}: cli output`,
      stdout.includes(step.expectedOutput),
      `expected stdout to include ${JSON.stringify(step.expectedOutput)}`,
    ),
    check(
      `${step.name}: external settings parser`,
      step.validator.exitCode === 0,
      step.validator.exitCode === 0 ? "JSON parser assertions passed" : validatorStderr,
    ),
  ];
}

function runScenarioSteps(ctx: AuditContext, cliPath: string): { steps: StepResult[]; artifacts: Record<string, string> } {
  const artifacts: Record<string, string> = {};
  const steps: StepResult[] = [];

  const customProject = path.join(ctx.tmpDir, "custom-statusline-project");
  mkdirSync(customProject, { recursive: true });
  const customSettings = seedCustomProject(customProject);
  artifacts["custom-initial-settings"] = rel(
    ctx,
    writeArtifact(ctx, "custom-initial.settings.local.json", readText(customSettings)),
  );
  steps.push(
    runCliStep({
      ctx,
      cliPath,
      scenario: "custom",
      projectDir: customProject,
      settingsPath: customSettings,
      command: "install-hook",
      validationMode: "custom-after-install",
      expectedOutput: "Hook 已注册到 Claude Code",
    }),
  );
  steps.push(
    runCliStep({
      ctx,
      cliPath,
      scenario: "custom",
      projectDir: customProject,
      settingsPath: customSettings,
      command: "install-hook",
      validationMode: "custom-after-install-again",
      expectedOutput: "Hook 已安装（无变化）",
    }),
  );
  steps.push(
    runCliStep({
      ctx,
      cliPath,
      scenario: "custom",
      projectDir: customProject,
      settingsPath: customSettings,
      command: "disable",
      validationMode: "custom-after-disable",
      expectedOutput: "Hook 已禁用",
    }),
  );
  steps.push(
    runCliStep({
      ctx,
      cliPath,
      scenario: "custom",
      projectDir: customProject,
      settingsPath: customSettings,
      command: "enable",
      validationMode: "custom-after-enable",
      expectedOutput: "Hook 已重新启用",
    }),
  );
  steps.push(
    runCliStep({
      ctx,
      cliPath,
      scenario: "custom",
      projectDir: customProject,
      settingsPath: customSettings,
      command: "uninstall-hook",
      validationMode: "custom-after-uninstall",
      expectedOutput: "Hook 已移除",
    }),
  );

  const freshProject = path.join(ctx.tmpDir, "fresh-project");
  mkdirSync(freshProject, { recursive: true });
  const freshSettings = path.join(freshProject, ".claude", "settings.local.json");
  steps.push(
    runCliStep({
      ctx,
      cliPath,
      scenario: "fresh",
      projectDir: freshProject,
      settingsPath: freshSettings,
      command: "install-hook",
      validationMode: "fresh-after-install",
      expectedOutput: "Hook 已注册到 Claude Code",
    }),
  );
  steps.push(
    runCliStep({
      ctx,
      cliPath,
      scenario: "fresh",
      projectDir: freshProject,
      settingsPath: freshSettings,
      command: "disable",
      validationMode: "fresh-after-disable",
      expectedOutput: "Hook 已禁用",
    }),
  );
  steps.push(
    runCliStep({
      ctx,
      cliPath,
      scenario: "fresh",
      projectDir: freshProject,
      settingsPath: freshSettings,
      command: "enable",
      validationMode: "fresh-after-enable",
      expectedOutput: "Hook 已重新启用",
    }),
  );
  steps.push(
    runCliStep({
      ctx,
      cliPath,
      scenario: "fresh",
      projectDir: freshProject,
      settingsPath: freshSettings,
      command: "uninstall-hook",
      validationMode: "fresh-after-uninstall",
      expectedOutput: "Hook 已移除",
    }),
  );

  for (const step of steps) {
    artifacts[`${step.name}-settings`] = rel(ctx, step.snapshotPath);
  }

  return { steps, artifacts };
}

const ctx = createAuditContext("feature-11", "hooks-enable-disable");
const cliPath = path.join(ctx.repoRoot, "packages", "teamagent", "dist", "bin.js");
const distPaths = DIST_FILES.map((file) =>
  path.join(ctx.repoRoot, "packages", "teamagent", "dist", file),
);

const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
const artifacts: Record<string, string> = {};

try {
  const build = runCommand(ctx, "build-teamagent-dist", ["pnpm", "--filter", "teamagent", "build"], {
    cwd: ctx.repoRoot,
    allowFailure: true,
    timeoutMs: 240_000,
  });
  checks.push(check("pnpm --filter teamagent build", build.exitCode === 0, `exit=${String(build.exitCode)}`));

  const distCheck = runCommand(ctx, "check-teamagent-dist-bundles", ["node", "-e", distCheckerScript(), ...distPaths], {
    cwd: ctx.repoRoot,
    allowFailure: true,
    timeoutMs: 30_000,
  });
  checks.push(
    check(
      "dist bundle files exist",
      distCheck.exitCode === 0,
      distCheck.exitCode === 0 ? DIST_FILES.join(", ") : readText(distCheck.stderrPath).trim(),
    ),
  );

  if (existsSync(cliPath)) {
    const { steps, artifacts: stepArtifacts } = runScenarioSteps(ctx, cliPath);
    checks.push(...steps.flatMap(stepChecks));
    Object.assign(artifacts, stepArtifacts);
  } else {
    checks.push(check("real CLI path exists", false, cliPath));
  }

  writeJson(ctx, "dist-files.json", {
    cliPath,
    files: distPaths,
  });
  artifacts["dist-files"] = rel(ctx, path.join(ctx.outDir, "dist-files.json"));

  const ok = checks.every((item) => item.ok);
  finalize(ctx, {
    feature: FEATURE,
    status: ok ? "passed" : "failed",
    summary: ok
      ? "通过：runner 构建 packages/teamagent/dist 后，在两个临时 cwd 中真实执行 install-hook、disable、enable、uninstall-hook，并由外部 Node JSON parser 验证 TeamAgent tags、用户 hooks/statusLine 保留、enable 恢复和幂等行为。"
      : "失败：hook 生命周期真实 CLI 命令、dist bundle 检查或外部 settings JSON parser 断言至少一项未通过；详见 audit/out 下的 stdout/stderr/settings 快照与 decision。",
    checks,
    artifacts,
  });
} catch (error) {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  checks.push(check("runner exception", false, detail));
  finalize(ctx, {
    feature: FEATURE,
    status: "failed",
    summary: "失败：runner 执行过程中抛出异常，decision 已记录异常细节和已产生的命令证据。",
    checks,
    artifacts,
  });
} finally {
  cleanupTemp(ctx);
}
