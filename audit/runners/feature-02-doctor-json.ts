import {
  check,
  cleanupTemp,
  createAuditContext,
  finalize,
  pnpmTeamagentCommand,
  readText,
  runCommand,
  tsxBinCommand,
  writeArtifact,
  writeJson,
} from "./lib.js";

type ValidationSummary = {
  ok: true;
  checkNames: string[];
  counts: {
    passed: number;
    failed: number;
    skipped: number;
  };
  allPassed: boolean;
};

function externalJsonValidatorScript(): string {
  return String.raw`
const fs = require("node:fs");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const file = process.argv[1];
const text = fs.readFileSync(file, "utf8");
let data;
try {
  data = JSON.parse(text);
} catch (error) {
  fail("stdout is not valid JSON: " + (error && error.message ? error.message : String(error)));
}

if (data === null || typeof data !== "object" || Array.isArray(data)) {
  fail("stdout JSON is not a single object");
}

for (const key of ["checks", "passed", "failed", "skipped", "allPassed"]) {
  if (!Object.prototype.hasOwnProperty.call(data, key)) {
    fail("missing top-level field: " + key);
  }
}

if (!Array.isArray(data.checks)) fail("checks is not an array");
for (const key of ["passed", "failed", "skipped"]) {
  if (!Number.isInteger(data[key]) || data[key] < 0) {
    fail(key + " is not a non-negative integer");
  }
}
if (typeof data.allPassed !== "boolean") fail("allPassed is not a boolean");

const statuses = new Set(["pass", "fail", "skip"]);
for (const item of data.checks) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) fail("check item is not an object");
  if (typeof item.name !== "string" || item.name.length === 0) fail("check item has bad name");
  if (!statuses.has(item.status)) fail("check item has bad status: " + String(item.status));
  if (typeof item.detail !== "string") fail("check item has bad detail: " + item.name);
  if (item.fix !== undefined && typeof item.fix !== "string") fail("check item has bad fix: " + item.name);
}

const passed = data.checks.filter((item) => item.status === "pass").length;
const failed = data.checks.filter((item) => item.status === "fail").length;
const skipped = data.checks.filter((item) => item.status === "skip").length;

if (data.passed !== passed) fail("passed count does not match checks status");
if (data.failed !== failed) fail("failed count does not match checks status");
if (data.skipped !== skipped) fail("skipped count does not match checks status");
if (data.allPassed !== (failed === 0)) fail("allPassed does not match failed count");

console.log(JSON.stringify({
  ok: true,
  checkNames: data.checks.map((item) => item.name),
  counts: { passed, failed, skipped },
  allPassed: data.allPassed
}));
`;
}

function parseValidationSummary(text: string): ValidationSummary | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const counts = record["counts"];
    if (record["ok"] !== true) return null;
    if (!Array.isArray(record["checkNames"]) || !record["checkNames"].every((name) => typeof name === "string")) return null;
    if (counts === null || typeof counts !== "object" || Array.isArray(counts)) return null;
    const countRecord = counts as Record<string, unknown>;
    if (
      typeof countRecord["passed"] !== "number" ||
      typeof countRecord["failed"] !== "number" ||
      typeof countRecord["skipped"] !== "number" ||
      typeof record["allPassed"] !== "boolean"
    ) {
      return null;
    }
    return parsed as ValidationSummary;
  } catch {
    return null;
  }
}

function jsonParseSucceeds(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

const ctx = createAuditContext("feature-02", "doctor-json");

const direct = runCommand(ctx, "direct-cli-doctor-json", tsxBinCommand(ctx, ["doctor", "--json"]), {
  allowFailure: true,
  timeoutMs: 120_000,
});
const directStdout = readText(direct.stdoutPath);
const directStderr = readText(direct.stderrPath);
writeArtifact(ctx, "direct-cli-stderr.txt", directStderr);

const validator = runCommand(ctx, "external-json-parse-and-counts", ["node", "-e", externalJsonValidatorScript(), direct.stdoutPath], {
  allowFailure: true,
  timeoutMs: 30_000,
});
const validation = parseValidationSummary(readText(validator.stdoutPath).trim());
const validatorError = readText(validator.stderrPath).trim();

if (validation !== null) {
  writeJson(ctx, "parsed-doctor-result.json", JSON.parse(directStdout) as unknown);
}

const pnpmScript = runCommand(ctx, "negative-pnpm-script-banner", pnpmTeamagentCommand(ctx, ["doctor", "--json"]), {
  allowFailure: true,
  timeoutMs: 120_000,
});
const pnpmStdout = readText(pnpmScript.stdoutPath);
const pnpmStdoutIsJson = jsonParseSucceeds(pnpmStdout);
const pnpmBannerObserved = /^\s*> /m.test(pnpmStdout);
writeJson(ctx, "negative-pnpm-script-banner.json", {
  exitCode: pnpmScript.exitCode,
  stdoutIsJson: pnpmStdoutIsJson,
  bannerObserved: pnpmBannerObserved,
  note: "这是非阻断负向检查：pnpm script 可能在 stdout 注入 banner，因此不能作为 doctor --json 的纯 JSON 证据。",
});

const directExitOk = direct.exitCode === 0 || direct.exitCode === 1;
const validationOk = validator.exitCode === 0 && validation !== null;
const status = directExitOk && validationOk ? "passed" : "failed";
const countDetail =
  validation === null
    ? validatorError || "external JSON validator did not return a summary"
    : `checks=${validation.checkNames.length}, passed=${validation.counts.passed}, failed=${validation.counts.failed}, skipped=${validation.counts.skipped}, allPassed=${String(validation.allPassed)}`;
const stderrDetail =
  directStderr.length === 0
    ? "stderr 为空，已记录 direct-cli-stderr.txt"
    : `stderr 非空（${directStderr.length} bytes），已记录 direct-cli-stderr.txt`;
const pnpmNegativeDetail = pnpmStdoutIsJson
  ? "pnpm script stdout 这次可被 JSON.parse；该可选检查不影响结论"
  : `pnpm script stdout 不能作为纯 JSON 解析${pnpmBannerObserved ? "，观察到 script banner" : ""}；该可选检查不影响结论`;

finalize(ctx, {
  feature: "Feature #2 doctor --json",
  status,
  summary:
    status === "passed"
      ? "通过：runner 真实执行 direct CLI `doctor --json`，允许环境导致的非零退出；随后用独立 `JSON.parse` 校验 stdout 是单个 JSON object，且 checks/passed/failed/skipped/allPassed 与 checks status 计数一致。stderr 与最终 decision 均已落盘。"
      : "失败：direct CLI `doctor --json` 的 stdout 未通过独立 JSON object/字段/计数校验，或进程退出状态不是预期的 0/1。stderr 与失败细节已落盘。",
  checks: [
    check("direct-cli-doctor-json-ran", directExitOk, `exit=${String(direct.exitCode)}（doctor 环境失败退出 1 允许）`),
    check("stdout-is-single-json-object", validationOk, validationOk ? "JSON.parse 成功且顶层是 object" : countDetail),
    check("required-fields-present", validationOk, "要求 checks/passed/failed/skipped/allPassed"),
    check("status-counts-match", validationOk, countDetail),
    check("stderr-recorded", true, stderrDetail),
    check("negative-pnpm-script-banner-optional", true, pnpmNegativeDetail),
  ],
  artifacts: {
    directStdout: direct.stdoutPath,
    directStderr: direct.stderrPath,
    validatorStdout: validator.stdoutPath,
    validatorStderr: validator.stderrPath,
    parsedDoctorResult: validation === null ? "" : `${ctx.outDir}/parsed-doctor-result.json`,
    pnpmScriptNegative: `${ctx.outDir}/negative-pnpm-script-banner.json`,
  },
});
cleanupTemp(ctx);
