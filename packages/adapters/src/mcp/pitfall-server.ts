/**
 * Minimal stdio MCP server stub exposing check_pitfall(query) tool.
 *
 * Implements the JSON-RPC 2.0 over stdio transport manually (no SDK dependency)
 * so the file runs with tsx without requiring @modelcontextprotocol/sdk in the
 * adapters package's own node_modules.
 *
 * Rules are loaded from:
 *   1. TEAMAGENT_MCP_RULES_FILE env var  →  path to a JSON fixture array
 *   2. <TEAMAGENT_CWD>/.teamagent/knowledge.db  →  live SQLite (keyword query)
 *   3. Falls back to empty rule set
 *
 * Run:  tsx packages/adapters/src/mcp/pitfall-server.ts
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { findTeamagentRoot } from "../util/find-teamagent-root.js";

interface RuleRecord {
  id: string;
  trigger: string;
  wrong_pattern: string;
  correct_pattern: string;
  reasoning: string;
  category?: string;
  tags?: string[];
  confidence?: number;
}

function loadFixtureRules(filePath: string): RuleRecord[] {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("fixture must be a JSON array");
  return raw as RuleRecord[];
}

function loadDbRules(dbPath: string): RuleRecord[] {
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
  const db = new DatabaseSync(dbPath);
  const rows = db
    .prepare(
      "SELECT id, trigger, wrong_pattern, correct_pattern, reasoning, category, tags, confidence FROM knowledge WHERE status != 'archived'",
    )
    .all() as unknown as RuleRecord[];
  db.close();
  return rows.map((r) => ({
    ...r,
    tags: typeof r.tags === "string" ? (JSON.parse(r.tags || "[]") as string[]) : (r.tags ?? []),
  }));
}

function loadRules(): RuleRecord[] {
  const fixtureFile = process.env["TEAMAGENT_MCP_RULES_FILE"];
  if (fixtureFile) return loadFixtureRules(fixtureFile);
  // Walk up so `claude` invoked from a project subfolder still finds the
  // project's knowledge.db (issue #161).
  const cwd = process.env["TEAMAGENT_CWD"] ?? process.cwd();
  const root = findTeamagentRoot(cwd);
  const dbPath = path.join(root, ".teamagent", "knowledge.db");
  if (fs.existsSync(dbPath)) return loadDbRules(dbPath);
  return [];
}

function checkPitfall(query: string, rules: RuleRecord[]): RuleRecord[] {
  const kw = query.toLowerCase();
  return rules.filter(
    (r) =>
      r.trigger.toLowerCase().includes(kw) ||
      (r.wrong_pattern ?? "").toLowerCase().includes(kw) ||
      (r.correct_pattern ?? "").toLowerCase().includes(kw) ||
      r.reasoning.toLowerCase().includes(kw) ||
      (r.tags ?? []).some((t) => t.toLowerCase().includes(kw)),
  );
}

function send(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function makeError(id: number | null, code: number, message: string): object {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

const TOOL_DEF = {
  name: "check_pitfall",
  description: "Query TeamAgent rules for pitfalls matching a keyword",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "keyword to search for in pitfall rules" },
    },
    required: ["query"],
  },
};

const CAPABILITIES_RESPONSE = {
  protocolVersion: "2024-11-05",
  capabilities: { tools: {} },
  serverInfo: { name: "teamagent-pitfall", version: "0.1.0" },
};

async function main(): Promise<void> {
  const rules = loadRules();

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on("line", (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg: { jsonrpc: string; id?: number; method?: string; params?: unknown };
    try {
      msg = JSON.parse(trimmed) as typeof msg;
    } catch {
      send(makeError(null, -32700, "Parse error"));
      return;
    }

    const id = msg.id ?? null;
    const method = msg.method ?? "";

    // Notifications (no id) — just ack silently
    if (msg.id === undefined) return;

    switch (method) {
      case "initialize":
        send({ jsonrpc: "2.0", id, result: CAPABILITIES_RESPONSE });
        break;

      case "tools/list":
        send({ jsonrpc: "2.0", id, result: { tools: [TOOL_DEF] } });
        break;

      case "tools/call": {
        const params = msg.params as { name?: string; arguments?: { query?: string } };
        if (params?.name !== "check_pitfall") {
          send(makeError(id as number, -32601, `Unknown tool: ${params?.name}`));
          return;
        }
        const query = params?.arguments?.query ?? "";
        const hits = checkPitfall(query, rules);
        const payload = {
          query,
          hit_count: hits.length,
          hits: hits.map((h) => ({
            id: h.id,
            trigger: h.trigger,
            wrong_pattern: h.wrong_pattern,
            correct_pattern: h.correct_pattern,
            reasoning: h.reasoning,
            confidence: h.confidence ?? 1.0,
          })),
        };
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          },
        });
        break;
      }

      default:
        send(makeError(id as number, -32601, `Method not found: ${method}`));
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`pitfall-server error: ${String(err)}\n`);
  process.exit(1);
});
