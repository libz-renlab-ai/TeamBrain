// BPP mining — real LLM extraction client.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §3.4
// (budget) + §3.5 (LLM-uncheatable counts). Plan: docs/plans/2026-05-13-bpp-poc/
// (Gap 1: real LLM mining client).
//
// Three providers:
//   - 'mock'           — deterministic stub (no network, no API key); used in
//                        tier-(a) byte-diff fixtures and unit tests.
//   - 'claudefast'     — spawns the local `claudefast` wrapper (MiniMax /
//                        Anthropic-compatible fast profile). Suitable for cheap
//                        batch mining locally; not present in CI.
//   - 'anthropic-sdk'  — direct `@anthropic-ai/sdk` messages.create. Loaded via
//                        dynamic import so this package does not hard-depend on
//                        the SDK; throws a clear error if missing.
//
// Determinism contract (mock): same input MUST produce byte-identical output
// across runs and machines. The mock derives counts and digests from a stable
// FNV-1a hash of the canonical JSON of the request.
//
// JSON-only contract: prompts (see llm-prompt-templates.ts) instruct the model
// to emit `{"candidates":[...]}` with no prose. The parser tolerates a single
// outer ```json``` fence (some models add one anyway) but rejects anything else.

import { spawn } from 'node:child_process';
import { promptForRule, promptForHabit, promptForContextMgmt } from './llm-prompt-templates.js';

export type LlmProvider = 'anthropic-sdk' | 'claudefast' | 'mock';

export interface LlmClientConfig {
  provider: LlmProvider;
  /** Model id; defaults: anthropic-sdk → 'claude-haiku-4-5', claudefast → wrapper default. */
  model?: string;
  /** Per-call USD ceiling. Cost estimate is rough — real budget tracking lives in BudgetTracker. */
  budgetUsd?: number;
  /** Anthropic API key. If omitted, anthropic-sdk falls back to `process.env.ANTHROPIC_API_KEY`. */
  apiKey?: string;
  /** Hard timeout in ms for subprocess / network calls. Default 60s. */
  timeoutMs?: number;
}

export type LlmExtractType = 'rule' | 'habit' | 'context-mgmt';

export interface LlmExtractRequest {
  sessions: Array<{
    user_id: string;
    transcript_excerpt: string;
  }>;
  extract_type: LlmExtractType;
}

export interface LlmCandidate {
  title: string;
  body: string;
  example: string;
  pattern_count: number;
  sessions_observed: number;
}

export interface LlmExtractResponse {
  candidates: LlmCandidate[];
  tokens_used: number;
  cost_usd: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';

/**
 * Extract candidates from the request using the configured provider.
 * See module-level docs for provider semantics.
 */
export async function extractCandidates(
  req: LlmExtractRequest,
  config: LlmClientConfig,
): Promise<LlmExtractResponse> {
  switch (config.provider) {
    case 'mock':
      return mockExtract(req);
    case 'claudefast':
      return claudefastExtract(req, config);
    case 'anthropic-sdk':
      return anthropicSdkExtract(req, config);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`extractCandidates: unknown provider ${exhaustive as string}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Mock provider — deterministic, no network.
// ---------------------------------------------------------------------------

function mockExtract(req: LlmExtractRequest): LlmExtractResponse {
  const digest = stableHashHex(canonicalize(req));
  // pattern_count is bounded; varies by digest but is reproducible.
  const candidateCount = req.sessions.length === 0 ? 0 : 1 + (hexNibble(digest, 0) % 2);
  const candidates: LlmCandidate[] = [];
  for (let i = 0; i < candidateCount; i++) {
    const sub = digest.slice(i * 4, i * 4 + 8);
    const lenSum = req.sessions.reduce(
      (acc, s) => acc + s.transcript_excerpt.length,
      0,
    );
    const patternCount = Math.max(1, (lenSum + i) % 7);
    candidates.push({
      title: `[mock-${req.extract_type}] candidate-${i + 1} (${sub})`,
      body: `Mock-extracted ${req.extract_type} candidate derived from ${req.sessions.length} session(s).`,
      example: req.sessions[0]?.transcript_excerpt.slice(0, 80) ?? '(no sessions)',
      pattern_count: patternCount,
      sessions_observed: req.sessions.length,
    });
  }
  return { candidates, tokens_used: 0, cost_usd: 0 };
}

// ---------------------------------------------------------------------------
// claudefast provider — spawns the local wrapper.
// ---------------------------------------------------------------------------

async function claudefastExtract(
  req: LlmExtractRequest,
  config: LlmClientConfig,
): Promise<LlmExtractResponse> {
  const prompt = buildPrompt(req);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stdout = await runSubprocess('claudefast', ['-p', prompt], timeoutMs);
  const parsed = parseModelJson(stdout);
  return {
    candidates: parsed.candidates,
    // claudefast wrapper does not surface accurate token counts; best-effort 0.
    tokens_used: 0,
    cost_usd: 0,
  };
}

function runSubprocess(
  cmd: string,
  args: ReadonlyArray<string>,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`runSubprocess: ${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`runSubprocess: failed to spawn ${cmd}: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `runSubprocess: ${cmd} exited with code ${code}. stderr: ${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
}

// ---------------------------------------------------------------------------
// anthropic-sdk provider — dynamic import to avoid hard dep on digital-twin.
// ---------------------------------------------------------------------------

async function anthropicSdkExtract(
  req: LlmExtractRequest,
  config: LlmClientConfig,
): Promise<LlmExtractResponse> {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'anthropicSdkExtract: no API key provided (config.apiKey or env ANTHROPIC_API_KEY)',
    );
  }
  let Anthropic: unknown;
  try {
    // Use indirect specifier so tsc does not attempt static resolution; the
    // SDK is an optional peer (lives in `@teamagent/adapters` only).
    const specifier = '@anthropic-ai/sdk';
    const mod = (await import(/* @vite-ignore */ specifier)) as {
      default: unknown;
    } & Record<string, unknown>;
    Anthropic = mod.default ?? mod;
  } catch (err) {
    throw new Error(
      '@anthropic-ai/sdk is not installed in this package. ' +
        'Add it to packages/digital-twin/package.json or use provider=mock / claudefast. ' +
        `Underlying error: ${(err as Error).message}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor: any = Anthropic;
  const client = new Ctor({ apiKey });
  const prompt = buildPrompt(req);
  const model = config.model ?? DEFAULT_ANTHROPIC_MODEL;

  const resp = await client.messages.create({
    model,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  // resp.content is an array of content blocks; we want the first text block.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = Array.isArray(resp?.content) ? resp.content : [];
  const text = blocks.find((b) => b?.type === 'text')?.text ?? '';
  const parsed = parseModelJson(text);

  const inputTokens: number = Number(resp?.usage?.input_tokens ?? 0);
  const outputTokens: number = Number(resp?.usage?.output_tokens ?? 0);
  const tokensUsed = inputTokens + outputTokens;
  // Rough Anthropic Haiku-class pricing (placeholder; real cost lives upstream).
  // $0.25 / 1M input + $1.25 / 1M output. This is a hint, not a billing source.
  const costUsd = (inputTokens * 0.25 + outputTokens * 1.25) / 1_000_000;

  return { candidates: parsed.candidates, tokens_used: tokensUsed, cost_usd: costUsd };
}

// ---------------------------------------------------------------------------
// Prompt selection + JSON parsing helpers.
// ---------------------------------------------------------------------------

function buildPrompt(req: LlmExtractRequest): string {
  switch (req.extract_type) {
    case 'rule':
      return promptForRule(req.sessions);
    case 'habit':
      return promptForHabit(req.sessions);
    case 'context-mgmt':
      return promptForContextMgmt(req.sessions);
    default: {
      const exhaustive: never = req.extract_type;
      throw new Error(`buildPrompt: unknown extract_type ${exhaustive as string}`);
    }
  }
}

/**
 * Strip a single optional ```json ... ``` fence and parse. Validates the
 * `{candidates: [...]}` shape and coerces numeric fields.
 */
export function parseModelJson(raw: string): { candidates: LlmCandidate[] } {
  let body = raw.trim();
  // Tolerate one outer markdown fence even though the prompt forbids it.
  const fenceMatch = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) body = fenceMatch[1]!.trim();

  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch (err) {
    throw new Error(
      `parseModelJson: invalid JSON from model. First 200 chars: ${body.slice(0, 200)}. ` +
        `Error: ${(err as Error).message}`,
    );
  }

  if (!obj || typeof obj !== 'object' || !Array.isArray((obj as { candidates?: unknown }).candidates)) {
    throw new Error(
      `parseModelJson: expected {"candidates": [...]} object, got: ${JSON.stringify(obj).slice(0, 200)}`,
    );
  }

  const rawCandidates = (obj as { candidates: unknown[] }).candidates;
  const candidates: LlmCandidate[] = rawCandidates.map((c, i) => {
    if (!c || typeof c !== 'object') {
      throw new Error(`parseModelJson: candidate[${i}] is not an object`);
    }
    const r = c as Record<string, unknown>;
    return {
      title: String(r.title ?? ''),
      body: String(r.body ?? ''),
      example: String(r.example ?? ''),
      pattern_count: toInt(r.pattern_count, i, 'pattern_count'),
      sessions_observed: toInt(r.sessions_observed, i, 'sessions_observed'),
    };
  });
  return { candidates };
}

function toInt(v: unknown, idx: number, field: string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`parseModelJson: candidate[${idx}].${field} is not numeric: ${String(v)}`);
  }
  return Math.trunc(n);
}

// ---------------------------------------------------------------------------
// Determinism helpers.
// ---------------------------------------------------------------------------

/** Canonical JSON: sorted keys, no whitespace — same input → same string. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') +
    '}'
  );
}

/** 32-bit FNV-1a → hex. Stable, fast, no crypto deps. */
function stableHashHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Repeat hash through a few rounds to widen output to 32 hex chars (128 bits).
  let out = '';
  let cur = h;
  for (let round = 0; round < 4; round++) {
    cur = Math.imul(cur ^ (round * 0x9e3779b1), 0x01000193) >>> 0;
    out += cur.toString(16).padStart(8, '0');
  }
  return out;
}

function hexNibble(hex: string, idx: number): number {
  return parseInt(hex.charAt(idx), 16);
}
