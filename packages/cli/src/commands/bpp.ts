// BPP (Best-Practice Push) CLI namespace.
//
// Wires the user-facing `teamagent bpp <subcommand>` surface onto the
// digital-twin BPP server + handlers (which shipped in PR #430 but had no
// CLI entry point). Acceptance contract:
//   docs/plans/2026-05-13-bpp-full-system-acceptance.md §2 里程碑一.
//
// PR-A scope: the namespace dispatcher + `bpp serve`. Later PRs add
// push / inbox / accept / reject / revoke / audit / role under the same
// dispatcher.

import {
  runProdServer,
  runMining,
  type BestPractice,
  type BpType,
  type BpTier,
  type BpTopic,
  type InboxItem,
  type PushEvent,
  type RoleTier,
} from "@teamagent/digital-twin";

/** Thrown for malformed `bpp` invocations — bin.ts maps this to exit 2. */
export class BppArgError extends Error {}

/** Uniform return shape for the HTTP-client subcommands (push/inbox/accept/reject). */
export interface BppCmdResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Default central-server URL — matches runProdServer's default PORT=8080. */
export const BPP_DEFAULT_SERVER = "http://127.0.0.1:8080";

// ── bpp serve ─────────────────────────────────────────────────────────────

export interface BppServeArgs {
  port?: number;
  host?: string;
  dir?: string;
  help: boolean;
}

export function parseBppServeArgs(argv: string[]): BppServeArgs {
  const out: BppServeArgs = { help: false };
  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a.startsWith("--port=")) {
      out.port = Number(a.slice("--port=".length));
    } else if (a.startsWith("--host=")) {
      out.host = a.slice("--host=".length);
    } else if (a.startsWith("--dir=")) {
      out.dir = a.slice("--dir=".length);
    } else {
      throw new BppArgError(`bpp serve: 未知参数 ${a}`);
    }
  }
  return out;
}

export function renderBppServeHelp(): string {
  return [
    "teamagent bpp serve — 启动 BPP 中心服务",
    "",
    "用法:",
    "  teamagent bpp serve [--port=<n>] [--host=<host>] [--dir=<path>]",
    "",
    "  --port=<n>     监听端口（默认 8080，或环境变量 PORT）",
    "  --host=<host>  绑定地址（默认 0.0.0.0，或环境变量 HOST）",
    "  --dir=<path>   数据落盘目录（默认 ~/teamagent-collector，或 TEAMAGENT_COLLECTOR_DIR）",
    "",
    "环境变量（M2 对话上传通道传输安全）:",
    "  BPP_AUTH_TOKEN              设置后，POST /v1/cc-sessions 需携带 Authorization: Bearer <token>",
    "  HTTPS_KEY_PATH/HTTPS_CERT_PATH  同时设置后，服务走 TLS 而非明文 HTTP",
    "",
    "服务器进程持续运行，直到收到 SIGINT / SIGTERM。",
  ].join("\n");
}

export interface BppServeHandle {
  url: string;
  outputDir: string;
  close: () => Promise<void>;
}

export interface RunBppServeDeps {
  /** Injectable for tests — defaults to the real digital-twin entry. */
  runProdServer: typeof runProdServer;
  /** When true (CLI default) wire SIGINT/SIGTERM → graceful shutdown → exit. */
  installSignalHandlers: boolean;
  /** Diagnostic sink — defaults to stderr. */
  log: (msg: string) => void;
}

/**
 * Start the BPP central server. Resolves once the server is listening; the
 * returned handle keeps the process alive (the HTTP server holds the event
 * loop) until `close()` is called or a signal triggers shutdown.
 */
export async function runBppServe(
  args: BppServeArgs,
  deps: Partial<RunBppServeDeps> = {},
): Promise<BppServeHandle> {
  const _runProdServer = deps.runProdServer ?? runProdServer;
  const installSignalHandlers = deps.installSignalHandlers ?? true;
  const log = deps.log ?? ((m: string) => process.stderr.write(m + "\n"));

  if (
    args.port !== undefined &&
    (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535)
  ) {
    throw new BppArgError(
      `bpp serve: --port 必须是 0-65535 的整数（收到 ${args.port}）`,
    );
  }

  // CLI flags override inherited env; runProdServer reads PORT / HOST /
  // TEAMAGENT_COLLECTOR_DIR off the env object we pass.
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (args.port !== undefined) env.PORT = String(args.port);
  if (args.host !== undefined) env.HOST = args.host;
  if (args.dir !== undefined) env.TEAMAGENT_COLLECTOR_DIR = args.dir;

  let captured: { url: string; outputDir: string } | undefined;
  const close = await _runProdServer({
    env,
    log,
    onReady: (info) => {
      captured = info;
    },
  });

  if (captured === undefined) {
    // onReady fires synchronously inside runProdServer before it resolves,
    // so this is purely defensive.
    await close();
    throw new Error("bpp serve: 服务器已启动但未上报就绪信息");
  }

  if (installSignalHandlers) {
    const shutdown = (signal: string): void => {
      log(`[teamagent bpp serve] 收到 ${signal}，正在关闭`);
      close()
        .then(() => process.exit(0))
        .catch((err) => {
          log(`关闭出错: ${String(err)}`);
          process.exit(1);
        });
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }

  return { url: captured.url, outputDir: captured.outputDir, close };
}

// ── shared HTTP-client plumbing ───────────────────────────────────────────

/** Strip trailing slashes so `${server}/v1/...` joins cleanly. */
function normalizeServer(raw: string): string {
  return raw.replace(/\/+$/, "");
}

async function httpPostJson(
  url: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  return { status: res.status, json };
}

async function httpGetJson(
  url: string,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  return { status: res.status, json };
}

/** Map a connection failure (server not running) to a clean CLI result. */
function connRefusedResult(server: string, err: unknown): BppCmdResult {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    exitCode: 1,
    stdout: "",
    stderr:
      `bpp: 无法连接到中心服务 ${server} — ${msg}\n` +
      "（先用 `teamagent bpp serve` 启动服务，或用 --server=<url> 指定地址）\n",
  };
}

// ── bpp push ──────────────────────────────────────────────────────────────

const BP_TYPES: readonly BpType[] = ["rule", "skill", "habit", "context-mgmt"];
const BP_TOPICS: readonly BpTopic[] = [
  "testing",
  "git-flow",
  "ctx-mgmt",
  "code-style",
  "ai-collab",
];
const BP_TIERS: readonly BpTier[] = [
  "low",
  "stable",
  "canonical",
  "enforced",
  "gold",
];

export interface BppPushArgs {
  help: boolean;
  server: string;
  id?: string;
  title?: string;
  body?: string;
  receivers: string[];
  type: BpType;
  example: string;
  pushedBy: string;
  pushedByDisplay?: string;
  topic: BpTopic;
  tier: BpTier;
  score: number;
}

export function parseBppPushArgs(argv: string[]): BppPushArgs {
  const out: BppPushArgs = {
    help: false,
    server: BPP_DEFAULT_SERVER,
    receivers: [],
    type: "rule",
    example: "",
    pushedBy: "cli",
    topic: "ai-collab",
    tier: "stable",
    score: 1,
  };
  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a.startsWith("--server=")) {
      out.server = a.slice("--server=".length);
    } else if (a.startsWith("--id=")) {
      out.id = a.slice("--id=".length);
    } else if (a.startsWith("--title=")) {
      out.title = a.slice("--title=".length);
    } else if (a.startsWith("--body=")) {
      out.body = a.slice("--body=".length);
    } else if (a.startsWith("--receivers=")) {
      out.receivers = a
        .slice("--receivers=".length)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (a.startsWith("--type=")) {
      const v = a.slice("--type=".length);
      if (!BP_TYPES.includes(v as BpType)) {
        throw new BppArgError(`bpp push: --type 必须是 ${BP_TYPES.join("|")}`);
      }
      out.type = v as BpType;
    } else if (a.startsWith("--example=")) {
      out.example = a.slice("--example=".length);
    } else if (a.startsWith("--pushed-by=")) {
      out.pushedBy = a.slice("--pushed-by=".length);
    } else if (a.startsWith("--pushed-by-display=")) {
      out.pushedByDisplay = a.slice("--pushed-by-display=".length);
    } else if (a.startsWith("--topic=")) {
      const v = a.slice("--topic=".length);
      if (!BP_TOPICS.includes(v as BpTopic)) {
        throw new BppArgError(`bpp push: --topic 必须是 ${BP_TOPICS.join("|")}`);
      }
      out.topic = v as BpTopic;
    } else if (a.startsWith("--tier=")) {
      const v = a.slice("--tier=".length);
      if (!BP_TIERS.includes(v as BpTier)) {
        throw new BppArgError(`bpp push: --tier 必须是 ${BP_TIERS.join("|")}`);
      }
      out.tier = v as BpTier;
    } else if (a.startsWith("--score=")) {
      const v = Number(a.slice("--score=".length));
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new BppArgError("bpp push: --score 必须是 0..1 的数字");
      }
      out.score = v;
    } else {
      throw new BppArgError(`bpp push: 未知参数 ${a}`);
    }
  }
  return out;
}

export function renderBppPushHelp(): string {
  return [
    "teamagent bpp push — 向中心服务推送一条最佳实践",
    "",
    "用法:",
    "  teamagent bpp push --id=<id> --title=<标题> --body=<正文> --receivers=<a,b,c>",
    "                     [--server=<url>] [--type=rule|skill|habit|context-mgmt]",
    "                     [--example=<文本>] [--pushed-by=<id>] [--pushed-by-display=<名字>]",
    "                     [--topic=testing|git-flow|ctx-mgmt|code-style|ai-collab]",
    "                     [--tier=low|stable|canonical|enforced|gold] [--score=<0..1>]",
    "",
    `  --server=<url>   中心服务地址（默认 ${BPP_DEFAULT_SERVER}）`,
    "  --receivers=     逗号分隔的接收者 id 列表",
  ].join("\n");
}

export async function runBppPush(args: BppPushArgs): Promise<BppCmdResult> {
  if (
    args.id === undefined ||
    args.title === undefined ||
    args.body === undefined ||
    args.receivers.length === 0
  ) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: "bpp push: 必须提供 --id / --title / --body / --receivers\n",
    };
  }
  const bp: BestPractice = {
    schema_version: 1,
    id: args.id,
    type: args.type,
    title: args.title,
    body: args.body,
    example: args.example,
    pushed_by: args.pushedBy,
    pushed_by_display: args.pushedByDisplay ?? args.pushedBy,
    topic: args.topic,
    confidence_score: args.score,
    confidence_tier: args.tier,
    conflict_with: [],
    mining_evidence: {
      sessions_observed: 0,
      pattern_count: 0,
      reject_count: 0,
      extraction_method: "manual-cli-push",
    },
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    created_at: new Date().toISOString(),
  };
  const server = normalizeServer(args.server);
  let resp: { status: number; json: unknown };
  try {
    resp = await httpPostJson(`${server}/v1/bp-push`, {
      bp,
      receivers: args.receivers,
    });
  } catch (err) {
    return connRefusedResult(server, err);
  }
  if (resp.status !== 200) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `bpp push: 服务返回 ${resp.status} — ${JSON.stringify(resp.json)}\n`,
    };
  }
  const r = resp.json as { ok: true; bp_id: string; delivered_to: string[] };
  return {
    exitCode: 0,
    stdout: `已推送 ${r.bp_id} → ${r.delivered_to.length} 个接收者: ${r.delivered_to.join(", ")}\n`,
    stderr: "",
  };
}

// ── bpp inbox ─────────────────────────────────────────────────────────────

export interface BppInboxArgs {
  help: boolean;
  server: string;
  receiver?: string;
  json: boolean;
}

export function parseBppInboxArgs(argv: string[]): BppInboxArgs {
  const out: BppInboxArgs = {
    help: false,
    server: BPP_DEFAULT_SERVER,
    json: false,
  };
  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a === "--json") {
      out.json = true;
    } else if (a.startsWith("--server=")) {
      out.server = a.slice("--server=".length);
    } else if (a.startsWith("--receiver=")) {
      out.receiver = a.slice("--receiver=".length);
    } else {
      throw new BppArgError(`bpp inbox: 未知参数 ${a}`);
    }
  }
  return out;
}

export function renderBppInboxHelp(): string {
  return [
    "teamagent bpp inbox — 查看某个接收者的收件箱",
    "",
    "用法:",
    "  teamagent bpp inbox --receiver=<id> [--server=<url>] [--json]",
    "",
    `  --server=<url>   中心服务地址（默认 ${BPP_DEFAULT_SERVER}）`,
    "  --json           输出原始 JSON 而非人类可读列表",
  ].join("\n");
}

export async function runBppInbox(args: BppInboxArgs): Promise<BppCmdResult> {
  if (args.receiver === undefined) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: "bpp inbox: 必须提供 --receiver\n",
    };
  }
  const server = normalizeServer(args.server);
  let resp: { status: number; json: unknown };
  try {
    resp = await httpGetJson(
      `${server}/v1/inbox?receiver=${encodeURIComponent(args.receiver)}`,
    );
  } catch (err) {
    return connRefusedResult(server, err);
  }
  if (resp.status !== 200) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `bpp inbox: 服务返回 ${resp.status} — ${JSON.stringify(resp.json)}\n`,
    };
  }
  const r = resp.json as { ok: true; items: InboxItem[] };
  if (args.json) {
    return {
      exitCode: 0,
      stdout: JSON.stringify(r.items, null, 2) + "\n",
      stderr: "",
    };
  }
  if (r.items.length === 0) {
    return {
      exitCode: 0,
      stdout: `${args.receiver} 的收件箱为空\n`,
      stderr: "",
    };
  }
  const lines = r.items.map(
    (it) =>
      `  ${it.id}  bp=${it.bp_id}  status=${it.status}  delivered=${it.delivered_at}`,
  );
  return {
    exitCode: 0,
    stdout: `${args.receiver} 的收件箱（${r.items.length} 条）:\n${lines.join("\n")}\n`,
    stderr: "",
  };
}

// ── bpp accept / bpp reject ───────────────────────────────────────────────

export interface BppActArgs {
  help: boolean;
  server: string;
  inboxId?: string;
  receiver?: string;
}

export function parseBppActArgs(argv: string[], action: "accept" | "reject"): BppActArgs {
  const out: BppActArgs = { help: false, server: BPP_DEFAULT_SERVER };
  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a.startsWith("--server=")) {
      out.server = a.slice("--server=".length);
    } else if (a.startsWith("--inbox-id=")) {
      out.inboxId = a.slice("--inbox-id=".length);
    } else if (a.startsWith("--receiver=")) {
      out.receiver = a.slice("--receiver=".length);
    } else {
      throw new BppArgError(`bpp ${action}: 未知参数 ${a}`);
    }
  }
  return out;
}

export function renderBppActHelp(action: "accept" | "reject"): string {
  const verb = action === "accept" ? "采纳" : "拒绝";
  return [
    `teamagent bpp ${action} — ${verb}收件箱里的一条最佳实践`,
    "",
    "用法:",
    `  teamagent bpp ${action} --inbox-id=<id> --receiver=<id> [--server=<url>]`,
    "",
    `  --server=<url>   中心服务地址（默认 ${BPP_DEFAULT_SERVER}）`,
    action === "accept"
      ? "  采纳会在本机技能库生成一份 SKILL.md，返回里带 compiled_path。"
      : "  拒绝只翻转收件箱状态，不生成技能文件。",
  ].join("\n");
}

export async function runBppAct(
  args: BppActArgs,
  action: "accept" | "reject",
): Promise<BppCmdResult> {
  if (args.inboxId === undefined || args.receiver === undefined) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `bpp ${action}: 必须提供 --inbox-id / --receiver\n`,
    };
  }
  const server = normalizeServer(args.server);
  let resp: { status: number; json: unknown };
  try {
    resp = await httpPostJson(`${server}/v1/inbox/act`, {
      inbox_id: args.inboxId,
      receiver_id: args.receiver,
      action,
    });
  } catch (err) {
    return connRefusedResult(server, err);
  }
  if (resp.status !== 200) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `bpp ${action}: 服务返回 ${resp.status} — ${JSON.stringify(resp.json)}\n`,
    };
  }
  const r = resp.json as { ok: true; status: string; compiled_path?: string };
  let out = `inbox ${args.inboxId} → ${r.status}\n`;
  if (r.compiled_path !== undefined) {
    out += `已编译技能文件: ${r.compiled_path}\n`;
  }
  return { exitCode: 0, stdout: out, stderr: "" };
}

// ── bpp revoke ────────────────────────────────────────────────────────────

export interface BppRevokeArgs {
  help: boolean;
  server: string;
  bpId?: string;
  leadUserId?: string;
  reason?: string;
}

export function parseBppRevokeArgs(argv: string[]): BppRevokeArgs {
  const out: BppRevokeArgs = { help: false, server: BPP_DEFAULT_SERVER };
  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a.startsWith("--server=")) {
      out.server = a.slice("--server=".length);
    } else if (a.startsWith("--bp-id=")) {
      out.bpId = a.slice("--bp-id=".length);
    } else if (a.startsWith("--lead-user-id=")) {
      out.leadUserId = a.slice("--lead-user-id=".length);
    } else if (a.startsWith("--reason=")) {
      out.reason = a.slice("--reason=".length);
    } else {
      throw new BppArgError(`bpp revoke: 未知参数 ${a}`);
    }
  }
  return out;
}

export function renderBppRevokeHelp(): string {
  return [
    "teamagent bpp revoke — 团队负责人撤回一条最佳实践",
    "",
    "用法:",
    "  teamagent bpp revoke --bp-id=<id> --lead-user-id=<id> --reason=<文本>",
    "                       [--server=<url>]",
    "",
    `  --server=<url>   中心服务地址（默认 ${BPP_DEFAULT_SERVER}）`,
    "  撤回会级联：未采纳的收件箱条目翻转为 revoked，已采纳的本机技能文件被删除。",
    "  调用方必须是团队负责人（main_lead / co_lead），否则服务返回 403。",
  ].join("\n");
}

export async function runBppRevoke(args: BppRevokeArgs): Promise<BppCmdResult> {
  if (
    args.bpId === undefined ||
    args.leadUserId === undefined ||
    args.reason === undefined
  ) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: "bpp revoke: 必须提供 --bp-id / --lead-user-id / --reason\n",
    };
  }
  const server = normalizeServer(args.server);
  let resp: { status: number; json: unknown };
  try {
    resp = await httpPostJson(`${server}/v1/revoke`, {
      bp_id: args.bpId,
      lead_user_id: args.leadUserId,
      reason: args.reason,
    });
  } catch (err) {
    return connRefusedResult(server, err);
  }
  if (resp.status !== 200) {
    const hint = resp.status === 403 ? "（调用方不是团队负责人）" : "";
    return {
      exitCode: 1,
      stdout: "",
      stderr: `bpp revoke: 服务返回 ${resp.status}${hint} — ${JSON.stringify(resp.json)}\n`,
    };
  }
  const r = resp.json as {
    ok: true;
    bp_id: string;
    revoked_inbox_count: number;
    deleted_skill_files: string[];
  };
  let out = `已撤回 ${r.bp_id}：${r.revoked_inbox_count} 条收件箱条目翻转为 revoked\n`;
  if (r.deleted_skill_files.length > 0) {
    out += `已级联删除 ${r.deleted_skill_files.length} 个本机技能文件:\n`;
    for (const f of r.deleted_skill_files) out += `  ${f}\n`;
  } else {
    out += "无已采纳的技能文件需要删除\n";
  }
  return { exitCode: 0, stdout: out, stderr: "" };
}

// ── bpp force-push ────────────────────────────────────────────────────────

export interface BppForcePushArgs {
  help: boolean;
  server: string;
  bpId?: string;
  receiver?: string;
  leadUserId?: string;
}

export function parseBppForcePushArgs(argv: string[]): BppForcePushArgs {
  const out: BppForcePushArgs = { help: false, server: BPP_DEFAULT_SERVER };
  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a.startsWith("--server=")) {
      out.server = a.slice("--server=".length);
    } else if (a.startsWith("--bp-id=")) {
      out.bpId = a.slice("--bp-id=".length);
    } else if (a.startsWith("--receiver=")) {
      out.receiver = a.slice("--receiver=".length);
    } else if (a.startsWith("--lead-user-id=")) {
      out.leadUserId = a.slice("--lead-user-id=".length);
    } else {
      throw new BppArgError(`bpp force-push: 未知参数 ${a}`);
    }
  }
  return out;
}

export function renderBppForcePushHelp(): string {
  return [
    "teamagent bpp force-push — 团队负责人强推一条最佳实践给某个成员",
    "",
    "用法:",
    "  teamagent bpp force-push --bp-id=<id> --receiver=<id> --lead-user-id=<id>",
    "                           [--server=<url>]",
    "",
    `  --server=<url>   中心服务地址（默认 ${BPP_DEFAULT_SERVER}）`,
    "  强推会在接收者收件箱里直接放一条 forced_by_lead 的条目。",
    "  调用方必须是团队负责人（main_lead / co_lead），否则服务返回 403。",
  ].join("\n");
}

export async function runBppForcePush(
  args: BppForcePushArgs,
): Promise<BppCmdResult> {
  if (
    args.bpId === undefined ||
    args.receiver === undefined ||
    args.leadUserId === undefined
  ) {
    return {
      exitCode: 2,
      stdout: "",
      stderr:
        "bpp force-push: 必须提供 --bp-id / --receiver / --lead-user-id\n",
    };
  }
  const server = normalizeServer(args.server);
  let resp: { status: number; json: unknown };
  try {
    resp = await httpPostJson(`${server}/v1/bp-push/force`, {
      bp_id: args.bpId,
      receiver_id: args.receiver,
      lead_user_id: args.leadUserId,
    });
  } catch (err) {
    return connRefusedResult(server, err);
  }
  if (resp.status !== 200) {
    const hint = resp.status === 403 ? "（调用方不是团队负责人）" : "";
    return {
      exitCode: 1,
      stdout: "",
      stderr: `bpp force-push: 服务返回 ${resp.status}${hint} — ${JSON.stringify(resp.json)}\n`,
    };
  }
  const r = resp.json as { ok: true; inbox_id: string; receiver_id: string };
  return {
    exitCode: 0,
    stdout: `已强推 ${args.bpId} → ${r.receiver_id}（收件箱条目 ${r.inbox_id}）\n`,
    stderr: "",
  };
}

// ── bpp audit ─────────────────────────────────────────────────────────────

export interface BppAuditArgs {
  help: boolean;
  server: string;
  since?: string;
  json: boolean;
}

export function parseBppAuditArgs(argv: string[]): BppAuditArgs {
  const out: BppAuditArgs = {
    help: false,
    server: BPP_DEFAULT_SERVER,
    json: false,
  };
  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a === "--json") {
      out.json = true;
    } else if (a.startsWith("--server=")) {
      out.server = a.slice("--server=".length);
    } else if (a.startsWith("--since=")) {
      out.since = a.slice("--since=".length);
    } else {
      throw new BppArgError(`bpp audit: 未知参数 ${a}`);
    }
  }
  return out;
}

export function renderBppAuditHelp(): string {
  return [
    "teamagent bpp audit — 查看中心服务的审计事件日志",
    "",
    "用法:",
    "  teamagent bpp audit [--since=<ISO 时间>] [--server=<url>] [--json]",
    "",
    `  --server=<url>   中心服务地址（默认 ${BPP_DEFAULT_SERVER}）`,
    "  --since=<ISO>    只显示该时间点及之后的事件",
    "  --json           输出原始 JSON 而非人类可读列表",
  ].join("\n");
}

export async function runBppAudit(args: BppAuditArgs): Promise<BppCmdResult> {
  const server = normalizeServer(args.server);
  const qs =
    args.since !== undefined
      ? `?since=${encodeURIComponent(args.since)}`
      : "";
  let resp: { status: number; json: unknown };
  try {
    resp = await httpGetJson(`${server}/v1/audit${qs}`);
  } catch (err) {
    return connRefusedResult(server, err);
  }
  if (resp.status !== 200) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `bpp audit: 服务返回 ${resp.status} — ${JSON.stringify(resp.json)}\n`,
    };
  }
  const r = resp.json as { ok: true; events: PushEvent[] };
  if (args.json) {
    return {
      exitCode: 0,
      stdout: JSON.stringify(r.events, null, 2) + "\n",
      stderr: "",
    };
  }
  if (r.events.length === 0) {
    return { exitCode: 0, stdout: "审计日志为空\n", stderr: "" };
  }
  const lines = r.events.map(
    (ev) =>
      `  ${ev.timestamp}  ${ev.event_type}  bp=${ev.bp_id}  actor=${ev.actor}  ${ev.id}`,
  );
  return {
    exitCode: 0,
    stdout: `审计事件日志（${r.events.length} 条）:\n${lines.join("\n")}\n`,
    stderr: "",
  };
}

// ── bpp role ──────────────────────────────────────────────────────────────

export interface BppRoleArgs {
  help: boolean;
  server: string;
  user?: string;
}

export function parseBppRoleArgs(argv: string[]): BppRoleArgs {
  const out: BppRoleArgs = { help: false, server: BPP_DEFAULT_SERVER };
  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a.startsWith("--server=")) {
      out.server = a.slice("--server=".length);
    } else if (a.startsWith("--user=")) {
      out.user = a.slice("--user=".length);
    } else {
      throw new BppArgError(`bpp role: 未知参数 ${a}`);
    }
  }
  return out;
}

export function renderBppRoleHelp(): string {
  return [
    "teamagent bpp role — 查询某个用户的有效角色层级",
    "",
    "用法:",
    "  teamagent bpp role --user=<id> [--server=<url>]",
    "",
    `  --server=<url>   中心服务地址（默认 ${BPP_DEFAULT_SERVER}）`,
    "  --user=<id>      要查询的用户 id",
    "",
    "  返回 main_lead / co_lead / member 之一。",
    "  副 lead（co_lead）可以撤回与强推，但不能转移主 lead 角色。",
  ].join("\n");
}

export async function runBppRole(args: BppRoleArgs): Promise<BppCmdResult> {
  if (args.user === undefined) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: "bpp role: 必须提供 --user\n",
    };
  }
  const server = normalizeServer(args.server);
  let resp: { status: number; json: unknown };
  try {
    resp = await httpGetJson(
      `${server}/v1/role?user=${encodeURIComponent(args.user)}`,
    );
  } catch (err) {
    return connRefusedResult(server, err);
  }
  if (resp.status !== 200) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `bpp role: 服务返回 ${resp.status} — ${JSON.stringify(resp.json)}\n`,
    };
  }
  const r = resp.json as { ok: true; user_id: string; tier: RoleTier };
  return {
    exitCode: 0,
    stdout: `${r.user_id} 的角色层级: ${r.tier}\n`,
    stderr: "",
  };
}

// ── bpp join ──────────────────────────────────────────────────────────────

export interface BppJoinArgs {
  help: boolean;
  server: string;
  userId?: string;
  displayName?: string;
}

export function parseBppJoinArgs(argv: string[]): BppJoinArgs {
  const out: BppJoinArgs = { help: false, server: BPP_DEFAULT_SERVER };
  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a.startsWith("--server=")) {
      out.server = a.slice("--server=".length);
    } else if (a.startsWith("--user-id=")) {
      out.userId = a.slice("--user-id=".length);
    } else if (a.startsWith("--display-name=")) {
      out.displayName = a.slice("--display-name=".length);
    } else {
      throw new BppArgError(`bpp join: 未知参数 ${a}`);
    }
  }
  return out;
}

export function renderBppJoinHelp(): string {
  return [
    "teamagent bpp join — 成员客户端：一键接入 BPP 中心服务",
    "",
    "用法:",
    "  teamagent bpp join --user-id=<id> --display-name=<名字> [--server=<url>]",
    "",
    `  --server=<url>       中心服务地址（默认 ${BPP_DEFAULT_SERVER}）`,
    "  --user-id=<id>       你的稳定用户 id（一般是 git email）",
    "  --display-name=<名字> 团队里展示的名字",
    "",
    "  以 member 角色自动注册到中心服务；之后用 `teamagent bpp inbox` 查看收到的推送。",
  ].join("\n");
}

export async function runBppJoin(args: BppJoinArgs): Promise<BppCmdResult> {
  if (args.userId === undefined || args.displayName === undefined) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: "bpp join: 必须提供 --user-id / --display-name\n",
    };
  }
  const server = normalizeServer(args.server);
  let resp: { status: number; json: unknown };
  try {
    resp = await httpPostJson(`${server}/v1/members`, {
      user_id: args.userId,
      display_name: args.displayName,
    });
  } catch (err) {
    return connRefusedResult(server, err);
  }
  if (resp.status !== 200) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `bpp join: 服务返回 ${resp.status} — ${JSON.stringify(resp.json)}\n`,
    };
  }
  const r = resp.json as { ok: true; user_id: string };
  return {
    exitCode: 0,
    stdout: `已以 member 身份接入中心服务 ${server}：${r.user_id}\n`,
    stderr: "",
  };
}

// ── bpp mine ──────────────────────────────────────────────────────────────
//
// Unlike the other subcommands, `bpp mine` is NOT an HTTP client — it is a
// server-side batch job that reads the M2 conversation repo and writes the
// mining pool / inboxes / audit log / budget ledger directly on disk. It
// calls `runMining` from @teamagent/digital-twin; no central server need run.

export interface BppMineArgs {
  help: boolean;
  repo?: string;
  state?: string;
  seedSample: boolean;
  mock: boolean;
  budgetUsd?: number;
  team?: string;
}

/** Accepts both `--key=value` and `--key value` so the acceptance harness's
 *  space-separated probes (`--repo "$M3_REPO"`) and `=`-form both work. */
export function parseBppMineArgs(argv: string[]): BppMineArgs {
  const out: BppMineArgs = { help: false, seedSample: false, mock: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (a === "--seed-sample") {
      out.seedSample = true;
      continue;
    }
    if (a === "--mock") {
      out.mock = true;
      continue;
    }
    const eq = a.indexOf("=");
    const flag = eq === -1 ? a : a.slice(0, eq);
    const valued = flag === "--repo" || flag === "--state" || flag === "--team" || flag === "--budget-usd";
    if (!valued) {
      throw new BppArgError(`bpp mine: 未知参数 ${a}`);
    }
    let value: string;
    if (eq !== -1) {
      value = a.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined) {
        throw new BppArgError(`bpp mine: ${flag} 需要一个值`);
      }
      value = next;
      i += 1;
    }
    if (flag === "--repo") {
      out.repo = value;
    } else if (flag === "--state") {
      out.state = value;
    } else if (flag === "--team") {
      out.team = value;
    } else {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        throw new BppArgError("bpp mine: --budget-usd 必须是非负数字");
      }
      out.budgetUsd = n;
    }
  }
  return out;
}

export function renderBppMineHelp(): string {
  return [
    "teamagent bpp mine — 运行一次最佳实践挖矿批处理",
    "",
    "用法:",
    "  teamagent bpp mine --repo <对话仓库路径> --state <挖矿状态目录>",
    "                     [--seed-sample] [--mock] [--budget-usd <上限>] [--team <名称>]",
    "",
    "  --repo <path>     M2 中心对话仓库目录（也作为推送根目录）",
    "  --state <path>    挖矿状态目录（pool/ audit/ budget-*.json mined-cursor.json）",
    "  --seed-sample     先把内置的设计样本语料铺进 --repo 再挖矿",
    "  --mock            强制使用确定性的 mock 大模型 provider（花费 0）",
    "  --budget-usd <n>  每团队每天的预算上限（默认 5）",
    "  --team <name>     预算账本的团队键（默认 default）",
    "",
    "  从中心对话仓库拉取还没挖过的对话 → 三个 miner 扇出 → 大模型规范化 →",
    "  Wilson 分级：高分候选自动推送进成员收件箱，低分候选留在挖矿池等下一轮。",
    "  --repo / --state 同时支持 `--repo=<路径>` 和 `--repo <路径>` 两种写法。",
  ].join("\n");
}

export async function runBppMine(args: BppMineArgs): Promise<BppCmdResult> {
  if (args.repo === undefined || args.state === undefined) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: "bpp mine: 必须提供 --repo / --state\n",
    };
  }
  try {
    const result = await runMining({
      repoDir: args.repo,
      stateDir: args.state,
      seedSample: args.seedSample,
      mock: args.mock,
      budgetUsd: args.budgetUsd,
      team: args.team,
      log: (m: string) => process.stderr.write(m + "\n"),
    });
    return {
      exitCode: result.exit_code,
      stdout:
        `挖矿完成 ${result.run_id}：${result.candidates_total} 条候选，` +
        `${result.auto_pushed} 条自动推送进收件箱，` +
        `${result.pool_retained} 条留在挖矿池，` +
        `${result.llm_calls} 次大模型调用，花费 $${result.spent_usd.toFixed(4)}\n`,
      stderr: "",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      stdout: "",
      stderr: `bpp mine: 挖矿失败 — ${msg}\n`,
    };
  }
}

// ── bpp namespace dispatcher ──────────────────────────────────────────────

export function renderBppHelp(): string {
  return [
    "teamagent bpp — Best-Practice Push（团队最佳实践推送）",
    "",
    "用法:",
    "  teamagent bpp serve [--port=<n>] [--host=<host>] [--dir=<path>]",
    "                              启动 BPP 中心服务",
    "  teamagent bpp push --id=<id> --title=<标题> --body=<正文> --receivers=<a,b,c>",
    "                              向中心服务推送一条最佳实践并扇形分发",
    "  teamagent bpp inbox --receiver=<id> [--json]",
    "                              查看某个接收者的收件箱",
    "  teamagent bpp accept --inbox-id=<id> --receiver=<id>",
    "                              采纳一条最佳实践（本机生成 SKILL.md）",
    "  teamagent bpp reject --inbox-id=<id> --receiver=<id>",
    "                              拒绝一条最佳实践",
    "  teamagent bpp revoke --bp-id=<id> --lead-user-id=<id> --reason=<文本>",
    "                              团队负责人撤回（级联删除已采纳的本机技能文件）",
    "  teamagent bpp force-push --bp-id=<id> --receiver=<id> --lead-user-id=<id>",
    "                              团队负责人强推一条最佳实践给某个成员",
    "  teamagent bpp audit [--since=<ISO 时间>] [--json]",
    "                              查看中心服务的审计事件日志",
    "  teamagent bpp role --user=<id>",
    "                              查询某个用户的有效角色层级",
    "  teamagent bpp join --user-id=<id> --display-name=<名字>",
    "                              成员客户端：以 member 身份一键接入中心服务",
    "  teamagent bpp mine --repo=<路径> --state=<路径> [--seed-sample] [--mock]",
    "                              运行一次挖矿批处理：拉取未挖对话→分级→自动推送",
    "",
    "每个子命令支持 --help。",
  ].join("\n");
}

/**
 * `teamagent bpp <subcommand> ...` dispatcher. For `serve`, this resolves
 * once the server is listening; the process then stays alive on the HTTP
 * server's open handle until a signal triggers shutdown.
 */
export async function runBpp(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);

  if (sub === undefined || sub === "--help" || sub === "-h" || sub === "help") {
    process.stdout.write(renderBppHelp() + "\n");
    return;
  }

  if (sub === "serve") {
    const args = parseBppServeArgs(rest);
    if (args.help) {
      process.stdout.write(renderBppServeHelp() + "\n");
      return;
    }
    const handle = await runBppServe(args);
    process.stdout.write(`bpp serve 已监听 ${handle.url}\n`);
    process.stdout.write(`bpp serve 数据目录 ${handle.outputDir}\n`);
    return;
  }

  if (sub === "push") {
    const args = parseBppPushArgs(rest);
    if (args.help) {
      process.stdout.write(renderBppPushHelp() + "\n");
      return;
    }
    writeBppResult(await runBppPush(args));
    return;
  }

  if (sub === "inbox") {
    const args = parseBppInboxArgs(rest);
    if (args.help) {
      process.stdout.write(renderBppInboxHelp() + "\n");
      return;
    }
    writeBppResult(await runBppInbox(args));
    return;
  }

  if (sub === "accept" || sub === "reject") {
    const args = parseBppActArgs(rest, sub);
    if (args.help) {
      process.stdout.write(renderBppActHelp(sub) + "\n");
      return;
    }
    writeBppResult(await runBppAct(args, sub));
    return;
  }

  if (sub === "revoke") {
    const args = parseBppRevokeArgs(rest);
    if (args.help) {
      process.stdout.write(renderBppRevokeHelp() + "\n");
      return;
    }
    writeBppResult(await runBppRevoke(args));
    return;
  }

  if (sub === "force-push") {
    const args = parseBppForcePushArgs(rest);
    if (args.help) {
      process.stdout.write(renderBppForcePushHelp() + "\n");
      return;
    }
    writeBppResult(await runBppForcePush(args));
    return;
  }

  if (sub === "audit") {
    const args = parseBppAuditArgs(rest);
    if (args.help) {
      process.stdout.write(renderBppAuditHelp() + "\n");
      return;
    }
    writeBppResult(await runBppAudit(args));
    return;
  }

  if (sub === "role") {
    const args = parseBppRoleArgs(rest);
    if (args.help) {
      process.stdout.write(renderBppRoleHelp() + "\n");
      return;
    }
    writeBppResult(await runBppRole(args));
    return;
  }

  if (sub === "join") {
    const args = parseBppJoinArgs(rest);
    if (args.help) {
      process.stdout.write(renderBppJoinHelp() + "\n");
      return;
    }
    writeBppResult(await runBppJoin(args));
    return;
  }

  if (sub === "mine") {
    const args = parseBppMineArgs(rest);
    if (args.help) {
      process.stdout.write(renderBppMineHelp() + "\n");
      return;
    }
    writeBppResult(await runBppMine(args));
    return;
  }

  throw new BppArgError(`未知 bpp 子命令: ${sub}`);
}

/** Write a subcommand result to stdout/stderr and exit non-zero on failure. */
function writeBppResult(r: BppCmdResult): void {
  if (r.stdout.length > 0) process.stdout.write(r.stdout);
  if (r.stderr.length > 0) process.stderr.write(r.stderr);
  if (r.exitCode !== 0) process.exit(r.exitCode);
}
