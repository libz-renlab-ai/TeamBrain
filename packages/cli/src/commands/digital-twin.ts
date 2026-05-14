/**
 * `teamagent digital-twin <subcommand>` handlers.
 *
 * 7 subcommands:
 *   - login <token>  → write token to ~/.teamagent/digital-twin.json
 *   - logout         → clear uploader.token
 *   - status         → human-readable config + queue + daemon status
 *   - pause          → uploader.enabled = false
 *   - resume         → uploader.enabled = true
 *   - inject-mock    → enqueue a synthetic cc-session for local testing
 *   - member-stats   → query the central server for this member's upload
 *                      stats (已上传对话总量 / 最近一次上传时间 / 敏感字段被
 *                      模糊化次数) — M2 对话上传通道 self-view
 *
 * Handlers accept dependency injection via `homedir` + `print` so tests can
 * point at a tmp HOME and capture stdout without touching the real shell.
 */
import { homedir as osHomedir } from 'node:os';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ulid as defaultUlid } from 'ulid';
import {
  digitalTwinPaths,
  loadConfig,
  saveConfig,
  defaultConfig,
  getUserId,
  getMachineId,
  listPending,
  readPidFile,
  isPidAlive,
  readLastUploaderError,
  tapSession,
  claudeTranscriptPath,
  type TapSessionResult,
} from '@teamagent/digital-twin';

export type DigitalTwinSubcommand =
  | 'login'
  | 'logout'
  | 'status'
  | 'pause'
  | 'resume'
  | 'inject-mock'
  | 'member-stats';

export interface DigitalTwinDeps {
  homedir?: () => string;
  print?: (msg: string) => void;
  printErr?: (msg: string) => void;
  /** Override identity providers (tests pass deterministic values). */
  getUserId?: () => string;
  getMachineId?: () => string;
  /** Override liveness check so tests don't hit real PIDs. */
  isPidAlive?: (pid: number) => boolean;
  /** ulid generator (tests pass deterministic values). */
  ulid?: () => string;
  /** cwd to record in inject-mock (defaults to process.cwd()). */
  cwd?: () => string;
  /** Inject tapSession (tests pass a fake to avoid real fs deps). */
  tapSession?: typeof tapSession;
  /** Inject fetch for member-stats (tests pass a stub to avoid the network). */
  fetchFn?: typeof fetch;
}

export interface DigitalTwinResult {
  exitCode: number;
}

export class DigitalTwinArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DigitalTwinArgError';
  }
}

export interface DigitalTwinParsedArgs {
  sub: DigitalTwinSubcommand;
  token?: string;
  /** inject-mock: override cwd (default: process.cwd()). */
  cwd?: string;
  /** inject-mock: override session id (default: ulid()). */
  sessionId?: string;
  /** member-stats: central server URL (default: http://127.0.0.1:8080). */
  server?: string;
  /** member-stats: user id to query (default: this machine's configured user). */
  user?: string;
  /** member-stats: emit raw JSON instead of the human-readable summary. */
  json?: boolean;
}

export function parseDigitalTwinArgs(rest: string[]): DigitalTwinParsedArgs {
  const sub = rest[0];
  if (!sub) {
    throw new DigitalTwinArgError(
      'Usage: teamagent digital-twin <login|logout|status|pause|resume|inject-mock|member-stats> [args]',
    );
  }
  switch (sub) {
    case 'login': {
      const token = rest[1];
      if (!token) {
        throw new DigitalTwinArgError('Usage: teamagent digital-twin login <token>');
      }
      return { sub: 'login', token };
    }
    case 'logout':
    case 'status':
    case 'pause':
    case 'resume':
      return { sub };
    case 'inject-mock': {
      const result: DigitalTwinParsedArgs = { sub: 'inject-mock' };
      for (let i = 1; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === '--cwd' && rest[i + 1]) {
          result.cwd = rest[++i];
        } else if (a.startsWith('--cwd=')) {
          result.cwd = a.slice('--cwd='.length);
        } else if (a === '--session-id' && rest[i + 1]) {
          result.sessionId = rest[++i];
        } else if (a.startsWith('--session-id=')) {
          result.sessionId = a.slice('--session-id='.length);
        }
      }
      return result;
    }
    case 'member-stats': {
      const result: DigitalTwinParsedArgs = { sub: 'member-stats' };
      for (let i = 1; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === '--server' && rest[i + 1]) {
          result.server = rest[++i];
        } else if (a.startsWith('--server=')) {
          result.server = a.slice('--server='.length);
        } else if (a === '--user' && rest[i + 1]) {
          result.user = rest[++i];
        } else if (a.startsWith('--user=')) {
          result.user = a.slice('--user='.length);
        } else if (a === '--json') {
          result.json = true;
        }
      }
      return result;
    }
    default:
      throw new DigitalTwinArgError(
        `Unknown digital-twin subcommand: ${sub}. Use one of login|logout|status|pause|resume|inject-mock|member-stats.`,
      );
  }
}

function resolveDeps(deps: DigitalTwinDeps) {
  return {
    homedir: deps.homedir ?? osHomedir,
    print: deps.print ?? ((m: string) => process.stdout.write(m + '\n')),
    printErr: deps.printErr ?? ((m: string) => process.stderr.write(m + '\n')),
    getUserId: deps.getUserId,
    getMachineId: deps.getMachineId,
    isPidAlive: deps.isPidAlive,
    ulid: deps.ulid ?? defaultUlid,
    cwd: deps.cwd ?? (() => process.cwd()),
    tapSession: deps.tapSession ?? tapSession,
  };
}

export function executeDigitalTwinLogin(
  token: string,
  deps: DigitalTwinDeps = {},
): DigitalTwinResult {
  const r = resolveDeps(deps);
  const home = r.homedir();
  const paths = digitalTwinPaths(home);
  const existing = loadConfig(paths.configFile);
  let config;
  if (existing) {
    config = { ...existing, uploader: { ...existing.uploader, token } };
  } else {
    const userIdFn = r.getUserId ?? getUserId;
    const machineIdFn = r.getMachineId ?? (() => getMachineId(paths.machineIdFile));
    config = defaultConfig({
      user_id: userIdFn(),
      machine_id: machineIdFn(),
    });
    config.uploader.token = token;
  }
  saveConfig(config, paths.configFile);
  r.print(`digital-twin: token saved (endpoint: ${config.uploader.endpoint})`);
  return { exitCode: 0 };
}

export function executeDigitalTwinLogout(deps: DigitalTwinDeps = {}): DigitalTwinResult {
  const r = resolveDeps(deps);
  const home = r.homedir();
  const paths = digitalTwinPaths(home);
  const existing = loadConfig(paths.configFile);
  if (!existing) {
    r.print('digital-twin: not configured');
    return { exitCode: 0 };
  }
  const config = { ...existing, uploader: { ...existing.uploader, token: null } };
  saveConfig(config, paths.configFile);
  r.print('digital-twin: logged out');
  return { exitCode: 0 };
}

export function executeDigitalTwinPause(deps: DigitalTwinDeps = {}): DigitalTwinResult {
  const r = resolveDeps(deps);
  const home = r.homedir();
  const paths = digitalTwinPaths(home);
  const existing = loadConfig(paths.configFile);
  if (!existing) {
    r.printErr(
      'digital-twin: not configured (run `teamagent digital-twin login <token>` first)',
    );
    return { exitCode: 1 };
  }
  const config = { ...existing, uploader: { ...existing.uploader, enabled: false } };
  saveConfig(config, paths.configFile);
  r.print('digital-twin: paused');
  return { exitCode: 0 };
}

export function executeDigitalTwinResume(deps: DigitalTwinDeps = {}): DigitalTwinResult {
  const r = resolveDeps(deps);
  const home = r.homedir();
  const paths = digitalTwinPaths(home);
  const existing = loadConfig(paths.configFile);
  if (!existing) {
    r.printErr(
      'digital-twin: not configured (run `teamagent digital-twin login <token>` first)',
    );
    return { exitCode: 1 };
  }
  const config = { ...existing, uploader: { ...existing.uploader, enabled: true } };
  saveConfig(config, paths.configFile);
  r.print('digital-twin: resumed');
  return { exitCode: 0 };
}

function countDeadLetter(home: string): number {
  const paths = digitalTwinPaths(home);
  if (!existsSync(paths.deadLetterDir)) return 0;
  try {
    const names = readdirSync(paths.deadLetterDir);
    // count payload files only (so a payload+meta pair counts once)
    return names.filter((n) => n.endsWith('.payload')).length;
  } catch {
    return 0;
  }
}

export function executeDigitalTwinStatus(deps: DigitalTwinDeps = {}): DigitalTwinResult {
  const r = resolveDeps(deps);
  const home = r.homedir();
  const paths = digitalTwinPaths(home);
  const existing = loadConfig(paths.configFile);
  if (!existing) {
    r.print(
      'digital-twin: not configured (run `teamagent digital-twin login <token>`)',
    );
    return { exitCode: 0 };
  }

  const pending = listPending(home).length;
  const deadLetter = countDeadLetter(home);
  const pid = readPidFile(home);
  const aliveFn = r.isPidAlive ?? isPidAlive;

  const lines: string[] = [];
  lines.push('digital-twin status');
  lines.push(`  config:    ${paths.configFile}`);
  lines.push(`  enabled:   ${existing.uploader.enabled ? 'true' : 'false'}`);
  lines.push(`  endpoint:  ${existing.uploader.endpoint}`);
  lines.push(`  user_id:   ${existing.identity.user_id}`);
  lines.push(`  machine_id: ${existing.identity.machine_id}`);
  lines.push(`  token:     ${existing.uploader.token ? '[redacted]' : '(none)'}`);
  lines.push('  queue:');
  lines.push(`    pending:     ${pending}`);
  lines.push(`    dead-letter: ${deadLetter}`);
  lines.push('  daemon:');
  if (pid) {
    lines.push(`    pid:        ${pid.pid}`);
    lines.push(`    started_at: ${pid.start_at}`);
    lines.push(`    alive:      ${aliveFn(pid.pid) ? 'yes' : 'no'}`);
  } else {
    lines.push('    pid:        (none)');
    lines.push('    alive:      no');
  }
  // Issue #368: a broken upload pipeline must be visible. Surface the last
  // error line from the uploader daemon's captured stdout/stderr.
  const lastErr = readLastUploaderError(home);
  lines.push('  uploader log:');
  lines.push(`    path:       ${paths.uploaderLogFile}`);
  lines.push(
    `    last_error: ${lastErr ? `${lastErr.line} (line ${lastErr.lineno})` : '(none)'}`,
  );
  r.print(lines.join('\n'));
  return { exitCode: 0 };
}

/**
 * inject-mock: write a synthetic Claude Code transcript JSONL into the location
 * tapSession() expects, then call tapSession() so it lands in queue/pending/.
 * This is the end-to-end smoke test shipped with the CLI: lets the user verify
 * the local→hook→queue→daemon path without sitting through a real Claude Code
 * session.
 */
export function executeDigitalTwinInjectMock(
  parsed: DigitalTwinParsedArgs,
  deps: DigitalTwinDeps = {},
): DigitalTwinResult {
  const r = resolveDeps(deps);
  const home = r.homedir();
  const cwd = parsed.cwd ?? r.cwd();
  const sessionId = parsed.sessionId ?? r.ulid();

  const transcript = claudeTranscriptPath(home, cwd, sessionId);
  try {
    mkdirSync(dirname(transcript), { recursive: true });
    const fakeJsonl =
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'inject-mock probe' },
        sessionId,
        cwd,
        timestamp: new Date().toISOString(),
      }) +
      '\n' +
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: 'inject-mock ack' },
        sessionId,
        cwd,
        timestamp: new Date().toISOString(),
      }) +
      '\n';
    writeFileSync(transcript, fakeJsonl, 'utf-8');
  } catch (err) {
    r.printErr(
      `digital-twin inject-mock: failed to write fake transcript at ${transcript}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { exitCode: 1 };
  }

  const result: TapSessionResult = r.tapSession(
    { cwd, sessionId },
    { homedir: () => home },
  );

  if (result.status === 'tapped') {
    r.print(
      `digital-twin: injected mock transcript (session=${sessionId}) -> ${result.payloadPath ?? '(unknown)'}`,
    );
    return { exitCode: 0 };
  }
  r.printErr(
    `digital-twin inject-mock: tapSession status=${result.status}${result.error ? ` error=${result.error}` : ''}`,
  );
  return { exitCode: 1 };
}

/** Default central-server URL — matches runProdServer's default PORT=8080. */
const DEFAULT_MEMBER_STATS_SERVER = 'http://127.0.0.1:8080';

/**
 * `teamagent digital-twin member-stats` — M2 (对话上传通道) self-view. Queries
 * the central server's `GET /v1/member-stats?user=` for this member's
 * 已上传对话总量 / 最近一次上传时间 / 敏感字段被模糊化次数.
 */
export async function executeDigitalTwinMemberStats(
  parsed: DigitalTwinParsedArgs,
  deps: DigitalTwinDeps = {},
): Promise<DigitalTwinResult> {
  const r = resolveDeps(deps);
  const fetchFn = deps.fetchFn ?? fetch;
  const server = (parsed.server ?? DEFAULT_MEMBER_STATS_SERVER).replace(/\/+$/, '');
  // Default to the member's own configured identity — the spec is "查看自己的".
  const userIdFn = r.getUserId ?? getUserId;
  const user = parsed.user ?? userIdFn();
  if (!user) {
    r.printErr(
      'digital-twin member-stats: 无法确定成员身份 — 用 --user=<id> 指定，或先跑 `teamagent digital-twin login`',
    );
    return { exitCode: 1 };
  }

  const url = `${server}/v1/member-stats?user=${encodeURIComponent(user)}`;
  let resp: Awaited<ReturnType<typeof fetch>>;
  try {
    resp = await fetchFn(url);
  } catch (err) {
    r.printErr(
      `digital-twin member-stats: 无法连接到中心服务 ${server} — ${err instanceof Error ? err.message : String(err)}`,
    );
    return { exitCode: 1 };
  }
  if (!resp.ok) {
    r.printErr(`digital-twin member-stats: 中心服务返回 ${resp.status}`);
    return { exitCode: 1 };
  }

  const body = (await resp.json()) as {
    user_id?: string;
    uploaded_total?: number;
    last_upload_at?: string | null;
    redaction_count?: number;
  };
  if (parsed.json) {
    r.print(JSON.stringify(body));
    return { exitCode: 0 };
  }
  r.print(`成员 ${body.user_id ?? user} 的上传统计：`);
  r.print(`  已上传对话总量：${body.uploaded_total ?? 0}`);
  r.print(`  最近一次上传时间：${body.last_upload_at ?? '（暂无）'}`);
  r.print(`  敏感字段被模糊化次数：${body.redaction_count ?? 0}`);
  return { exitCode: 0 };
}

/** Top-level dispatcher used by bin.ts. */
export async function executeDigitalTwin(
  parsed: DigitalTwinParsedArgs,
  deps: DigitalTwinDeps = {},
): Promise<DigitalTwinResult> {
  switch (parsed.sub) {
    case 'login':
      return executeDigitalTwinLogin(parsed.token!, deps);
    case 'logout':
      return executeDigitalTwinLogout(deps);
    case 'status':
      return executeDigitalTwinStatus(deps);
    case 'pause':
      return executeDigitalTwinPause(deps);
    case 'resume':
      return executeDigitalTwinResume(deps);
    case 'inject-mock':
      return executeDigitalTwinInjectMock(parsed, deps);
    case 'member-stats':
      return executeDigitalTwinMemberStats(parsed, deps);
  }
}
