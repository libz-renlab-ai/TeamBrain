import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  LinearIssueTrackerClient,
  SymphonyOrchestrator,
  WorkspaceManager,
  parseSymphonyArgs,
  parseWorkflowMarkdown,
  renderPrompt,
  resolveSymphonyConfig,
  sanitizeWorkspaceKey,
  sortIssuesForDispatch,
  type AgentRunner,
  type IssueTrackerClient,
  type SymphonyConfig,
  type SymphonyIssue,
  type WorkflowDefinition,
} from "../commands/symphony.js";

const issue = (overrides: Partial<SymphonyIssue> = {}): SymphonyIssue => ({
  id: "id-1",
  identifier: "MT-1",
  title: "Build the thing",
  description: "Details",
  priority: 2,
  state: "Todo",
  branch_name: null,
  url: "https://linear.test/MT-1",
  labels: ["agent"],
  blocked_by: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  ...overrides,
});

function workflow(config: Record<string, unknown> = {}, prompt = "Work on {{ issue.identifier }} attempt={{ attempt }}"): WorkflowDefinition {
  return {
    path: path.join(os.tmpdir(), "WORKFLOW.md"),
    dir: os.tmpdir(),
    config,
    prompt_template: prompt,
    mtimeMs: 1,
  };
}

function config(overrides: Partial<SymphonyConfig> = {}): SymphonyConfig {
  return {
    workflowPath: path.join(os.tmpdir(), "WORKFLOW.md"),
    workflowDir: os.tmpdir(),
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "secret",
      projectSlug: "proj",
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done", "Canceled", "Closed"],
    },
    polling: { intervalMs: 30_000 },
    workspace: { root: fs.mkdtempSync(path.join(os.tmpdir(), "symphony-workspaces-")) },
    hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 },
    agent: { maxConcurrentAgents: 2, maxTurns: 2, maxRetryBackoffMs: 30_000, maxConcurrentAgentsByState: {} },
    codex: {
      command: "codex app-server",
      approvalPolicy: null,
      threadSandbox: null,
      turnSandboxPolicy: null,
      turnTimeoutMs: 1000,
      readTimeoutMs: 1000,
      stallTimeoutMs: 300_000,
    },
    ...overrides,
  };
}

describe("Symphony workflow/config", () => {
  it("parses WORKFLOW.md front matter and applies spec defaults", () => {
    const parsed = parseWorkflowMarkdown(`---
tracker:
  kind: linear
  api_key: "$LINEAR_API_KEY"
  project_slug: "my-project"
workspace:
  root: ./agent-work
agent:
  max_concurrent_agents_by_state:
    Todo: 1
    Broken: 0
hooks:
  after_create: |
    echo created > marker.txt
---
Ship {{ issue.identifier }}: {{ issue.title }}
`);
    const wf = workflow(parsed.config, parsed.prompt_template);
    const resolved = resolveSymphonyConfig(wf, { LINEAR_API_KEY: "tok" });
    expect(resolved.tracker.apiKey).toBe("tok");
    expect(resolved.tracker.endpoint).toBe("https://api.linear.app/graphql");
    expect(resolved.tracker.activeStates).toEqual(["Todo", "In Progress"]);
    expect(resolved.workspace.root).toBe(path.join(os.tmpdir(), "agent-work"));
    expect(resolved.agent.maxConcurrentAgentsByState).toEqual({ todo: 1 });
    expect(resolved.hooks.afterCreate).toContain("marker.txt");
  });

  it("renders prompts strictly and fails on unknown variables/filters", () => {
    const sample = issue({ labels: ["one", "two"] });
    expect(renderPrompt("{{ issue.identifier }}{% for label in issue.labels %}:{{ label }}{% endfor %}", { issue: sample })).toBe("MT-1:one:two");
    expect(() => renderPrompt("{{ issue.missing }}", { issue: sample })).toThrow(/unknown template variable/);
    expect(() => renderPrompt("{{ issue.title | upcase }}", { issue: sample })).toThrow(/unknown filter/);
  });

  it("parses CLI workflow path, once, and port", () => {
    expect(parseSymphonyArgs(["./WORKFLOW.md", "--once", "--port=0"])).toEqual({
      workflowPath: "./WORKFLOW.md",
      once: true,
      port: 0,
    });
  });
});

describe("Symphony workspace safety", () => {
  it("sanitizes issue identifiers and runs hooks in the per-issue workspace", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "symphony-hook-"));
    const cfg = config({
      workspace: { root },
      hooks: {
        afterCreate: "pwd > pwd.txt",
        beforeRun: "echo before > before.txt",
        afterRun: "echo after > after.txt",
        beforeRemove: "echo remove > remove.txt",
        timeoutMs: 1000,
      },
    });
    const manager = new WorkspaceManager(cfg, silentLogger());
    const created = await manager.createForIssue("MT/../42");
    expect(created.workspace_key).toBe("MT_.._42");
    expect(created.path.startsWith(root)).toBe(true);
    expect(fs.realpathSync(fs.readFileSync(path.join(created.path, "pwd.txt"), "utf8").trim())).toBe(fs.realpathSync(created.path));
    await manager.beforeRun(created.path);
    await manager.afterRun(created.path);
    expect(fs.existsSync(path.join(created.path, "before.txt"))).toBe(true);
    expect(fs.existsSync(path.join(created.path, "after.txt"))).toBe(true);
    await manager.removeForIssue("MT/../42");
    expect(fs.existsSync(created.path)).toBe(false);
  });

  it("uses deterministic workspace keys", () => {
    expect(sanitizeWorkspaceKey("ABC-123")).toBe("ABC-123");
    expect(sanitizeWorkspaceKey("ABC/123 with space")).toBe("ABC_123_with_space");
  });
});

describe("LinearIssueTrackerClient", () => {
  it("uses Linear slugId filtering and normalizes labels/blockers", async () => {
    const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { query: string; variables: Record<string, unknown> };
      calls.push(body);
      return new Response(JSON.stringify({
        data: {
          issues: {
            nodes: [{
              id: "linear-id",
              identifier: "MT-9",
              title: "Linear issue",
              description: null,
              priority: 1,
              branchName: "branch",
              url: null,
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-02T00:00:00Z",
              state: { name: "Todo" },
              labels: { nodes: [{ name: "Bug" }] },
              inverseRelations: { nodes: [{ type: "blocks", issue: { id: "b", identifier: "MT-8", state: { name: "Done" } } }] },
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }));
    }) as unknown as typeof fetch;
    const client = new LinearIssueTrackerClient(config(), fetchImpl);
    const issues = await client.fetchCandidateIssues();
    expect(calls[0]?.query).toContain("slugId");
    expect(calls[0]?.variables).toMatchObject({ projectSlug: "proj", activeStates: ["Todo", "In Progress"] });
    expect(issues[0]).toMatchObject({
      id: "linear-id",
      labels: ["bug"],
      blocked_by: [{ id: "b", identifier: "MT-8", state: "Done" }],
    });
  });
});

describe("SymphonyOrchestrator", () => {
  it("sorts by priority, created time, then identifier", () => {
    expect(
      sortIssuesForDispatch([
        issue({ identifier: "C", priority: null }),
        issue({ identifier: "B", priority: 1, created_at: "2026-01-02T00:00:00Z" }),
        issue({ identifier: "A", priority: 1, created_at: "2026-01-01T00:00:00Z" }),
      ]).map((i) => i.identifier),
    ).toEqual(["A", "B", "C"]);
  });

  it("does not dispatch Todo issues with non-terminal blockers", () => {
    const orch = makeOrchestrator([issue({ blocked_by: [{ id: "b", identifier: "B", state: "Todo" }] })]);
    expect(orch.shouldDispatch(issue({ blocked_by: [{ id: "b", identifier: "B", state: "Todo" }] }))).toBe(false);
    expect(orch.shouldDispatch(issue({ blocked_by: [{ id: "b", identifier: "B", state: "Done" }] }))).toBe(true);
  });

  it("claims and dispatches eligible issues, then schedules continuation retry on success", async () => {
    const timers: Array<() => void> = [];
    const orch = makeOrchestrator([issue()], {
      setTimer: (fn) => {
        timers.push(fn);
        return 1 as unknown as NodeJS.Timeout;
      },
    });
    await orch.tick();
    expect(orch.running.has("id-1") || orch.retryAttempts.has("id-1")).toBe(true);
    await waitUntil(() => orch.retryAttempts.has("id-1"));
    expect(orch.retryAttempts.get("id-1")).toMatchObject({ attempt: 1, error: null });
    expect(orch.claimed.has("id-1")).toBe(true);
    expect(timers.length).toBe(1);
  });

  it("reconciles terminal state by canceling the runner and removing the workspace", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "symphony-reconcile-"));
    const runner = fakeRunner(new Promise(() => undefined));
    const tracker = fakeTracker([issue()], [issue({ state: "Done" })]);
    const orch = makeOrchestrator([issue()], {
      cfg: config({ workspace: { root } }),
      tracker,
      runner,
    });
    await orch.tick();
    const workspace = path.join(root, "MT-1");
    await waitUntil(() => fs.existsSync(workspace));
    expect(fs.existsSync(workspace)).toBe(true);
    await orch.tick();
    expect(runner.cancel).toHaveBeenCalledWith("id-1", "terminal_state");
    expect(fs.existsSync(workspace)).toBe(false);
  });
});

function makeOrchestrator(
  candidates: SymphonyIssue[],
  opts: {
    cfg?: SymphonyConfig;
    tracker?: IssueTrackerClient;
    runner?: AgentRunner;
    setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  } = {},
): SymphonyOrchestrator {
  const cfg = opts.cfg ?? config();
  return new SymphonyOrchestrator({
    workflow: workflow(),
    config: cfg,
    tracker: opts.tracker ?? fakeTracker(candidates),
    runner: opts.runner ?? fakeRunner(Promise.resolve()),
    logger: silentLogger(),
    now: () => Date.parse("2026-05-12T00:00:00Z"),
    setTimer: opts.setTimer ?? (() => 1 as unknown as NodeJS.Timeout),
    clearTimer: () => undefined,
  });
}

function fakeTracker(candidates: SymphonyIssue[], states = candidates): IssueTrackerClient {
  return {
    fetchCandidateIssues: vi.fn(async () => candidates),
    fetchIssuesByStates: vi.fn(async () => []),
    fetchIssueStatesByIds: vi.fn(async () => states),
  };
}

function fakeRunner(blocker: Promise<unknown>): AgentRunner & { cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn();
  return {
    cancel,
    run: vi.fn(async (ctx) => {
      await blocker;
      ctx.onEvent({ event: "session_started", timestamp: "2026-05-12T00:00:00Z", thread_id: "t", turn_id: "u" });
      return { status: "succeeded" as const, turnCount: 1 };
    }),
  };
}

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (predicate()) return;
    await flush();
  }
  throw new Error("condition not met");
}
