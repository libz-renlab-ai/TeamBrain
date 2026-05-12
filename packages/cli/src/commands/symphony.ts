import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

type JsonObject = Record<string, unknown>;

export interface SymphonyIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branch_name: string | null;
  url: string | null;
  labels: string[];
  blocked_by: Array<{ id: string | null; identifier: string | null; state: string | null }>;
  created_at: string | null;
  updated_at: string | null;
}

export interface WorkflowDefinition {
  path: string;
  dir: string;
  config: JsonObject;
  prompt_template: string;
  mtimeMs: number;
}

export interface SymphonyConfig {
  workflowPath: string;
  workflowDir: string;
  tracker: {
    kind: "linear";
    endpoint: string;
    apiKey: string;
    projectSlug: string;
    activeStates: string[];
    terminalStates: string[];
  };
  polling: { intervalMs: number };
  workspace: { root: string };
  hooks: {
    afterCreate: string | null;
    beforeRun: string | null;
    afterRun: string | null;
    beforeRemove: string | null;
    timeoutMs: number;
  };
  agent: {
    maxConcurrentAgents: number;
    maxTurns: number;
    maxRetryBackoffMs: number;
    maxConcurrentAgentsByState: Record<string, number>;
  };
  codex: {
    command: string;
    approvalPolicy: unknown | null;
    threadSandbox: unknown | null;
    turnSandboxPolicy: unknown | null;
    turnTimeoutMs: number;
    readTimeoutMs: number;
    stallTimeoutMs: number;
  };
}

export class SymphonyError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "SymphonyError";
  }
}

export class SymphonyArgError extends Error {}

export interface SymphonyCliOptions {
  workflowPath?: string;
  once?: boolean;
  port?: number;
  host?: string;
}

export function parseSymphonyArgs(argv: string[]): SymphonyCliOptions {
  const opts: SymphonyCliOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--once") opts.once = true;
    else if (arg === "--port") opts.port = parsePort(argv[++i], "--port");
    else if (arg.startsWith("--port=")) opts.port = parsePort(arg.slice("--port=".length), "--port");
    else if (arg === "--host") opts.host = readFlag(argv, ++i, "--host");
    else if (arg.startsWith("--host=")) opts.host = arg.slice("--host=".length);
    else if (arg.startsWith("--")) throw new SymphonyArgError(`symphony: unknown flag "${arg}"`);
    else if (!opts.workflowPath) opts.workflowPath = arg;
    else throw new SymphonyArgError(`symphony: unexpected argument "${arg}"`);
  }
  return opts;
}

function parsePort(value: string | undefined, flag: string): number {
  const raw = value ?? "";
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65_535) {
    throw new SymphonyArgError(`symphony: ${flag} must be an integer between 0 and 65535`);
  }
  return n;
}

function readFlag(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new SymphonyArgError(`symphony: ${flag} requires a value`);
  return value;
}

export function renderSymphonyHelp(): string {
  return [
    "Usage: teamagent symphony [path-to-WORKFLOW.md] [--once] [--port <port>] [--host 127.0.0.1]",
    "",
    "Runs the Symphony issue-orchestration service: WORKFLOW.md -> Linear issues ->",
    "per-issue workspaces -> Codex app-server agent sessions.",
    "",
    "Options:",
    "  --once            Run one poll/reconcile tick, then exit",
    "  --port PORT       Enable the optional HTTP status API/dashboard",
    "  --host HOST       Bind host for --port (default 127.0.0.1)",
    "",
  ].join("\n");
}

export function selectWorkflowPath(explicitPath: string | undefined, cwd = process.cwd()): string {
  return path.resolve(cwd, explicitPath ?? "WORKFLOW.md");
}

export async function loadWorkflow(explicitPath?: string, cwd = process.cwd()): Promise<WorkflowDefinition> {
  const workflowPath = selectWorkflowPath(explicitPath, cwd);
  let stat: fs.Stats;
  let raw: string;
  try {
    stat = await fsp.stat(workflowPath);
    raw = await fsp.readFile(workflowPath, "utf8");
  } catch {
    throw new SymphonyError("missing_workflow_file", `WORKFLOW.md not found: ${workflowPath}`);
  }
  if (!stat.isFile()) {
    throw new SymphonyError("missing_workflow_file", `workflow path is not a file: ${workflowPath}`);
  }
  const parsed = parseWorkflowMarkdown(raw);
  return {
    path: workflowPath,
    dir: path.dirname(workflowPath),
    config: parsed.config,
    prompt_template: parsed.prompt_template,
    mtimeMs: stat.mtimeMs,
  };
}

export function parseWorkflowMarkdown(raw: string): { config: JsonObject; prompt_template: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { config: {}, prompt_template: normalized.trim() };
  }
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) throw new SymphonyError("workflow_parse_error", "workflow front matter is missing closing ---");
  const after = normalized.slice(end + 1);
  const markerEnd = after.indexOf("\n");
  const body = markerEnd >= 0 ? after.slice(markerEnd + 1) : "";
  const yamlText = normalized.slice(4, end);
  const config = parseYamlObject(yamlText);
  if (!isPlainObject(config)) {
    throw new SymphonyError("workflow_front_matter_not_a_map", "workflow front matter must decode to a map/object");
  }
  return { config, prompt_template: body.trim() };
}

function parseYamlObject(text: string): unknown {
  const lines = text.replace(/\t/g, "  ").split("\n");
  const root: JsonObject = {};
  const stack: Array<{ indent: number; value: JsonObject | unknown[]; key?: string }> = [{ indent: -1, value: root }];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^ */)?.[0].length ?? 0;
    const trimmed = raw.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) stack.pop();
    const parent = stack[stack.length - 1]!.value;

    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(parent)) throw new SymphonyError("workflow_parse_error", `unexpected list item: ${trimmed}`);
      parent.push(parseYamlScalar(trimmed.slice(2).trim()));
      continue;
    }

    const sep = trimmed.indexOf(":");
    if (sep < 0) throw new SymphonyError("workflow_parse_error", `invalid yaml line: ${trimmed}`);
    const key = trimmed.slice(0, sep).trim();
    const rest = trimmed.slice(sep + 1).trim();
    if (!key) throw new SymphonyError("workflow_parse_error", `invalid yaml key: ${trimmed}`);
    if (!isPlainObject(parent)) throw new SymphonyError("workflow_parse_error", `cannot assign key under list: ${key}`);

    if (rest === "|" || rest === ">") {
      const blockIndent = findNextIndent(lines, i + 1, indent);
      const block: string[] = [];
      for (i = i + 1; i < lines.length; i++) {
        const nextRaw = lines[i]!;
        const nextIndent = nextRaw.match(/^ */)?.[0].length ?? 0;
        if (nextRaw.trim() && nextIndent < blockIndent) {
          i--;
          break;
        }
        block.push(nextRaw.slice(Math.min(blockIndent, nextRaw.length)));
      }
      parent[key] = rest === ">" ? block.join(" ").trimEnd() : block.join("\n").trimEnd();
      continue;
    }

    if (rest) {
      parent[key] = parseYamlScalar(rest);
      continue;
    }

    const next = nextMeaningfulLine(lines, i + 1);
    const child: JsonObject | unknown[] = next?.trimmed.startsWith("- ") ? [] : {};
    parent[key] = child;
    stack.push({ indent, value: child, key });
  }
  return root;
}

function findNextIndent(lines: string[], start: number, fallback: number): number {
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim()) return raw.match(/^ */)?.[0].length ?? fallback + 2;
  }
  return fallback + 2;
}

function nextMeaningfulLine(lines: string[], start: number): { trimmed: string } | null {
  for (let i = start; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed && !trimmed.startsWith("#")) return { trimmed };
  }
  return null;
}

function parseYamlScalar(raw: string): unknown {
  if (raw === "null" || raw === "~") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return splitInline(inner).map((v) => parseYamlScalar(v.trim()));
  }
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    const inner = raw.slice(1, -1);
    return raw.startsWith('"') ? inner.replace(/\\"/g, '"').replace(/\\n/g, "\n") : inner.replace(/''/g, "'");
  }
  return raw.replace(/\s+#.*$/, "");
}

function splitInline(inner: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (const ch of inner) {
    if ((ch === '"' || ch === "'") && !quote) quote = ch;
    else if (ch === quote) quote = null;
    if (ch === "," && !quote) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out;
}

export function resolveSymphonyConfig(
  workflow: WorkflowDefinition,
  env: Record<string, string | undefined> = process.env,
): SymphonyConfig {
  const cfg = workflow.config;
  const tracker = getObject(cfg, "tracker");
  const polling = getObject(cfg, "polling");
  const workspace = getObject(cfg, "workspace");
  const hooks = getObject(cfg, "hooks");
  const agent = getObject(cfg, "agent");
  const codex = getObject(cfg, "codex");

  const trackerKind = getString(tracker, "kind", "");
  if (trackerKind !== "linear") {
    throw new SymphonyError("unsupported_tracker_kind", trackerKind ? `unsupported tracker.kind: ${trackerKind}` : "tracker.kind is required");
  }
  const apiKeyRaw = getString(tracker, "api_key", "$LINEAR_API_KEY");
  const apiKey = resolveEnvRef(apiKeyRaw, env);
  const projectSlug = getString(tracker, "project_slug", "");
  const codexCommand = getString(codex, "command", "codex app-server");
  const activeStates = getStringList(tracker, "active_states", ["Todo", "In Progress"]);
  const terminalStates = getStringList(tracker, "terminal_states", ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"]);

  const workspaceRootRaw = getString(workspace, "root", path.join(os.tmpdir(), "symphony_workspaces"));
  const workspaceRoot = resolvePathValue(workspaceRootRaw, workflow.dir, env);

  return {
    workflowPath: workflow.path,
    workflowDir: workflow.dir,
    tracker: {
      kind: "linear",
      endpoint: getString(tracker, "endpoint", "https://api.linear.app/graphql"),
      apiKey,
      projectSlug,
      activeStates,
      terminalStates,
    },
    polling: { intervalMs: positiveInteger(getValue(polling, "interval_ms"), 30_000, "polling.interval_ms") },
    workspace: { root: workspaceRoot },
    hooks: {
      afterCreate: nullableString(hooks, "after_create"),
      beforeRun: nullableString(hooks, "before_run"),
      afterRun: nullableString(hooks, "after_run"),
      beforeRemove: nullableString(hooks, "before_remove"),
      timeoutMs: positiveInteger(getValue(hooks, "timeout_ms"), 60_000, "hooks.timeout_ms"),
    },
    agent: {
      maxConcurrentAgents: positiveInteger(getValue(agent, "max_concurrent_agents"), 10, "agent.max_concurrent_agents"),
      maxTurns: positiveInteger(getValue(agent, "max_turns"), 20, "agent.max_turns"),
      maxRetryBackoffMs: positiveInteger(getValue(agent, "max_retry_backoff_ms"), 300_000, "agent.max_retry_backoff_ms"),
      maxConcurrentAgentsByState: parseStateLimits(getObject(agent, "max_concurrent_agents_by_state")),
    },
    codex: {
      command: codexCommand,
      approvalPolicy: getValue(codex, "approval_policy") ?? null,
      threadSandbox: getValue(codex, "thread_sandbox") ?? null,
      turnSandboxPolicy: getValue(codex, "turn_sandbox_policy") ?? null,
      turnTimeoutMs: positiveInteger(getValue(codex, "turn_timeout_ms"), 3_600_000, "codex.turn_timeout_ms"),
      readTimeoutMs: positiveInteger(getValue(codex, "read_timeout_ms"), 5_000, "codex.read_timeout_ms"),
      stallTimeoutMs: integer(getValue(codex, "stall_timeout_ms"), 300_000, "codex.stall_timeout_ms"),
    },
  };
}

export function validateDispatchConfig(config: SymphonyConfig): void {
  if (!config.tracker.apiKey) throw new SymphonyError("missing_tracker_api_key", "tracker.api_key is required");
  if (!config.tracker.projectSlug) throw new SymphonyError("missing_tracker_project_slug", "tracker.project_slug is required");
  if (!config.codex.command.trim()) throw new SymphonyError("missing_codex_command", "codex.command is required");
}

function getObject(parent: JsonObject, key: string): JsonObject {
  const value = parent[key];
  return isPlainObject(value) ? value : {};
}

function getValue(parent: JsonObject, key: string): unknown {
  return parent[key];
}

function getString(parent: JsonObject, key: string, fallback: string): string {
  const value = parent[key];
  return typeof value === "string" ? value : fallback;
}

function nullableString(parent: JsonObject, key: string): string | null {
  const value = parent[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getStringList(parent: JsonObject, key: string, fallback: string[]): string[] {
  const value = parent[key];
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : fallback;
}

function positiveInteger(value: unknown, fallback: number, field: string): number {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new SymphonyError("workflow_parse_error", `${field} must be a positive integer`);
  return n;
}

function integer(value: unknown, fallback: number, field: string): number {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new SymphonyError("workflow_parse_error", `${field} must be an integer`);
  return n;
}

function parseStateLimits(value: JsonObject): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [state, raw] of Object.entries(value)) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) out[state.toLowerCase()] = n;
  }
  return out;
}

function resolveEnvRef(value: string, env: Record<string, string | undefined>): string {
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return env[value.slice(1)] ?? "";
  return value;
}

function resolvePathValue(value: string, baseDir: string, env: Record<string, string | undefined>): string {
  let resolved = value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => env[name] ?? "");
  if (resolved === "~" || resolved.startsWith("~/")) {
    resolved = path.join(os.homedir(), resolved.slice(2));
  }
  if (!path.isAbsolute(resolved)) resolved = path.resolve(baseDir, resolved);
  return path.normalize(resolved);
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function renderPrompt(template: string, input: { issue: SymphonyIssue; attempt?: number | null }): string {
  const base = template.trim() || "You are working on an issue from Linear.";
  return renderTemplate(base, { issue: input.issue, attempt: input.attempt ?? null }).trim();
}

function renderTemplate(template: string, context: JsonObject): string {
  let rendered = template;
  const forRe = /{%\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([A-Za-z0-9_.]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g;
  rendered = rendered.replace(forRe, (_match, local: string, source: string, body: string) => {
    const value = resolveTemplatePath(context, source);
    if (!Array.isArray(value)) throw new SymphonyError("template_render_error", `${source} is not iterable`);
    return value.map((item) => renderTemplate(body, { ...context, [local]: item as unknown })).join("");
  });
  if (/{%/.test(rendered)) throw new SymphonyError("template_parse_error", "unsupported template tag");
  return rendered.replace(/{{\s*([^}]+?)\s*}}/g, (_match, expr: string) => {
    if (expr.includes("|")) throw new SymphonyError("template_parse_error", `unknown filter in ${expr.trim()}`);
    const value = resolveTemplatePath(context, expr.trim());
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
}

function resolveTemplatePath(context: JsonObject, expr: string): unknown {
  const parts = expr.split(".");
  let current: unknown = context;
  for (const part of parts) {
    if (!part) throw new SymphonyError("template_render_error", `invalid template path: ${expr}`);
    if (isPlainObject(current) && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      throw new SymphonyError("template_render_error", `unknown template variable: ${expr}`);
    }
  }
  return current;
}

export interface WorkspaceInfo {
  path: string;
  workspace_key: string;
  created_now: boolean;
}

export class WorkspaceManager {
  constructor(
    private config: SymphonyConfig,
    private logger: SymphonyLogger = new StderrSymphonyLogger(),
  ) {}

  workspaceForIdentifier(identifier: string): WorkspaceInfo {
    const root = path.resolve(this.config.workspace.root);
    const workspace_key = sanitizeWorkspaceKey(identifier);
    const workspacePath = path.resolve(root, workspace_key);
    assertInsideRoot(root, workspacePath);
    return { path: workspacePath, workspace_key, created_now: false };
  }

  async createForIssue(identifier: string): Promise<WorkspaceInfo> {
    const info = this.workspaceForIdentifier(identifier);
    let created = false;
    try {
      const stat = await fsp.stat(info.path).catch(() => null);
      if (stat && !stat.isDirectory()) {
        throw new SymphonyError("workspace_path_not_directory", `workspace path exists but is not a directory: ${info.path}`);
      }
      if (!stat) {
        await fsp.mkdir(info.path, { recursive: true });
        created = true;
      }
      const result = { ...info, created_now: created };
      if (created) await this.runHook("after_create", this.config.hooks.afterCreate, result.path, true);
      return result;
    } catch (err) {
      throw err instanceof SymphonyError ? err : new SymphonyError("workspace_create_failed", String(err));
    }
  }

  async beforeRun(workspacePath: string): Promise<void> {
    await this.runHook("before_run", this.config.hooks.beforeRun, workspacePath, true);
  }

  async afterRun(workspacePath: string): Promise<void> {
    await this.runHook("after_run", this.config.hooks.afterRun, workspacePath, false);
  }

  async removeForIssue(identifier: string): Promise<void> {
    const info = this.workspaceForIdentifier(identifier);
    if (!fs.existsSync(info.path)) return;
    await this.runHook("before_remove", this.config.hooks.beforeRemove, info.path, false);
    await fsp.rm(info.path, { recursive: true, force: true });
  }

  private async runHook(name: string, script: string | null, cwd: string, fatal: boolean): Promise<void> {
    if (!script) return;
    this.logger.info("hook_start", { hook: name, cwd });
    try {
      await runShell(script, cwd, this.config.hooks.timeoutMs);
      this.logger.info("hook_completed", { hook: name, cwd });
    } catch (err) {
      this.logger.error("hook_failed", { hook: name, cwd, error: err instanceof Error ? err.message : String(err) });
      if (fatal) throw new SymphonyError("workspace_hook_failed", `${name} hook failed`);
    }
  }
}

export function sanitizeWorkspaceKey(identifier: string): string {
  const sanitized = identifier.replace(/[^A-Za-z0-9._-]/g, "_");
  return sanitized || "_";
}

function assertInsideRoot(root: string, candidate: string): void {
  const rel = path.relative(root, candidate);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return;
  throw new SymphonyError("invalid_workspace_path", `workspace path escapes root: ${candidate}`);
}

function runShell(script: string, cwd: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-lc", script], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`hook timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8").slice(0, 4000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `hook exited with code ${code}`));
    });
  });
}

export interface IssueTrackerClient {
  fetchCandidateIssues(): Promise<SymphonyIssue[]>;
  fetchIssuesByStates(stateNames: string[]): Promise<SymphonyIssue[]>;
  fetchIssueStatesByIds(issueIds: string[]): Promise<SymphonyIssue[]>;
}

export class LinearIssueTrackerClient implements IssueTrackerClient {
  constructor(
    private config: SymphonyConfig,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchCandidateIssues(): Promise<SymphonyIssue[]> {
    return this.paginatedIssues(CANDIDATE_QUERY, {
      projectSlug: this.config.tracker.projectSlug,
      activeStates: this.config.tracker.activeStates,
    });
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<SymphonyIssue[]> {
    if (stateNames.length === 0) return [];
    return this.paginatedIssues(CANDIDATE_QUERY, {
      projectSlug: this.config.tracker.projectSlug,
      activeStates: stateNames,
    });
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<SymphonyIssue[]> {
    if (issueIds.length === 0) return [];
    const response = await this.graphql(STATE_BY_IDS_QUERY, { ids: issueIds });
    const nodes = readIssueNodes(response);
    return nodes.map(normalizeLinearIssue);
  }

  async linearGraphql(query: string, variables: JsonObject = {}): Promise<{ success: boolean; body?: unknown; error?: string }> {
    if (!query.trim()) return { success: false, error: "query must be non-empty" };
    if (countGraphqlOperations(query) !== 1) return { success: false, error: "query must contain exactly one GraphQL operation" };
    try {
      const body = await this.graphql(query, variables);
      return { success: !Array.isArray((body as JsonObject).errors), body };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async paginatedIssues(query: string, variables: JsonObject): Promise<SymphonyIssue[]> {
    const out: SymphonyIssue[] = [];
    let after: string | null = null;
    for (;;) {
      const response = await this.graphql(query, { ...variables, after });
      const page = readIssueConnection(response);
      out.push(...page.nodes.map(normalizeLinearIssue));
      if (!page.hasNextPage) break;
      if (!page.endCursor) throw new SymphonyError("linear_missing_end_cursor", "Linear pagination indicated next page but omitted endCursor");
      after = page.endCursor;
    }
    return out;
  }

  private async graphql(query: string, variables: JsonObject): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await this.fetchImpl(this.config.tracker.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: this.config.tracker.apiKey,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (!res.ok) throw new SymphonyError("linear_api_status", `Linear API returned HTTP ${res.status}`);
      const body = await res.json() as JsonObject;
      if (Array.isArray(body.errors)) throw new SymphonyError("linear_graphql_errors", "Linear GraphQL returned errors");
      return body;
    } catch (err) {
      if (err instanceof SymphonyError) throw err;
      throw new SymphonyError("linear_api_request", err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }
}

const ISSUE_FIELDS = `
nodes {
  id
  identifier
  title
  description
  priority
  branchName
  url
  createdAt
  updatedAt
  state { name }
  labels { nodes { name } }
  inverseRelations { nodes { type issue { id identifier state { name } } } }
}
pageInfo { hasNextPage endCursor }
`;

const CANDIDATE_QUERY = `
query SymphonyCandidateIssues($projectSlug: String!, $activeStates: [String!], $after: String) {
  issues(first: 50, after: $after, filter: { project: { slugId: { eq: $projectSlug } }, state: { name: { in: $activeStates } } }) {
    ${ISSUE_FIELDS}
  }
}`;

const STATE_BY_IDS_QUERY = `
query SymphonyIssueStates($ids: [ID!]) {
  issues(first: 50, filter: { id: { in: $ids } }) {
    ${ISSUE_FIELDS}
  }
}`;

function readIssueConnection(body: unknown): { nodes: unknown[]; hasNextPage: boolean; endCursor: string | null } {
  const issues = ((body as JsonObject).data as JsonObject | undefined)?.issues as JsonObject | undefined;
  if (!issues || !Array.isArray(issues.nodes)) throw new SymphonyError("linear_unknown_payload", "Linear payload missing data.issues.nodes");
  const pageInfo = isPlainObject(issues.pageInfo) ? issues.pageInfo : {};
  return {
    nodes: issues.nodes,
    hasNextPage: Boolean(pageInfo.hasNextPage),
    endCursor: typeof pageInfo.endCursor === "string" ? pageInfo.endCursor : null,
  };
}

function readIssueNodes(body: unknown): unknown[] {
  return readIssueConnection(body).nodes;
}

function normalizeLinearIssue(raw: unknown): SymphonyIssue {
  if (!isPlainObject(raw)) throw new SymphonyError("linear_unknown_payload", "issue node is not an object");
  const state = isPlainObject(raw.state) && typeof raw.state.name === "string" ? raw.state.name : "";
  return {
    id: stringField(raw, "id"),
    identifier: stringField(raw, "identifier"),
    title: stringField(raw, "title"),
    description: typeof raw.description === "string" ? raw.description : null,
    priority: Number.isInteger(raw.priority) ? raw.priority as number : null,
    state,
    branch_name: typeof raw.branchName === "string" ? raw.branchName : null,
    url: typeof raw.url === "string" ? raw.url : null,
    labels: normalizeLabels(raw.labels),
    blocked_by: normalizeBlockers(raw.inverseRelations),
    created_at: typeof raw.createdAt === "string" ? raw.createdAt : null,
    updated_at: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

function stringField(raw: JsonObject, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : "";
}

function normalizeLabels(value: unknown): string[] {
  const nodes = isPlainObject(value) && Array.isArray(value.nodes) ? value.nodes : [];
  return nodes
    .map((node) => (isPlainObject(node) && typeof node.name === "string" ? node.name.toLowerCase() : null))
    .filter((v): v is string => Boolean(v));
}

function normalizeBlockers(value: unknown): SymphonyIssue["blocked_by"] {
  const nodes = isPlainObject(value) && Array.isArray(value.nodes) ? value.nodes : [];
  return nodes.flatMap((node) => {
    if (!isPlainObject(node) || node.type !== "blocks" || !isPlainObject(node.issue)) return [];
    const issue = node.issue;
    return [{
      id: typeof issue.id === "string" ? issue.id : null,
      identifier: typeof issue.identifier === "string" ? issue.identifier : null,
      state: isPlainObject(issue.state) && typeof issue.state.name === "string" ? issue.state.name : null,
    }];
  });
}

function countGraphqlOperations(query: string): number {
  const stripped = query.replace(/#[^\n]*/g, " ");
  const matches = stripped.match(/\b(query|mutation|subscription)\b/g);
  return matches?.length ?? 0;
}

export interface SymphonyLogger {
  info(event: string, fields?: JsonObject): void;
  warn(event: string, fields?: JsonObject): void;
  error(event: string, fields?: JsonObject): void;
}

export class StderrSymphonyLogger implements SymphonyLogger {
  info(event: string, fields: JsonObject = {}): void {
    process.stderr.write(formatLog("info", event, fields) + "\n");
  }
  warn(event: string, fields: JsonObject = {}): void {
    process.stderr.write(formatLog("warn", event, fields) + "\n");
  }
  error(event: string, fields: JsonObject = {}): void {
    process.stderr.write(formatLog("error", event, fields) + "\n");
  }
}

function formatLog(level: string, event: string, fields: JsonObject): string {
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  return [`level=${level}`, `event=${event}`, ...pairs].join(" ");
}

export interface AgentEvent {
  event: string;
  timestamp: string;
  codex_app_server_pid?: string | null;
  usage?: JsonObject;
  message?: string;
  thread_id?: string;
  turn_id?: string;
  rate_limits?: unknown;
}

export interface AgentRunContext {
  issue: SymphonyIssue;
  attempt: number | null;
  config: SymphonyConfig;
  workflow: WorkflowDefinition;
  workspacePath: string;
  onEvent(event: AgentEvent): void;
  shouldContinue(): Promise<SymphonyIssue | null>;
}

export interface AgentRunResult {
  status: "succeeded" | "failed" | "timed_out" | "stalled" | "canceled";
  error?: string;
  turnCount: number;
}

export interface AgentRunner {
  run(context: AgentRunContext): Promise<AgentRunResult>;
  cancel?(issueId: string, reason: string): void;
}

export class CodexAppServerAgentRunner implements AgentRunner {
  private processes = new Map<string, ChildProcessWithoutNullStreams>();

  cancel(issueId: string): void {
    this.processes.get(issueId)?.kill("SIGTERM");
  }

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const root = path.resolve(context.config.workspace.root);
    const cwd = path.resolve(context.workspacePath);
    assertInsideRoot(root, cwd);
    const child = spawn("bash", ["-lc", context.config.codex.command], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.processes.set(context.issue.id, child);
    const client = new JsonRpcLineClient(child, context.config.codex.readTimeoutMs);
    let threadId = "";
    let turnCount = 0;
    try {
      await client.request("initialize", {
        clientInfo: { name: "teamagent-symphony", title: "TeamAgent Symphony", version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });
      const thread = await client.request("thread/start", {
        cwd,
        approvalPolicy: context.config.codex.approvalPolicy,
        sandbox: context.config.codex.threadSandbox,
        serviceName: "teamagent-symphony",
        threadSource: "user",
        ephemeral: false,
      }) as JsonObject;
      threadId = ((thread.thread as JsonObject | undefined)?.id as string | undefined) ?? "";
      if (!threadId) throw new SymphonyError("response_error", "thread/start response missing thread.id");

      while (turnCount < context.config.agent.maxTurns) {
        const prompt = turnCount === 0
          ? renderPrompt(context.workflow.prompt_template, { issue: context.issue, attempt: context.attempt })
          : continuationPrompt(context.issue, turnCount + 1, context.config.agent.maxTurns);
        const response = await client.request("turn/start", {
          threadId,
          cwd,
          input: [{ type: "text", text: prompt }],
          approvalPolicy: context.config.codex.approvalPolicy,
          sandboxPolicy: context.config.codex.turnSandboxPolicy,
        }) as JsonObject;
        const turn = response.turn as JsonObject | undefined;
        const turnId = typeof turn?.id === "string" ? turn.id : "";
        if (!turnId) throw new SymphonyError("response_error", "turn/start response missing turn.id");
        turnCount++;
        context.onEvent({
          event: "session_started",
          timestamp: new Date().toISOString(),
          codex_app_server_pid: String(child.pid ?? ""),
          thread_id: threadId,
          turn_id: turnId,
        });
        await client.waitForTurnCompletion(threadId, turnId, context.config.codex.turnTimeoutMs, (event) => {
          context.onEvent(event);
        });
        const refreshed = await context.shouldContinue();
        if (!refreshed) break;
        context.issue = refreshed;
      }
      return { status: "succeeded", turnCount };
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : String(err), turnCount };
    } finally {
      child.kill("SIGTERM");
      this.processes.delete(context.issue.id);
    }
  }
}

function continuationPrompt(issue: SymphonyIssue, turn: number, maxTurns: number): string {
  return [
    `Continue working on ${issue.identifier}: ${issue.title}.`,
    `This is continuation turn ${turn}/${maxTurns}; do not repeat the full original prompt.`,
    "Check the tracker state with the available workflow tools and move the issue toward the workflow-defined handoff.",
  ].join("\n");
}

class JsonRpcLineClient {
  private nextId = 1;
  private buffer = "";
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();
  private notifications: JsonObject[] = [];
  private waiters: Array<() => void> = [];

  constructor(
    private child: ChildProcessWithoutNullStreams,
    private readTimeoutMs: number,
  ) {
    child.stdout.on("data", (chunk: Buffer) => this.onData(chunk.toString("utf8")));
    child.on("error", (err) => this.rejectAll(err));
    child.on("exit", (code) => this.rejectAll(new Error(`codex app-server exited with code ${code}`)));
  }

  request(method: string, params: JsonObject): Promise<unknown> {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params }) + "\n";
    this.child.stdin.write(payload);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new SymphonyError("response_timeout", `${method} timed out after ${this.readTimeoutMs}ms`));
      }, this.readTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  async waitForTurnCompletion(
    threadId: string,
    turnId: string,
    timeoutMs: number,
    onEvent: (event: AgentEvent) => void,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const foundIndex = this.notifications.findIndex((n) => n.method === "turn/completed" && isPlainObject(n.params));
      if (foundIndex >= 0) {
        const notification = this.notifications.splice(foundIndex, 1)[0]!;
        const params = notification.params as JsonObject;
        const turn = params.turn as JsonObject | undefined;
        const status = typeof turn?.status === "string" ? turn.status : "completed";
        onEvent({
          event: status === "completed" ? "turn_completed" : `turn_${status}`,
          timestamp: new Date().toISOString(),
          thread_id: typeof params.threadId === "string" ? params.threadId : threadId,
          turn_id: typeof turn?.id === "string" ? turn.id : turnId,
        });
        if (status === "completed") return;
        throw new SymphonyError("turn_failed", `turn ended with status ${status}`);
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new SymphonyError("turn_timeout", `turn timed out after ${timeoutMs}ms`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(remaining, 100));
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  private onData(data: string): void {
    this.buffer += data;
    for (;;) {
      const idx = this.buffer.indexOf("\n");
      if (idx < 0) return;
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: JsonObject;
      try {
        msg = JSON.parse(line) as JsonObject;
      } catch {
        this.notifications.push({ method: "malformed", params: { line: line.slice(0, 200) } });
        this.notify();
        continue;
      }
      if (typeof msg.id === "number" && this.pending.has(msg.id)) {
        const pending = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        clearTimeout(pending.timer);
        if (isPlainObject(msg.error)) pending.reject(new Error(JSON.stringify(msg.error)));
        else pending.resolve(msg.result);
      } else if (typeof msg.method === "string") {
        this.notifications.push(msg);
        this.notify();
      }
    }
  }

  private notify(): void {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter();
  }

  private rejectAll(err: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(err);
    }
  }
}

interface RunningEntry {
  issue: SymphonyIssue;
  identifier: string;
  startedAtMs: number;
  lastCodexTimestampMs: number | null;
  sessionId: string | null;
  lastCodexEvent: string | null;
  lastCodexMessage: string | null;
  turnCount: number;
  retryAttempt: number | null;
  tokens: { input_tokens: number; output_tokens: number; total_tokens: number };
  lastReportedTokens: { input_tokens: number; output_tokens: number; total_tokens: number };
}

interface RetryEntry {
  issue_id: string;
  identifier: string;
  attempt: number;
  due_at_ms: number;
  error: string | null;
  timer_handle?: NodeJS.Timeout;
}

export interface SymphonySnapshot {
  generated_at: string;
  counts: { running: number; retrying: number };
  running: Array<JsonObject>;
  retrying: Array<JsonObject>;
  codex_totals: { input_tokens: number; output_tokens: number; total_tokens: number; seconds_running: number };
  rate_limits: unknown;
}

export interface SymphonyOrchestratorDeps {
  workflow: WorkflowDefinition;
  config: SymphonyConfig;
  tracker: IssueTrackerClient;
  runner: AgentRunner;
  logger?: SymphonyLogger;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
}

export class SymphonyOrchestrator {
  readonly running = new Map<string, RunningEntry>();
  readonly claimed = new Set<string>();
  readonly retryAttempts = new Map<string, RetryEntry>();
  readonly completed = new Set<string>();
  codexTotals = { input_tokens: 0, output_tokens: 0, total_tokens: 0, seconds_running: 0 };
  codexRateLimits: unknown = null;
  private logger: SymphonyLogger;
  private now: () => number;
  private setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  private clearTimer: (timer: NodeJS.Timeout) => void;

  constructor(private deps: SymphonyOrchestratorDeps) {
    this.logger = deps.logger ?? new StderrSymphonyLogger();
    this.now = deps.now ?? (() => Date.now());
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((timer) => clearTimeout(timer));
  }

  async startupCleanup(): Promise<void> {
    const workspace = new WorkspaceManager(this.deps.config, this.logger);
    try {
      const terminal = await this.deps.tracker.fetchIssuesByStates(this.deps.config.tracker.terminalStates);
      for (const issue of terminal) await workspace.removeForIssue(issue.identifier);
    } catch (err) {
      this.logger.warn("startup_cleanup_failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  async tick(): Promise<void> {
    await this.reconcileRunningIssues();
    try {
      validateDispatchConfig(this.deps.config);
    } catch (err) {
      this.logger.error("dispatch_validation_failed", { error: err instanceof Error ? err.message : String(err) });
      return;
    }
    let issues: SymphonyIssue[];
    try {
      issues = await this.deps.tracker.fetchCandidateIssues();
    } catch (err) {
      this.logger.error("candidate_fetch_failed", { error: err instanceof Error ? err.message : String(err) });
      return;
    }
    for (const issue of sortIssuesForDispatch(issues)) {
      if (this.availableSlots() <= 0) break;
      if (this.shouldDispatch(issue)) this.dispatchIssue(issue, null);
    }
  }

  shouldDispatch(issue: SymphonyIssue): boolean {
    if (!issue.id || !issue.identifier || !issue.title || !issue.state) return false;
    if (!stateIn(issue.state, this.deps.config.tracker.activeStates)) return false;
    if (stateIn(issue.state, this.deps.config.tracker.terminalStates)) return false;
    if (this.running.has(issue.id) || this.claimed.has(issue.id)) return false;
    if (this.availableSlots() <= 0) return false;
    if (!this.hasStateSlot(issue.state)) return false;
    if (issue.state.toLowerCase() === "todo") {
      return !issue.blocked_by.some((b) => b.state && !stateIn(b.state, this.deps.config.tracker.terminalStates));
    }
    return true;
  }

  dispatchIssue(issue: SymphonyIssue, attempt: number | null): void {
    this.claimed.add(issue.id);
    const entry: RunningEntry = {
      issue,
      identifier: issue.identifier,
      startedAtMs: this.now(),
      lastCodexTimestampMs: null,
      sessionId: null,
      lastCodexEvent: null,
      lastCodexMessage: null,
      turnCount: 0,
      retryAttempt: attempt,
      tokens: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      lastReportedTokens: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    };
    this.running.set(issue.id, entry);
    const existingRetry = this.retryAttempts.get(issue.id);
    if (existingRetry?.timer_handle) this.clearTimer(existingRetry.timer_handle);
    this.retryAttempts.delete(issue.id);
    void this.runWorker(issue, attempt);
  }

  snapshot(): SymphonySnapshot {
    const now = this.now();
    const activeSeconds = [...this.running.values()].reduce((sum, r) => sum + Math.max(0, now - r.startedAtMs) / 1000, 0);
    return {
      generated_at: new Date(now).toISOString(),
      counts: { running: this.running.size, retrying: this.retryAttempts.size },
      running: [...this.running.entries()].map(([issueId, r]) => ({
        issue_id: issueId,
        issue_identifier: r.identifier,
        state: r.issue.state,
        session_id: r.sessionId,
        turn_count: r.turnCount,
        last_event: r.lastCodexEvent,
        last_message: r.lastCodexMessage,
        started_at: new Date(r.startedAtMs).toISOString(),
        last_event_at: r.lastCodexTimestampMs ? new Date(r.lastCodexTimestampMs).toISOString() : null,
        tokens: r.tokens,
      })),
      retrying: [...this.retryAttempts.values()].map((r) => ({
        issue_id: r.issue_id,
        issue_identifier: r.identifier,
        attempt: r.attempt,
        due_at: new Date(r.due_at_ms).toISOString(),
        error: r.error,
      })),
      codex_totals: { ...this.codexTotals, seconds_running: this.codexTotals.seconds_running + activeSeconds },
      rate_limits: this.codexRateLimits,
    };
  }

  async refreshNow(): Promise<void> {
    await this.tick();
  }

  private async runWorker(issue: SymphonyIssue, attempt: number | null): Promise<void> {
    const workspace = new WorkspaceManager(this.deps.config, this.logger);
    let workspacePath = "";
    try {
      const info = await workspace.createForIssue(issue.identifier);
      workspacePath = info.path;
      await workspace.beforeRun(workspacePath);
      const result = await this.deps.runner.run({
        issue,
        attempt,
        config: this.deps.config,
        workflow: this.deps.workflow,
        workspacePath,
        onEvent: (event) => this.onAgentEvent(issue.id, event),
        shouldContinue: async () => {
          const [refreshed] = await this.deps.tracker.fetchIssueStatesByIds([issue.id]);
          if (!refreshed || !stateIn(refreshed.state, this.deps.config.tracker.activeStates)) return null;
          return refreshed;
        },
      });
      await workspace.afterRun(workspacePath);
      this.onWorkerExit(issue.id, result.status === "succeeded" ? "normal" : result.status, result.error);
    } catch (err) {
      if (workspacePath) await workspace.afterRun(workspacePath);
      this.onWorkerExit(issue.id, "failed", err instanceof Error ? err.message : String(err));
    }
  }

  private onAgentEvent(issueId: string, event: AgentEvent): void {
    const running = this.running.get(issueId);
    if (!running) return;
    const at = Date.parse(event.timestamp);
    running.lastCodexTimestampMs = Number.isFinite(at) ? at : this.now();
    running.lastCodexEvent = event.event;
    running.lastCodexMessage = event.message ?? running.lastCodexMessage;
    if (event.thread_id && event.turn_id) running.sessionId = `${event.thread_id}-${event.turn_id}`;
    if (event.event === "session_started") running.turnCount += 1;
    if (event.rate_limits) this.codexRateLimits = event.rate_limits;
    const tokens = extractTokenUsage(event.usage);
    if (tokens) {
      running.tokens = tokens;
      this.codexTotals.input_tokens += Math.max(0, tokens.input_tokens - running.lastReportedTokens.input_tokens);
      this.codexTotals.output_tokens += Math.max(0, tokens.output_tokens - running.lastReportedTokens.output_tokens);
      this.codexTotals.total_tokens += Math.max(0, tokens.total_tokens - running.lastReportedTokens.total_tokens);
      running.lastReportedTokens = tokens;
    }
  }

  private onWorkerExit(issueId: string, reason: string, error?: string): void {
    const running = this.running.get(issueId);
    if (!running) return;
    this.running.delete(issueId);
    this.codexTotals.seconds_running += Math.max(0, this.now() - running.startedAtMs) / 1000;
    if (reason === "normal") {
      this.completed.add(issueId);
      this.scheduleRetry(issueId, running.identifier, 1, null, true);
    } else {
      this.scheduleRetry(issueId, running.identifier, (running.retryAttempt ?? 0) + 1, error ?? reason, false);
    }
  }

  private scheduleRetry(issueId: string, identifier: string, attempt: number, error: string | null, continuation: boolean): void {
    const delay = continuation ? 1000 : Math.min(10_000 * 2 ** Math.max(attempt - 1, 0), this.deps.config.agent.maxRetryBackoffMs);
    const entry: RetryEntry = {
      issue_id: issueId,
      identifier,
      attempt,
      due_at_ms: this.now() + delay,
      error,
    };
    entry.timer_handle = this.setTimer(() => void this.onRetryTimer(issueId), delay);
    this.retryAttempts.set(issueId, entry);
    this.claimed.add(issueId);
    this.logger.info("retry_scheduled", { issue_id: issueId, issue_identifier: identifier, attempt, delay_ms: delay, error });
  }

  private async onRetryTimer(issueId: string): Promise<void> {
    const entry = this.retryAttempts.get(issueId);
    if (!entry) return;
    this.retryAttempts.delete(issueId);
    let candidates: SymphonyIssue[];
    try {
      candidates = await this.deps.tracker.fetchCandidateIssues();
    } catch {
      this.scheduleRetry(issueId, entry.identifier, entry.attempt + 1, "retry poll failed", false);
      return;
    }
    const issue = candidates.find((i) => i.id === issueId);
    if (!issue) {
      this.claimed.delete(issueId);
      return;
    }
    this.claimed.delete(issueId);
    if (this.availableSlots() === 0) {
      this.claimed.add(issueId);
      this.scheduleRetry(issueId, issue.identifier, entry.attempt + 1, "no available orchestrator slots", false);
      return;
    }
    if (this.shouldDispatch(issue)) this.dispatchIssue(issue, entry.attempt);
  }

  private async reconcileRunningIssues(): Promise<void> {
    if (this.deps.config.codex.stallTimeoutMs > 0) {
      for (const [issueId, running] of this.running.entries()) {
        const anchor = running.lastCodexTimestampMs ?? running.startedAtMs;
        if (this.now() - anchor > this.deps.config.codex.stallTimeoutMs) {
          this.deps.runner.cancel?.(issueId, "stalled");
          this.onWorkerExit(issueId, "stalled", "stalled session");
        }
      }
    }
    const ids = [...this.running.keys()];
    if (ids.length === 0) return;
    let refreshed: SymphonyIssue[];
    try {
      refreshed = await this.deps.tracker.fetchIssueStatesByIds(ids);
    } catch {
      this.logger.warn("state_refresh_failed", {});
      return;
    }
    const workspace = new WorkspaceManager(this.deps.config, this.logger);
    for (const issue of refreshed) {
      const running = this.running.get(issue.id);
      if (!running) continue;
      if (stateIn(issue.state, this.deps.config.tracker.terminalStates)) {
        this.terminateRunningIssue(issue.id, "terminal_state");
        await workspace.removeForIssue(issue.identifier);
      } else if (stateIn(issue.state, this.deps.config.tracker.activeStates)) {
        running.issue = issue;
      } else {
        this.terminateRunningIssue(issue.id, "non_active_state");
      }
    }
  }

  private terminateRunningIssue(issueId: string, reason: string): void {
    const running = this.running.get(issueId);
    if (!running) return;
    this.deps.runner.cancel?.(issueId, reason);
    this.running.delete(issueId);
    this.claimed.delete(issueId);
    this.codexTotals.seconds_running += Math.max(0, this.now() - running.startedAtMs) / 1000;
    this.logger.info("run_terminated", { issue_id: issueId, issue_identifier: running.identifier, reason });
  }

  private availableSlots(): number {
    return Math.max(this.deps.config.agent.maxConcurrentAgents - this.running.size, 0);
  }

  private hasStateSlot(state: string): boolean {
    const key = state.toLowerCase();
    const limit = this.deps.config.agent.maxConcurrentAgentsByState[key] ?? this.deps.config.agent.maxConcurrentAgents;
    const count = [...this.running.values()].filter((r) => r.issue.state.toLowerCase() === key).length;
    return count < limit;
  }
}

function stateIn(state: string, states: string[]): boolean {
  const normalized = state.toLowerCase();
  return states.some((s) => s.toLowerCase() === normalized);
}

export function sortIssuesForDispatch(issues: SymphonyIssue[]): SymphonyIssue[] {
  return [...issues].sort((a, b) => {
    const ap = a.priority ?? Number.POSITIVE_INFINITY;
    const bp = b.priority ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    const ac = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
    const bc = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
    if (ac !== bc) return ac - bc;
    return a.identifier.localeCompare(b.identifier);
  });
}

function extractTokenUsage(usage: JsonObject | undefined): RunningEntry["tokens"] | null {
  if (!usage) return null;
  const input = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
  const output = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
  const total = Number(usage.total_tokens ?? usage.totalTokens ?? input + output);
  return {
    input_tokens: Number.isFinite(input) ? input : 0,
    output_tokens: Number.isFinite(output) ? output : 0,
    total_tokens: Number.isFinite(total) ? total : 0,
  };
}

export async function executeSymphony(options: SymphonyCliOptions, cwd = process.cwd()): Promise<{ output: string; exitCode: number }> {
  const workflow = await loadWorkflow(options.workflowPath, cwd);
  const config = resolveSymphonyConfig(workflow);
  validateDispatchConfig(config);
  const orchestrator = new SymphonyOrchestrator({
    workflow,
    config,
    tracker: new LinearIssueTrackerClient(config),
    runner: new CodexAppServerAgentRunner(),
  });
  await orchestrator.startupCleanup();

  const portFromWorkflow = getServerPort(workflow.config);
  const port = options.port ?? portFromWorkflow;
  let server: http.Server | null = null;
  if (port !== null && port !== undefined) {
    server = await startSymphonyHttpServer(orchestrator, {
      host: options.host ?? "127.0.0.1",
      port,
    });
  }

  await orchestrator.tick();
  if (options.once) {
    server?.close();
    return { output: `Symphony tick completed. running=${orchestrator.running.size} retrying=${orchestrator.retryAttempts.size}\n`, exitCode: 0 };
  }

  const interval = setInterval(() => void orchestrator.tick(), config.polling.intervalMs);
  await new Promise<void>((resolve) => {
    const stop = () => {
      clearInterval(interval);
      server?.close();
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  return { output: "Symphony stopped.\n", exitCode: 0 };
}

function getServerPort(config: JsonObject): number | null {
  const server = getObject(config, "server");
  const port = server.port;
  return Number.isInteger(port) && (port as number) >= 0 && (port as number) <= 65_535 ? port as number : null;
}

export function startSymphonyHttpServer(
  orchestrator: SymphonyOrchestrator,
  opts: { host: string; port: number },
): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    void handleHttp(orchestrator, req, res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => resolve(server));
  });
}

async function handleHttp(orchestrator: SymphonyOrchestrator, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/") {
    const snapshot = orchestrator.snapshot();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderDashboardHtml(snapshot));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/v1/state") {
    writeJson(res, 200, orchestrator.snapshot());
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/v1/refresh") {
    await orchestrator.refreshNow();
    writeJson(res, 202, {
      queued: true,
      coalesced: false,
      requested_at: new Date().toISOString(),
      operations: ["poll", "reconcile"],
    });
    return;
  }
  if (url.pathname.startsWith("/api/v1/")) {
    const identifier = decodeURIComponent(url.pathname.slice("/api/v1/".length));
    const snapshot = orchestrator.snapshot();
    const running = snapshot.running.find((r) => r.issue_identifier === identifier);
    const retry = snapshot.retrying.find((r) => r.issue_identifier === identifier);
    if (!running && !retry) {
      writeJson(res, 404, { error: { code: "issue_not_found", message: `Issue ${identifier} is not tracked` } });
      return;
    }
    writeJson(res, 200, {
      issue_identifier: identifier,
      issue_id: (running?.issue_id ?? retry?.issue_id) as string,
      status: running ? "running" : "retrying",
      running: running ?? null,
      retry: retry ?? null,
    });
    return;
  }
  writeJson(res, 404, { error: { code: "not_found", message: "not found" } });
}

function writeJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function renderDashboardHtml(snapshot: SymphonySnapshot): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Symphony</title><style>
body{font-family:ui-sans-serif,system-ui;margin:32px;color:#111827;background:#f8fafc}
table{border-collapse:collapse;width:100%;background:white}td,th{border:1px solid #e5e7eb;padding:8px;text-align:left}code{background:#eef2ff;padding:2px 4px}
</style></head>
<body><h1>Symphony</h1><p>running=${snapshot.counts.running} retrying=${snapshot.counts.retrying}</p>
<h2>Running</h2><table><tr><th>Issue</th><th>State</th><th>Session</th><th>Last event</th></tr>
${snapshot.running.map((r) => `<tr><td>${escapeHtml(String(r.issue_identifier))}</td><td>${escapeHtml(String(r.state))}</td><td><code>${escapeHtml(String(r.session_id ?? ""))}</code></td><td>${escapeHtml(String(r.last_event ?? ""))}</td></tr>`).join("")}
</table><h2>Retrying</h2><pre>${escapeHtml(JSON.stringify(snapshot.retrying, null, 2))}</pre></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
