import { execSync } from "node:child_process";
import { parseGhPrReviews, isGhAvailable } from "@teamagent/adapters/ingest/pr-review";

export interface PrCycleOptions {
  prNumber?: number;
  noCreate?: boolean;
  waitMs?: number;
  title?: string;
  body?: string;
  bodyFile?: string;
  base?: string;
  head?: string;
  repo?: string;
  draft?: boolean;
  dryRun?: boolean;
  claudefastBin?: string;
  codexfastgBin?: string;
  cwd?: string;
  cmdRunner?: (cmd: string, opts: { cwd?: string }) => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
}

export interface PrCycleResult {
  output: string;
  blocked: boolean;
}

interface PrView {
  number?: number;
  url?: string;
  reviews?: unknown[];
}

const DEFAULT_WAIT_MS = 5 * 60 * 1000;

export async function executePrCycle(opts: PrCycleOptions = {}): Promise<PrCycleResult> {
  const cwd = opts.cwd ?? process.cwd();
  const runner = opts.cmdRunner ?? defaultRunner;
  const sleep = opts.sleep ?? defaultSleep;
  const waitMs = opts.waitMs ?? DEFAULT_WAIT_MS;
  const claudefastBin = opts.claudefastBin ?? "claudefast";
  const codexfastgBin = opts.codexfastgBin ?? "codexfastg";
  const lines: string[] = [];

  const createCommand = buildCreateCommand(opts);
  const initialViewCommand = buildViewCommand(opts.prNumber, opts);
  const reviewViewCommand = buildViewCommand(opts.prNumber, opts);

  if (opts.dryRun) {
    lines.push("🔍 TeamAgent PR Cycle (dry-run)");
    lines.push("");
    if (!opts.prNumber && !opts.noCreate) {
      lines.push(`  将创建 PR: ${createCommand}`);
      lines.push(`  将定位 PR: ${initialViewCommand}`);
    } else {
      lines.push(`  将使用现有 PR: ${initialViewCommand}`);
    }
    lines.push(`  将等待: ${waitMs}ms`);
    lines.push(`  将检查 review: ${reviewViewCommand}`);
    lines.push("");
    lines.push("  若发现需要处理的 review，将阻塞直接修复，并要求先更新文档/规则：");
    lines.push("  验证规则答案（二选一，直到答案正确）：");
    lines.push(`    !${claudefastBin} -p "{pr_index} 根据规则，我们应该怎么解决这个review出来的问题？"`);
    lines.push(`    !${codexfastgBin} -p "{pr_index} 根据规则，我们应该怎么解决这个review出来的问题？"`);
    return { output: lines.join("\n") + "\n", blocked: false };
  }

  const simpleRunner = (cmd: string) => runner(cmd, { cwd });
  if (!(await isGhAvailable(simpleRunner))) {
    return {
      output: "✗ gh CLI 未安装或不可用。pr-cycle 需要 gh 来创建和读取 PR。\n",
      blocked: true,
    };
  }

  try {
    if (!opts.prNumber && !opts.noCreate) {
      lines.push(`🚀 创建 PR: ${createCommand}`);
      const createOut = await runner(createCommand, { cwd });
      const url = extractFirstUrl(createOut);
      if (url) lines.push(`  PR URL: ${url}`);
    }

    const initialView = parsePrView(await runner(initialViewCommand, { cwd }));
    const prNumber = opts.prNumber ?? initialView.number;
    const prUrl = initialView.url;
    if (!prNumber) {
      return {
        output: lines.concat([
          "✗ 无法定位 PR number。请确认当前分支已有 PR，或传 --pr <number>。",
        ]).join("\n") + "\n",
        blocked: true,
      };
    }

    lines.push(`✅ PR 已定位: #${prNumber}${prUrl ? ` ${prUrl}` : ""}`);
    lines.push(`⏱ 等待 ${waitMs}ms 后检查 review`);
    await sleep(waitMs);

    const reviewView = parsePrView(await runner(buildViewCommand(prNumber, opts), { cwd }));
    const reviewInputs = parseGhPrReviews(JSON.stringify({ reviews: reviewView.reviews ?? [] }));

    if (reviewInputs.length === 0) {
      lines.push("✅ Review 检查完成：没有需要先写规则的 review。");
      return { output: lines.join("\n") + "\n", blocked: false };
    }

    lines.push(`⛔ Review 检查发现 ${reviewInputs.length} 条需要处理的反馈。`);
    lines.push("");
    reviewInputs.slice(0, 5).forEach((input, idx) => {
      lines.push(`  ${idx + 1}. ${input.context.replace(/\s+/g, " ").slice(0, 220)}`);
    });
    if (reviewInputs.length > 5) {
      lines.push(`  ... (${reviewInputs.length - 5} more)`);
    }
    lines.push("");
    lines.push("Gate: 先更新项目文档/规则，写清以后遇到这类 review 应如何回答和处理。");
    lines.push("正确前不要直接改代码处理 review；让规则先被 Claude Code 读到。");
    lines.push("");
    lines.push("在 Claude Code 交互界面运行并反复校准，直到回答正确（二选一）：");
    lines.push(`  !${claudefastBin} -p "${prNumber} 根据规则，我们应该怎么解决这个review出来的问题？"`);
    lines.push(`  !${codexfastgBin} -p "${prNumber} 根据规则，我们应该怎么解决这个review出来的问题？"`);
    lines.push("");
    lines.push("回答正确后，再处理 review，并可摄入 review 形成候选规则：");
    lines.push(`  teamagent ingest --from-pr ${prNumber} --dry-run`);

    return { output: lines.join("\n") + "\n", blocked: true };
  } catch (err) {
    lines.push(`✗ pr-cycle 失败: ${err instanceof Error ? err.message : String(err)}`);
    return { output: lines.join("\n") + "\n", blocked: true };
  }
}

export function parsePrCycleArgs(argv: string[]): PrCycleOptions {
  const opts: PrCycleOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--pr" && argv[i + 1]) {
      opts.prNumber = parsePositiveInt(argv[++i]!, "--pr");
    } else if (a.startsWith("--pr=")) {
      opts.prNumber = parsePositiveInt(a.slice("--pr=".length), "--pr");
    } else if (a === "--no-create") {
      opts.noCreate = true;
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--draft") {
      opts.draft = true;
    } else if (a === "--wait-ms" && argv[i + 1]) {
      opts.waitMs = parseNonNegativeInt(argv[++i]!, "--wait-ms");
    } else if (a.startsWith("--wait-ms=")) {
      opts.waitMs = parseNonNegativeInt(a.slice("--wait-ms=".length), "--wait-ms");
    } else if (a === "--wait-seconds" && argv[i + 1]) {
      opts.waitMs = parseNonNegativeInt(argv[++i]!, "--wait-seconds") * 1000;
    } else if (a.startsWith("--wait-seconds=")) {
      opts.waitMs = parseNonNegativeInt(a.slice("--wait-seconds=".length), "--wait-seconds") * 1000;
    } else if (a === "--title" && argv[i + 1]) {
      opts.title = argv[++i];
    } else if (a.startsWith("--title=")) {
      opts.title = a.slice("--title=".length);
    } else if (a === "--body" && argv[i + 1]) {
      opts.body = argv[++i];
    } else if (a.startsWith("--body=")) {
      opts.body = a.slice("--body=".length);
    } else if (a === "--body-file" && argv[i + 1]) {
      opts.bodyFile = argv[++i];
    } else if (a.startsWith("--body-file=")) {
      opts.bodyFile = a.slice("--body-file=".length);
    } else if (a === "--base" && argv[i + 1]) {
      opts.base = argv[++i];
    } else if (a.startsWith("--base=")) {
      opts.base = a.slice("--base=".length);
    } else if (a === "--head" && argv[i + 1]) {
      opts.head = argv[++i];
    } else if (a.startsWith("--head=")) {
      opts.head = a.slice("--head=".length);
    } else if (a === "--repo" && argv[i + 1]) {
      opts.repo = argv[++i];
    } else if (a.startsWith("--repo=")) {
      opts.repo = a.slice("--repo=".length);
    } else if (a === "--claudefast-bin" && argv[i + 1]) {
      opts.claudefastBin = argv[++i];
    } else if (a.startsWith("--claudefast-bin=")) {
      opts.claudefastBin = a.slice("--claudefast-bin=".length);
    } else if (a === "--codexfastg-bin" && argv[i + 1]) {
      opts.codexfastgBin = argv[++i];
    } else if (a.startsWith("--codexfastg-bin=")) {
      opts.codexfastgBin = a.slice("--codexfastg-bin=".length);
    }
  }
  return opts;
}

function buildCreateCommand(opts: PrCycleOptions): string {
  const parts = ["gh", "pr", "create"];
  if (opts.repo) parts.push("--repo", opts.repo);
  if (opts.base) parts.push("--base", opts.base);
  if (opts.head) parts.push("--head", opts.head);
  if (opts.draft) parts.push("--draft");
  if (opts.title) parts.push("--title", opts.title);
  if (opts.body) parts.push("--body", opts.body);
  if (opts.bodyFile) parts.push("--body-file", opts.bodyFile);
  if (!opts.title && !opts.body && !opts.bodyFile) parts.push("--fill");
  return shellJoin(parts);
}

function buildViewCommand(prNumber: number | undefined, opts: PrCycleOptions): string {
  const parts = ["gh", "pr", "view"];
  if (prNumber !== undefined) parts.push(String(prNumber));
  if (opts.repo) parts.push("--repo", opts.repo);
  parts.push("--json", "number,url,reviews");
  return shellJoin(parts);
}

function parsePrView(raw: string): PrView {
  try {
    const parsed = JSON.parse(raw) as PrView;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function extractFirstUrl(raw: string): string | null {
  return raw.match(/https?:\/\/\S+/)?.[0] ?? null;
}

function parsePositiveInt(raw: string, flag: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${flag} 必须是正整数，收到: "${raw}"`);
  }
  return n;
}

function parseNonNegativeInt(raw: string, flag: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${flag} 必须是非负整数，收到: "${raw}"`);
  }
  return n;
}

function shellJoin(parts: string[]): string {
  return parts.map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function defaultRunner(
  cmd: string,
  opts: { cwd?: string } = {},
): Promise<string> {
  return execSync(cmd, {
    cwd: opts.cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
