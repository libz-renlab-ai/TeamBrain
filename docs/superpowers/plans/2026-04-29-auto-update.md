# Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现从 GitHub release 分支全自动更新的端到端能力（含分发渠道切换、向量模型预热、SessionStart 后台 updater、失败回滚、用户控制命令）。

**Architecture:** 分发渠道切换为 `npm install -g github:libz-renlab-ai/TeamBrain#release`（CI 维护 release 分支）。SessionStart hook 主进程 detached spawn updater 子进程，updater 调 GitHub API 比对 sha → 不同则 npm install + migrate-auto + 备份/回滚。状态写 `~/.teamagent/update-state.json`。

**Tech Stack:** Node 22 / TypeScript / pnpm monorepo / tsup / vitest / GitHub Actions / npm 全局安装

**Spec:** `docs/superpowers/specs/2026-04-29-auto-update-design.md`

---

## File Map

**Create:**
- `.github/workflows/release-branch.yml` — CI 维护 release 分支
- `packages/core/src/update/update-state.ts` — UpdateState 类型 + 读写纯函数
- `packages/core/src/update/should-check.ts` — 节流决策纯函数
- `packages/core/src/update/__tests__/update-state.test.ts`
- `packages/core/src/update/__tests__/should-check.test.ts`
- `packages/cli/src/commands/warmup.ts`
- `packages/cli/src/commands/update.ts` — update 命令组（check/now/status/disable/enable/rollback/logs）
- `packages/cli/src/commands/migrate-auto.ts`
- `packages/cli/src/github-api.ts` — fetchRemoteSha (Node https)
- `packages/cli/src/updater-logic.ts` — updater 主流程纯函数（注入 IO）
- `packages/cli/src/bin-updater.ts` — updater bin entry
- `packages/cli/src/__tests__/warmup.test.ts`
- `packages/cli/src/__tests__/update.test.ts`
- `packages/cli/src/__tests__/migrate-auto.test.ts`
- `packages/cli/src/__tests__/github-api.test.ts`
- `packages/cli/src/__tests__/updater-logic.test.ts`

**Modify:**
- `packages/core/src/index.ts` — 导出 update-state / should-check
- `packages/cli/src/bin.ts` — 注册 warmup/update/migrate-auto 命令
- `packages/cli/src/commands/init.ts` — 末尾调用 warmup（默认开，--skip-warmup 关）
- `packages/cli/src/commands/doctor.ts` — --fix 调用 warmup
- `packages/cli/src/session-start-logic.ts` — 加 spawnUpdater + maybeShowPendingBanner
- `packages/cli/src/bin-session-start.ts` — 接入 updater
- `packages/cli/tsup.hook.config.ts` — 加 bin-updater entry
- `packages/teamagent/postinstall.mjs` — 调用 warmup + 写 update-state.json
- `README.md` — 安装命令切到 GitHub URL + 自动更新章节

---

## Conventions

- TDD：每个新 unit 先写失败测试 → 最小实现 → 绿 → commit
- core 包不允许 import `fs` / `child_process` / `https`：所有 IO 通过参数注入
- 全部新代码遵循 Functional Core / Imperative Shell
- AttributionBus 只在归因事件需要时使用（暂不引入新事件类型，事件先用 stderr/log）
- commit message 格式：`feat(auto-update): <...>` / `fix(auto-update): <...>` / `refactor(auto-update): <...>`

---

## Task 1: CI workflow — release 分支自动维护

**Files:**
- Create: `.github/workflows/release-branch.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: Publish release branch
on:
  push:
    branches: [main]
permissions:
  contents: write
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter teamagent build
      - name: Stage release artifacts
        run: |
          rm -rf /tmp/release-stage
          mkdir -p /tmp/release-stage
          cp -r packages/teamagent/dist /tmp/release-stage/dist
          cp packages/teamagent/package.json /tmp/release-stage/package.json
          cp packages/teamagent/postinstall.mjs /tmp/release-stage/postinstall.mjs
          printf '{"sha":"%s","built_at":"%s"}\n' \
            "$GITHUB_SHA" "$(date -u +%FT%TZ)" \
            > /tmp/release-stage/release-meta.json
      - name: Force-push release branch
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cd /tmp/release-stage
          git init -q -b release
          git config user.name "TeamAgent Release Bot"
          git config user.email "bot@teamagent.local"
          git add -A
          git commit -q -m "release: $GITHUB_SHA"
          git push -q --force \
            "https://x-access-token:${GH_TOKEN}@github.com/${{ github.repository }}.git" \
            release
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release-branch.yml
git commit -m "feat(auto-update): release 分支 CI workflow"
```

---

## Task 2: UpdateState 类型 + 读写纯函数

**Files:**
- Create: `packages/core/src/update/update-state.ts`
- Create: `packages/core/src/update/__tests__/update-state.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write test**

```ts
// packages/core/src/update/__tests__/update-state.test.ts
import { describe, it, expect } from "vitest";
import {
  parseUpdateState,
  serializeUpdateState,
  defaultUpdateState,
  type UpdateState,
} from "../update-state.js";

describe("UpdateState", () => {
  it("defaultUpdateState() returns zero-state with interval_hours=1", () => {
    const s = defaultUpdateState();
    expect(s.interval_hours).toBe(1);
    expect(s.last_check_ts).toBe(0);
    expect(s.last_installed_sha).toBe("");
    expect(s.consecutive_install_failures).toBe(0);
    expect(s.pending_banner).toBeNull();
  });

  it("parseUpdateState parses valid JSON", () => {
    const json = JSON.stringify({
      last_check_ts: 1000,
      interval_hours: 6,
      last_installed_sha: "abc",
      last_installed_version: "0.10.1",
      installed_at: 999,
      consecutive_install_failures: 0,
      last_install_error: null,
      pending_banner: null,
    });
    const s = parseUpdateState(json);
    expect(s.interval_hours).toBe(6);
    expect(s.last_installed_sha).toBe("abc");
  });

  it("parseUpdateState falls back to defaults on malformed JSON", () => {
    expect(parseUpdateState("not-json").interval_hours).toBe(1);
    expect(parseUpdateState("").last_installed_sha).toBe("");
  });

  it("parseUpdateState fills missing fields from defaults", () => {
    const s = parseUpdateState(JSON.stringify({ last_installed_sha: "xyz" }));
    expect(s.last_installed_sha).toBe("xyz");
    expect(s.interval_hours).toBe(1);
    expect(s.consecutive_install_failures).toBe(0);
  });

  it("serializeUpdateState round-trips", () => {
    const s: UpdateState = {
      last_check_ts: 123,
      interval_hours: 1,
      last_installed_sha: "deadbeef",
      last_installed_version: "0.10.1",
      installed_at: 456,
      consecutive_install_failures: 2,
      last_install_error: "boom",
      pending_banner: { from: "a", to: "b", at: 789, shown: false },
    };
    expect(parseUpdateState(serializeUpdateState(s))).toEqual(s);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm vitest run packages/core/src/update/__tests__/update-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/update/update-state.ts

export interface PendingBanner {
  from: string;
  to: string;
  at: number;
  shown: boolean;
}

export interface UpdateState {
  last_check_ts: number;
  interval_hours: number;
  last_installed_sha: string;
  last_installed_version: string;
  installed_at: number;
  consecutive_install_failures: number;
  last_install_error: string | null;
  pending_banner: PendingBanner | null;
}

export function defaultUpdateState(): UpdateState {
  return {
    last_check_ts: 0,
    interval_hours: 1,
    last_installed_sha: "",
    last_installed_version: "",
    installed_at: 0,
    consecutive_install_failures: 0,
    last_install_error: null,
    pending_banner: null,
  };
}

export function parseUpdateState(raw: string): UpdateState {
  const def = defaultUpdateState();
  if (!raw || !raw.trim()) return def;
  try {
    const obj = JSON.parse(raw) as Partial<UpdateState>;
    return {
      last_check_ts: typeof obj.last_check_ts === "number" ? obj.last_check_ts : def.last_check_ts,
      interval_hours: typeof obj.interval_hours === "number" ? obj.interval_hours : def.interval_hours,
      last_installed_sha: typeof obj.last_installed_sha === "string" ? obj.last_installed_sha : def.last_installed_sha,
      last_installed_version: typeof obj.last_installed_version === "string" ? obj.last_installed_version : def.last_installed_version,
      installed_at: typeof obj.installed_at === "number" ? obj.installed_at : def.installed_at,
      consecutive_install_failures: typeof obj.consecutive_install_failures === "number" ? obj.consecutive_install_failures : def.consecutive_install_failures,
      last_install_error: typeof obj.last_install_error === "string" ? obj.last_install_error : null,
      pending_banner: isPendingBanner(obj.pending_banner) ? obj.pending_banner : null,
    };
  } catch {
    return def;
  }
}

export function serializeUpdateState(s: UpdateState): string {
  return JSON.stringify(s, null, 2);
}

function isPendingBanner(v: unknown): v is PendingBanner {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.from === "string"
    && typeof o.to === "string"
    && typeof o.at === "number"
    && typeof o.shown === "boolean";
}
```

- [ ] **Step 4: Verify tests pass**

```bash
pnpm vitest run packages/core/src/update/__tests__/update-state.test.ts
```

Expected: 4 PASS.

- [ ] **Step 5: Export from core**

Add to `packages/core/src/index.ts`:

```ts
export {
  defaultUpdateState,
  parseUpdateState,
  serializeUpdateState,
  type UpdateState,
  type PendingBanner,
} from "./update/update-state.js";
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/update/ packages/core/src/index.ts
git commit -m "feat(auto-update): UpdateState 类型 + 读写纯函数"
```

---

## Task 3: shouldCheckUpdate 节流决策纯函数

**Files:**
- Create: `packages/core/src/update/should-check.ts`
- Create: `packages/core/src/update/__tests__/should-check.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write test**

```ts
// packages/core/src/update/__tests__/should-check.test.ts
import { describe, it, expect } from "vitest";
import { shouldCheckUpdate, type ShouldCheckInput } from "../should-check.js";
import { defaultUpdateState } from "../update-state.js";

const HOUR = 60 * 60 * 1000;

function input(overrides: Partial<ShouldCheckInput> = {}): ShouldCheckInput {
  return {
    now: 10 * HOUR,
    state: defaultUpdateState(),
    env: {},
    disabledMarkerExists: false,
    ...overrides,
  };
}

describe("shouldCheckUpdate", () => {
  it("returns true when state never checked (last_check_ts=0)", () => {
    expect(shouldCheckUpdate(input())).toBe(true);
  });

  it("returns false when interval has not elapsed", () => {
    expect(shouldCheckUpdate(input({
      state: { ...defaultUpdateState(), last_check_ts: 9.5 * HOUR, interval_hours: 1 },
    }))).toBe(false);
  });

  it("returns true when interval elapsed", () => {
    expect(shouldCheckUpdate(input({
      state: { ...defaultUpdateState(), last_check_ts: 8 * HOUR, interval_hours: 1 },
    }))).toBe(true);
  });

  it("returns false when TEAMAGENT_AUTO_UPDATE=0", () => {
    expect(shouldCheckUpdate(input({ env: { TEAMAGENT_AUTO_UPDATE: "0" } }))).toBe(false);
  });

  it("returns false when disabled marker exists", () => {
    expect(shouldCheckUpdate(input({ disabledMarkerExists: true }))).toBe(false);
  });

  it("backs off 24h after 3 consecutive failures", () => {
    const state = { ...defaultUpdateState(), consecutive_install_failures: 3, last_check_ts: 9.5 * HOUR };
    expect(shouldCheckUpdate(input({ state }))).toBe(false);
    expect(shouldCheckUpdate(input({ state, now: state.last_check_ts + 25 * HOUR }))).toBe(true);
  });

  it("respects custom interval_hours=24", () => {
    const state = { ...defaultUpdateState(), interval_hours: 24, last_check_ts: 1 * HOUR };
    expect(shouldCheckUpdate(input({ state, now: 12 * HOUR }))).toBe(false);
    expect(shouldCheckUpdate(input({ state, now: 25 * HOUR + 1 }))).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/core/src/update/should-check.ts
import type { UpdateState } from "./update-state.js";

export interface ShouldCheckInput {
  now: number;
  state: UpdateState;
  env: Record<string, string | undefined>;
  disabledMarkerExists: boolean;
}

const FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1000;
const FAILURE_THRESHOLD = 3;

export function shouldCheckUpdate(input: ShouldCheckInput): boolean {
  if (input.env.TEAMAGENT_AUTO_UPDATE === "0") return false;
  if (input.disabledMarkerExists) return false;

  const { state, now } = input;
  if (
    state.consecutive_install_failures >= FAILURE_THRESHOLD &&
    now - state.last_check_ts < FAILURE_BACKOFF_MS
  ) {
    return false;
  }

  const intervalMs = (state.interval_hours || 1) * 60 * 60 * 1000;
  return now - state.last_check_ts >= intervalMs;
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm vitest run packages/core/src/update/__tests__/should-check.test.ts
```

Expected: 7 PASS.

- [ ] **Step 4: Export + commit**

Add to `packages/core/src/index.ts`:

```ts
export { shouldCheckUpdate, type ShouldCheckInput } from "./update/should-check.js";
```

```bash
git add packages/core/src/update/should-check.ts packages/core/src/update/__tests__/should-check.test.ts packages/core/src/index.ts
git commit -m "feat(auto-update): shouldCheckUpdate 节流决策纯函数"
```

---

## Task 4: warmup 命令

**Files:**
- Create: `packages/cli/src/commands/warmup.ts`
- Create: `packages/cli/src/__tests__/warmup.test.ts`
- Modify: `packages/cli/src/bin.ts`

- [ ] **Step 1: Write test**

```ts
// packages/cli/src/__tests__/warmup.test.ts
import { describe, it, expect, vi } from "vitest";
import { runWarmup } from "../commands/warmup.js";

describe("warmup", () => {
  it("calls embedder.embed once and returns ok=true", async () => {
    const embed = vi.fn().mockResolvedValue([[0.1, 0.2]]);
    const result = await runWarmup({ embedder: { embed } });
    expect(embed).toHaveBeenCalledOnce();
    expect(embed).toHaveBeenCalledWith(["warmup"]);
    expect(result.ok).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns ok=false on embedder error", async () => {
    const embed = vi.fn().mockRejectedValue(new Error("network"));
    const result = await runWarmup({ embedder: { embed } });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("network");
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/cli/src/commands/warmup.ts

export interface WarmupEmbedder {
  embed(texts: string[]): Promise<number[][]>;
}

export interface WarmupOptions {
  embedder?: WarmupEmbedder;
  /** stderr writer; tests inject silent sink */
  stderr?: (msg: string) => void;
}

export interface WarmupResult {
  ok: boolean;
  durationMs: number;
  error?: string;
}

export async function runWarmup(opts: WarmupOptions = {}): Promise<WarmupResult> {
  const stderr = opts.stderr ?? ((m) => process.stderr.write(m));
  let embedder = opts.embedder;
  if (!embedder) {
    const { XenovaRuleEmbedder } = await import("@teamagent/adapters");
    embedder = new XenovaRuleEmbedder();
  }
  const start = Date.now();
  stderr("⏳ TeamAgent: 预热向量模型 multilingual-e5-small (~120MB)...\n");
  try {
    await embedder.embed(["warmup"]);
    const durationMs = Date.now() - start;
    stderr(`✅ TeamAgent: 模型预热完成 (${durationMs}ms)\n`);
    return { ok: true, durationMs };
  } catch (e) {
    const error = (e as Error).message ?? String(e);
    stderr(`⚠️  TeamAgent: 模型预热失败 (${error})\n`);
    stderr("   不影响安装；首次使用时仍会按需下载。\n");
    return { ok: false, durationMs: Date.now() - start, error };
  }
}
```

- [ ] **Step 3: Register in bin.ts**

In `packages/cli/src/bin.ts`, find the command dispatch switch (look for `"init"`/`"doctor"` cases) and add:

```ts
import { runWarmup } from "./commands/warmup.js";
// ...
case "warmup": {
  const result = await runWarmup();
  process.exit(result.ok ? 0 : 1);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm vitest run packages/cli/src/__tests__/warmup.test.ts
pnpm typecheck
```

Expected: 2 PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/warmup.ts packages/cli/src/__tests__/warmup.test.ts packages/cli/src/bin.ts
git commit -m "feat(auto-update): teamagent warmup 命令预热向量模型"
```

---

## Task 5: warmup 接入 init 末尾

**Files:**
- Modify: `packages/cli/src/commands/init.ts`

- [ ] **Step 1: Read current init signature**

```bash
grep -n "skipWarmup\|InitOptions\|InitResult" packages/cli/src/commands/init.ts | head -20
```

- [ ] **Step 2: Add skipWarmup option + warmup step at end**

In `InitOptions` interface, add:

```ts
  /** 跳过向量模型预热（测试用 / 离线环境）。默认 false。 */
  skipWarmup?: boolean;
```

In the function body, after all existing steps (before `return { ok, ... }`), insert:

```ts
if (!opts.skipWarmup && !opts.dryRun) {
  const { runWarmup } = await import("./warmup.js");
  const w = await runWarmup();
  steps.push({
    step: "warmup",
    status: w.ok ? "ok" : "failed",
    detail: w.ok ? `模型预热 ${w.durationMs}ms` : `预热失败：${w.error}`,
  });
}
```

In `parseInitArgs`, add flag parsing for `--skip-warmup`.

- [ ] **Step 3: Run init tests**

```bash
pnpm vitest run packages/cli/src/__tests__/init
pnpm typecheck
```

Expected: existing tests pass (warmup off in tests via `skipWarmup: true` if needed; if tests don't pass `skipWarmup`, the dynamic import will try real embedder — gate this with env check or default `skipWarmup` to true under `NODE_ENV=test`).

If existing init tests fail because warmup runs, add to the warmup step:

```ts
if (!opts.skipWarmup && !opts.dryRun && process.env.NODE_ENV !== "test") {
  // ...
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/init.ts
git commit -m "feat(auto-update): init 末尾默认调用 warmup"
```

---

## Task 6: GitHub API 客户端 fetchRemoteSha

**Files:**
- Create: `packages/cli/src/github-api.ts`
- Create: `packages/cli/src/__tests__/github-api.test.ts`

- [ ] **Step 1: Write test (with injected fetcher)**

```ts
// packages/cli/src/__tests__/github-api.test.ts
import { describe, it, expect, vi } from "vitest";
import { fetchRemoteSha } from "../github-api.js";

describe("fetchRemoteSha", () => {
  it("returns sha on success", async () => {
    const httpsGet = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ commit: { sha: "abc123" } }),
    });
    const sha = await fetchRemoteSha({
      owner: "libz-renlab-ai",
      repo: "TeamBrain",
      branch: "release",
      httpsGet,
    });
    expect(sha).toBe("abc123");
    expect(httpsGet).toHaveBeenCalled();
  });

  it("returns null on 404", async () => {
    const httpsGet = vi.fn().mockResolvedValue({ statusCode: 404, body: "{}" });
    expect(await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    })).toBeNull();
  });

  it("returns null on rate limit (403)", async () => {
    const httpsGet = vi.fn().mockResolvedValue({ statusCode: 403, body: "{}" });
    expect(await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    })).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    const httpsGet = vi.fn().mockResolvedValue({ statusCode: 200, body: "not-json" });
    expect(await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    })).toBeNull();
  });

  it("returns null on network error", async () => {
    const httpsGet = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    })).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/cli/src/github-api.ts
import https from "node:https";

export interface HttpsResponse {
  statusCode: number;
  body: string;
}

export type HttpsGet = (url: string, headers: Record<string, string>) => Promise<HttpsResponse>;

export interface FetchRemoteShaInput {
  owner: string;
  repo: string;
  branch: string;
  httpsGet?: HttpsGet;
  userAgent?: string;
}

export async function fetchRemoteSha(input: FetchRemoteShaInput): Promise<string | null> {
  const get = input.httpsGet ?? defaultHttpsGet;
  const url = `https://api.github.com/repos/${input.owner}/${input.repo}/branches/${input.branch}`;
  const headers = {
    "User-Agent": input.userAgent ?? "teamagent-updater",
    "Accept": "application/vnd.github+json",
  };
  try {
    const res = await get(url, headers);
    if (res.statusCode !== 200) return null;
    const obj = JSON.parse(res.body) as { commit?: { sha?: string } };
    return obj.commit?.sha ?? null;
  } catch {
    return null;
  }
}

const defaultHttpsGet: HttpsGet = (url, headers) =>
  new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: 10_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c as Buffer));
      res.on("end", () => resolve({
        statusCode: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf-8"),
      }));
      res.on("error", reject);
    });
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.on("error", reject);
  });
```

- [ ] **Step 3: Run tests + commit**

```bash
pnpm vitest run packages/cli/src/__tests__/github-api.test.ts
git add packages/cli/src/github-api.ts packages/cli/src/__tests__/github-api.test.ts
git commit -m "feat(auto-update): fetchRemoteSha GitHub API 客户端"
```

---

## Task 7: updater-logic 主流程纯函数（注入所有 IO）

**Files:**
- Create: `packages/cli/src/updater-logic.ts`
- Create: `packages/cli/src/__tests__/updater-logic.test.ts`

- [ ] **Step 1: Write test**

```ts
// packages/cli/src/__tests__/updater-logic.test.ts
import { describe, it, expect, vi } from "vitest";
import { runUpdater, type UpdaterDeps } from "../updater-logic.js";
import { defaultUpdateState } from "@teamagent/core";

function makeDeps(over: Partial<UpdaterDeps> = {}): UpdaterDeps {
  return {
    fetchRemoteSha: vi.fn().mockResolvedValue("new-sha"),
    runNpmInstall: vi.fn().mockResolvedValue({ ok: true }),
    runMigrateAuto: vi.fn().mockResolvedValue({ ok: true }),
    backupCurrentInstall: vi.fn().mockReturnValue("/tmp/backup-old"),
    restoreFromBackup: vi.fn(),
    pruneOldBackups: vi.fn(),
    readState: vi.fn().mockReturnValue(defaultUpdateState()),
    writeState: vi.fn(),
    log: vi.fn(),
    now: () => 1000,
    acquireLock: vi.fn().mockReturnValue(true),
    releaseLock: vi.fn(),
    ...over,
  };
}

describe("runUpdater", () => {
  it("noop when remote sha matches local", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "same" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue("same"),
    });
    await runUpdater(deps);
    expect(deps.runNpmInstall).not.toHaveBeenCalled();
    expect(deps.writeState).toHaveBeenCalled();
    expect((deps.writeState as any).mock.calls[0][0].last_check_ts).toBe(1000);
  });

  it("noop when fetch fails", async () => {
    const deps = makeDeps({ fetchRemoteSha: vi.fn().mockResolvedValue(null) });
    await runUpdater(deps);
    expect(deps.runNpmInstall).not.toHaveBeenCalled();
  });

  it("happy path: install + migrate + write banner", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "old" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue("new-sha"),
    });
    await runUpdater(deps);
    expect(deps.backupCurrentInstall).toHaveBeenCalledWith("old");
    expect(deps.runNpmInstall).toHaveBeenCalled();
    expect(deps.runMigrateAuto).toHaveBeenCalled();
    const written = (deps.writeState as any).mock.calls.at(-1)[0];
    expect(written.last_installed_sha).toBe("new-sha");
    expect(written.consecutive_install_failures).toBe(0);
    expect(written.pending_banner).toMatchObject({
      from: "old", to: "new-sha", shown: false,
    });
  });

  it("rolls back on npm install failure", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "old" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue("new"),
      runNpmInstall: vi.fn().mockResolvedValue({ ok: false, error: "boom" }),
    });
    await runUpdater(deps);
    expect(deps.restoreFromBackup).toHaveBeenCalledWith("/tmp/backup-old");
    expect(deps.runMigrateAuto).not.toHaveBeenCalled();
    const written = (deps.writeState as any).mock.calls.at(-1)[0];
    expect(written.consecutive_install_failures).toBe(1);
    expect(written.last_install_error).toContain("boom");
    expect(written.last_installed_sha).toBe("old");
  });

  it("rolls back on migrate failure", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "old" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue("new"),
      runMigrateAuto: vi.fn().mockResolvedValue({ ok: false, error: "schema" }),
    });
    await runUpdater(deps);
    expect(deps.restoreFromBackup).toHaveBeenCalledWith("/tmp/backup-old");
    const written = (deps.writeState as any).mock.calls.at(-1)[0];
    expect(written.last_installed_sha).toBe("old");
    expect(written.last_install_error).toContain("schema");
  });

  it("skips when lock cannot be acquired", async () => {
    const deps = makeDeps({ acquireLock: vi.fn().mockReturnValue(false) });
    await runUpdater(deps);
    expect(deps.fetchRemoteSha).not.toHaveBeenCalled();
  });

  it("releases lock even on error", async () => {
    const deps = makeDeps({
      fetchRemoteSha: vi.fn().mockRejectedValue(new Error("net")),
    });
    await runUpdater(deps);
    expect(deps.releaseLock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// packages/cli/src/updater-logic.ts
import {
  type UpdateState,
  type PendingBanner,
} from "@teamagent/core";

export interface UpdaterDeps {
  fetchRemoteSha(): Promise<string | null>;
  runNpmInstall(): Promise<{ ok: boolean; error?: string }>;
  runMigrateAuto(): Promise<{ ok: boolean; error?: string }>;
  backupCurrentInstall(sha: string): string;            // returns backup dir path
  restoreFromBackup(backupDir: string): void;
  pruneOldBackups(): void;
  readState(): UpdateState;
  writeState(state: UpdateState): void;
  log(msg: string): void;
  now(): number;
  acquireLock(): boolean;
  releaseLock(): void;
}

export async function runUpdater(deps: UpdaterDeps): Promise<void> {
  if (!deps.acquireLock()) {
    deps.log("lock held by other updater; skip");
    return;
  }
  try {
    const state = deps.readState();
    state.last_check_ts = deps.now();
    deps.writeState(state);

    let remoteSha: string | null;
    try {
      remoteSha = await deps.fetchRemoteSha();
    } catch (e) {
      deps.log(`fetch error: ${(e as Error).message}`);
      return;
    }
    if (!remoteSha) { deps.log("fetch failed or empty"); return; }
    if (remoteSha === state.last_installed_sha) {
      deps.log("up-to-date");
      return;
    }

    deps.log(`update available: ${state.last_installed_sha} -> ${remoteSha}`);
    const backupDir = deps.backupCurrentInstall(state.last_installed_sha);

    const installRes = await deps.runNpmInstall();
    if (!installRes.ok) {
      deps.restoreFromBackup(backupDir);
      const failed = { ...state };
      failed.consecutive_install_failures = state.consecutive_install_failures + 1;
      failed.last_install_error = `npm install failed: ${installRes.error ?? "unknown"}`;
      deps.writeState(failed);
      deps.log(failed.last_install_error);
      return;
    }

    const migrateRes = await deps.runMigrateAuto();
    if (!migrateRes.ok) {
      deps.restoreFromBackup(backupDir);
      const failed = { ...state };
      failed.consecutive_install_failures = state.consecutive_install_failures + 1;
      failed.last_install_error = `migrate failed: ${migrateRes.error ?? "unknown"}`;
      deps.writeState(failed);
      deps.log(failed.last_install_error);
      return;
    }

    const fromSha = state.last_installed_sha;
    const banner: PendingBanner = { from: fromSha, to: remoteSha, at: deps.now(), shown: false };
    const success: UpdateState = {
      ...state,
      last_installed_sha: remoteSha,
      installed_at: deps.now(),
      consecutive_install_failures: 0,
      last_install_error: null,
      pending_banner: banner,
    };
    deps.writeState(success);
    deps.pruneOldBackups();
    deps.log(`updated to ${remoteSha}`);
  } finally {
    deps.releaseLock();
  }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm vitest run packages/cli/src/__tests__/updater-logic.test.ts
pnpm typecheck
```

Expected: 7 PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/updater-logic.ts packages/cli/src/__tests__/updater-logic.test.ts
git commit -m "feat(auto-update): updater-logic 纯函数主流程 + 单测"
```

---

## Task 8: bin-updater entry + IO 实现

**Files:**
- Create: `packages/cli/src/bin-updater.ts`
- Modify: `packages/cli/tsup.hook.config.ts`

- [ ] **Step 1: Implement bin-updater**

```ts
// packages/cli/src/bin-updater.ts
#!/usr/bin/env node
/**
 * Updater 子进程 entry. Detached spawn 后由 SessionStart 调起.
 * 永远不阻塞主进程, 失败静默, 退出码恒为 0.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import {
  parseUpdateState,
  serializeUpdateState,
  defaultUpdateState,
  type UpdateState,
} from "@teamagent/core";
import { runUpdater } from "./updater-logic.js";
import { fetchRemoteSha } from "./github-api.js";

const TEAMAGENT_HOME = process.env["TEAMAGENT_HOME"] ?? path.join(os.homedir(), ".teamagent");
const STATE_PATH = path.join(TEAMAGENT_HOME, "update-state.json");
const LOCK_PATH = path.join(TEAMAGENT_HOME, "update.lock");
const LOG_PATH = path.join(TEAMAGENT_HOME, "update.log");
const ROLLBACK_DIR = path.join(TEAMAGENT_HOME, "rollback");
const REPO_OWNER = "libz-renlab-ai";
const REPO_NAME = "TeamBrain";
const REPO_BRANCH = "release";
const PACKAGE_SPEC = `github:${REPO_OWNER}/${REPO_NAME}#${REPO_BRANCH}`;
const BACKUP_KEEP = 3;

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function log(msg: string): void {
  ensureDir(TEAMAGENT_HOME);
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_PATH, line, "utf-8"); } catch { /* silent */ }
}

function readState(): UpdateState {
  try {
    if (!fs.existsSync(STATE_PATH)) return defaultUpdateState();
    return parseUpdateState(fs.readFileSync(STATE_PATH, "utf-8"));
  } catch {
    return defaultUpdateState();
  }
}

function writeState(s: UpdateState): void {
  ensureDir(TEAMAGENT_HOME);
  fs.writeFileSync(STATE_PATH, serializeUpdateState(s), "utf-8");
}

function acquireLock(): boolean {
  ensureDir(TEAMAGENT_HOME);
  try {
    const fd = fs.openSync(LOCK_PATH, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (e) {
    // Stale lock detection: if pid not alive, force-take
    try {
      const pid = parseInt(fs.readFileSync(LOCK_PATH, "utf-8"), 10);
      if (pid > 0) {
        try {
          process.kill(pid, 0);  // throws if dead
          return false;          // alive — real concurrent updater
        } catch {
          // dead pid → take over
          fs.unlinkSync(LOCK_PATH);
          fs.writeFileSync(LOCK_PATH, String(process.pid), "utf-8");
          return true;
        }
      }
    } catch { /* ignore */ }
    return false;
  }
}

function releaseLock(): void {
  try { fs.unlinkSync(LOCK_PATH); } catch { /* silent */ }
}

function findGlobalDistDir(): string | null {
  // node_modules/teamagent/dist resolves via the bin path: when this bin runs,
  // __dirname is the dist directory itself.
  const candidate = __dirname;
  if (fs.existsSync(path.join(candidate, "bin.js"))) return candidate;
  return null;
}

function backupCurrentInstall(oldSha: string): string {
  ensureDir(ROLLBACK_DIR);
  const dist = findGlobalDistDir();
  if (!dist) return "";
  const tag = oldSha || `pre-${Date.now()}`;
  const dest = path.join(ROLLBACK_DIR, tag);
  fs.rmSync(dest, { recursive: true, force: true });
  copyDirSync(dist, dest);
  return dest;
}

function restoreFromBackup(backupDir: string): void {
  if (!backupDir || !fs.existsSync(backupDir)) return;
  const dist = findGlobalDistDir();
  if (!dist) return;
  fs.rmSync(dist, { recursive: true, force: true });
  copyDirSync(backupDir, dist);
}

function pruneOldBackups(): void {
  if (!fs.existsSync(ROLLBACK_DIR)) return;
  const entries = fs.readdirSync(ROLLBACK_DIR)
    .map((name) => ({ name, mtime: fs.statSync(path.join(ROLLBACK_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const entry of entries.slice(BACKUP_KEEP)) {
    fs.rmSync(path.join(ROLLBACK_DIR, entry.name), { recursive: true, force: true });
  }
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

function runNpmInstall(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, ["install", "-g", PACKAGE_SPEC], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TEAMAGENT_SKIP_WARMUP: "1" },  // postinstall warmup off during update
    });
    let err = "";
    child.stderr?.on("data", (d) => { err += String(d); });
    child.on("exit", (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: err.slice(-500) || `exit ${code}` });
    });
    child.on("error", (e) => resolve({ ok: false, error: e.message }));
  });
}

function runMigrateAuto(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const dist = findGlobalDistDir();
    if (!dist) return resolve({ ok: true }); // 安装后 dist 应在；找不到当作 noop
    const binJs = path.join(dist, "bin.js");
    const child = spawn(process.execPath, [binJs, "migrate-auto"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr?.on("data", (d) => { err += String(d); });
    child.on("exit", (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: err.slice(-500) || `exit ${code}` });
    });
    child.on("error", (e) => resolve({ ok: false, error: e.message }));
  });
}

async function main(): Promise<void> {
  log("updater started");
  await runUpdater({
    fetchRemoteSha: () => fetchRemoteSha({ owner: REPO_OWNER, repo: REPO_NAME, branch: REPO_BRANCH }),
    runNpmInstall,
    runMigrateAuto,
    backupCurrentInstall,
    restoreFromBackup,
    pruneOldBackups,
    readState,
    writeState,
    log,
    now: () => Date.now(),
    acquireLock,
    releaseLock,
  });
  log("updater exit");
}

main().catch((e) => log(`updater crash: ${(e as Error).message}`));
```

- [ ] **Step 2: Add to tsup.hook.config.ts**

```ts
// In entry block, add:
"bin-updater": "src/bin-updater.ts",
```

- [ ] **Step 3: Build + typecheck + commit**

```bash
pnpm typecheck
pnpm --filter @teamagent/cli build
ls packages/cli/dist/bin-updater.cjs   # confirm bundle exists
git add packages/cli/src/bin-updater.ts packages/cli/tsup.hook.config.ts
git commit -m "feat(auto-update): bin-updater 子进程 entry + 备份/回滚 IO"
```

---

## Task 9: SessionStart 接入 updater + banner

**Files:**
- Modify: `packages/cli/src/session-start-logic.ts`
- Modify: `packages/cli/src/bin-session-start.ts`

- [ ] **Step 1: Add helpers to session-start-logic.ts**

Append to `packages/cli/src/session-start-logic.ts`:

```ts
import { spawn as _spawn } from "node:child_process";
import {
  parseUpdateState,
  serializeUpdateState,
  defaultUpdateState,
  shouldCheckUpdate,
  type UpdateState,
} from "@teamagent/core";
import fs from "node:fs";

const TEAMAGENT_HOME = process.env["TEAMAGENT_HOME"] ?? join(os.homedir(), ".teamagent");
const UPDATE_STATE_PATH = join(TEAMAGENT_HOME, "update-state.json");
const UPDATE_DISABLED_PATH = join(TEAMAGENT_HOME, "auto-update.disabled");

export function readUpdateState(): UpdateState {
  try {
    if (!fs.existsSync(UPDATE_STATE_PATH)) return defaultUpdateState();
    return parseUpdateState(fs.readFileSync(UPDATE_STATE_PATH, "utf-8"));
  } catch {
    return defaultUpdateState();
  }
}

export function writeUpdateState(s: UpdateState): void {
  try {
    fs.mkdirSync(TEAMAGENT_HOME, { recursive: true });
    fs.writeFileSync(UPDATE_STATE_PATH, serializeUpdateState(s), "utf-8");
  } catch { /* silent */ }
}

/** Check whether to spawn updater this SessionStart. */
export function shouldSpawnUpdater(now: Date = new Date()): boolean {
  return shouldCheckUpdate({
    now: now.getTime(),
    state: readUpdateState(),
    env: process.env,
    disabledMarkerExists: fs.existsSync(UPDATE_DISABLED_PATH),
  });
}

/** Detached fire-and-forget spawn of bin-updater.cjs. */
export function spawnUpdater(): void {
  const updaterBin = join(__dirname, "bin-updater.cjs");
  if (!fs.existsSync(updaterBin)) {
    logError("updater-bin-missing", new Error(updaterBin));
    return;
  }
  const child = _spawn(process.execPath, [updaterBin], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
}

/**
 * If a pending banner exists and not yet shown, write to stderr (visible on
 * first turn) and mark shown.
 */
export function maybeShowPendingBanner(stderr: (s: string) => void = (s) => process.stderr.write(s)): void {
  const state = readUpdateState();
  if (!state.pending_banner || state.pending_banner.shown) return;
  const { from, to } = state.pending_banner;
  const fromShort = from ? from.slice(0, 7) : "(初装)";
  stderr(`✨ TeamAgent: 已自动更新 ${fromShort} → ${to.slice(0, 7)}\n`);
  stderr(`   本次会话生效。详情: teamagent update --status\n`);
  state.pending_banner.shown = true;
  writeUpdateState(state);
}
```

(注意 `logError` 在文件顶部已有；新增 import 加在文件原 import 区。)

- [ ] **Step 2: Wire up bin-session-start.ts**

In `packages/cli/src/bin-session-start.ts`, after the existing `decideAction` block:

```ts
import {
  decideAction, spawnAutoInit, logError,
  shouldSpawnUpdater, spawnUpdater, maybeShowPendingBanner,
} from "./session-start-logic.js";

// ... after action handling ...

try { maybeShowPendingBanner(); } catch (e) { logError("banner-show-failed", e); }
try {
  if (shouldSpawnUpdater()) spawnUpdater();
} catch (e) {
  logError("updater-spawn-failed", e);
}
```

- [ ] **Step 3: Add tests for new helpers**

```ts
// packages/cli/src/__tests__/session-start-update.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  shouldSpawnUpdater,
  maybeShowPendingBanner,
  readUpdateState,
  writeUpdateState,
} from "../session-start-logic.js";
import { defaultUpdateState } from "@teamagent/core";

let homeBak: string | undefined;
let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tg-update-"));
  homeBak = process.env["TEAMAGENT_HOME"];
  process.env["TEAMAGENT_HOME"] = tmpHome;
});

afterEach(() => {
  if (homeBak === undefined) delete process.env["TEAMAGENT_HOME"];
  else process.env["TEAMAGENT_HOME"] = homeBak;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("session-start update helpers", () => {
  it("shouldSpawnUpdater returns true when state never checked", () => {
    expect(shouldSpawnUpdater()).toBe(true);
  });

  it("respects TEAMAGENT_AUTO_UPDATE=0", () => {
    process.env["TEAMAGENT_AUTO_UPDATE"] = "0";
    expect(shouldSpawnUpdater()).toBe(false);
    delete process.env["TEAMAGENT_AUTO_UPDATE"];
  });

  it("maybeShowPendingBanner writes once and marks shown", () => {
    const state = {
      ...defaultUpdateState(),
      pending_banner: { from: "abcdefg1234567", to: "1234567abcdefg", at: 1, shown: false },
    };
    writeUpdateState(state);
    let captured = "";
    maybeShowPendingBanner((s) => { captured += s; });
    expect(captured).toContain("→");
    expect(readUpdateState().pending_banner?.shown).toBe(true);

    // Second call: no output
    let captured2 = "";
    maybeShowPendingBanner((s) => { captured2 += s; });
    expect(captured2).toBe("");
  });
});
```

**Note: `process.env["TEAMAGENT_HOME"]` must be read at function-call time, not module-load time.** If the existing `session-start-logic.ts` resolves `TEAMAGENT_HOME` at module top, the test will see stale value. Adjust the implementation to read env inside `readUpdateState`/`writeUpdateState`/`spawnUpdater` if needed.

- [ ] **Step 4: Run all tests + commit**

```bash
pnpm vitest run packages/cli/src/__tests__/session-start-update.test.ts
pnpm vitest run packages/cli/src/__tests__/session-start.test.ts  # existing, must still pass
git add packages/cli/src/session-start-logic.ts packages/cli/src/bin-session-start.ts packages/cli/src/__tests__/session-start-update.test.ts
git commit -m "feat(auto-update): SessionStart 接入 updater spawn + banner"
```

---

## Task 10: migrate-auto 命令

**Files:**
- Create: `packages/cli/src/commands/migrate-auto.ts`
- Create: `packages/cli/src/__tests__/migrate-auto.test.ts`
- Modify: `packages/cli/src/bin.ts`

- [ ] **Step 1: Implement (idempotent shell that calls existing migrate-v6/v7)**

```ts
// packages/cli/src/commands/migrate-auto.ts
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface MigrateAutoOptions {
  /** 注入 spawn（测试用），返回 0=ok */
  runStep?: (binJs: string, cmd: string) => Promise<number>;
}

export interface MigrateAutoResult {
  ok: boolean;
  steps: { cmd: string; code: number }[];
  error?: string;
}

const STEPS = ["migrate-v6", "migrate-v7"];

export async function runMigrateAuto(opts: MigrateAutoOptions = {}): Promise<MigrateAutoResult> {
  const binJs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin.js");
  const runStep = opts.runStep ?? defaultRunStep;
  const steps: { cmd: string; code: number }[] = [];
  for (const cmd of STEPS) {
    const code = await runStep(binJs, cmd);
    steps.push({ cmd, code });
    if (code !== 0) {
      return { ok: false, steps, error: `step ${cmd} exit ${code}` };
    }
  }
  return { ok: true, steps };
}

function defaultRunStep(binJs: string, cmd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [binJs, cmd, "--auto"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}
```

- [ ] **Step 2: Test**

```ts
// packages/cli/src/__tests__/migrate-auto.test.ts
import { describe, it, expect, vi } from "vitest";
import { runMigrateAuto } from "../commands/migrate-auto.js";

describe("runMigrateAuto", () => {
  it("returns ok when all steps exit 0", async () => {
    const runStep = vi.fn().mockResolvedValue(0);
    const r = await runMigrateAuto({ runStep });
    expect(r.ok).toBe(true);
    expect(r.steps).toHaveLength(2);
  });

  it("stops + returns error on first failure", async () => {
    const runStep = vi.fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2);
    const r = await runMigrateAuto({ runStep });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("migrate-v7");
    expect(r.steps).toEqual([{ cmd: "migrate-v6", code: 0 }, { cmd: "migrate-v7", code: 2 }]);
  });
});
```

- [ ] **Step 3: Wire bin.ts**

In `packages/cli/src/bin.ts` switch:

```ts
case "migrate-auto": {
  const { runMigrateAuto } = await import("./commands/migrate-auto.js");
  const r = await runMigrateAuto();
  process.stderr.write(JSON.stringify(r, null, 2) + "\n");
  process.exit(r.ok ? 0 : 1);
}
```

- [ ] **Step 4: Verify migrate-v6/v7 accept `--auto`**

```bash
grep -n "\\-\\-auto\\|parseArgs" packages/cli/src/commands/migrate-v6.ts packages/cli/src/commands/migrate-v7.ts | head -10
```

If `--auto` flag isn't supported, add it as alias for non-interactive default mode (or remove `--auto` from migrate-auto's arg list — these commands should already be safe to run idempotently).

- [ ] **Step 5: Run + commit**

```bash
pnpm vitest run packages/cli/src/__tests__/migrate-auto.test.ts
git add packages/cli/src/commands/migrate-auto.ts packages/cli/src/__tests__/migrate-auto.test.ts packages/cli/src/bin.ts
git commit -m "feat(auto-update): migrate-auto 链式迁移命令"
```

---

## Task 11: update 命令组

**Files:**
- Create: `packages/cli/src/commands/update.ts`
- Create: `packages/cli/src/__tests__/update.test.ts`
- Modify: `packages/cli/src/bin.ts`

- [ ] **Step 1: Implement**

```ts
// packages/cli/src/commands/update.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  defaultUpdateState,
  parseUpdateState,
  serializeUpdateState,
  type UpdateState,
} from "@teamagent/core";

const HOME = () => process.env["TEAMAGENT_HOME"] ?? path.join(os.homedir(), ".teamagent");
const STATE_PATH = () => path.join(HOME(), "update-state.json");
const DISABLED_PATH = () => path.join(HOME(), "auto-update.disabled");
const LOG_PATH = () => path.join(HOME(), "update.log");
const ROLLBACK_DIR = () => path.join(HOME(), "rollback");

export type UpdateSubcommand =
  | "check" | "now" | "status" | "disable" | "enable" | "rollback" | "logs";

export interface UpdateRunResult { ok: boolean; output: string; }

export function readState(): UpdateState {
  try {
    if (!fs.existsSync(STATE_PATH())) return defaultUpdateState();
    return parseUpdateState(fs.readFileSync(STATE_PATH(), "utf-8"));
  } catch { return defaultUpdateState(); }
}

export function writeState(s: UpdateState): void {
  fs.mkdirSync(HOME(), { recursive: true });
  fs.writeFileSync(STATE_PATH(), serializeUpdateState(s), "utf-8");
}

export async function runUpdateCommand(sub: UpdateSubcommand, args: string[] = []): Promise<UpdateRunResult> {
  switch (sub) {
    case "status":   return statusCmd();
    case "disable":  return disableCmd();
    case "enable":   return enableCmd();
    case "logs":     return logsCmd();
    case "check":    return checkCmd();
    case "now":      return nowCmd();
    case "rollback": return rollbackCmd(args[0]);
  }
}

function statusCmd(): UpdateRunResult {
  const s = readState();
  const disabled = fs.existsSync(DISABLED_PATH());
  const lines = [
    `auto-update: ${disabled ? "DISABLED (~/.teamagent/auto-update.disabled)" : "enabled"}`,
    `interval_hours: ${s.interval_hours}`,
    `last_check: ${s.last_check_ts ? new Date(s.last_check_ts).toISOString() : "never"}`,
    `last_installed_sha: ${s.last_installed_sha || "(unknown)"}`,
    `last_installed_version: ${s.last_installed_version || "(unknown)"}`,
    `consecutive_install_failures: ${s.consecutive_install_failures}`,
    `last_install_error: ${s.last_install_error ?? "none"}`,
    `pending_banner: ${s.pending_banner ? `${s.pending_banner.from.slice(0, 7)} -> ${s.pending_banner.to.slice(0, 7)} (shown=${s.pending_banner.shown})` : "none"}`,
  ];
  return { ok: true, output: lines.join("\n") + "\n" };
}

function disableCmd(): UpdateRunResult {
  fs.mkdirSync(HOME(), { recursive: true });
  fs.writeFileSync(DISABLED_PATH(), `disabled at ${new Date().toISOString()}\n`, "utf-8");
  return { ok: true, output: `auto-update disabled (${DISABLED_PATH()})\n` };
}

function enableCmd(): UpdateRunResult {
  if (fs.existsSync(DISABLED_PATH())) fs.unlinkSync(DISABLED_PATH());
  return { ok: true, output: "auto-update enabled\n" };
}

function logsCmd(): UpdateRunResult {
  if (!fs.existsSync(LOG_PATH())) return { ok: true, output: "(empty)\n" };
  const text = fs.readFileSync(LOG_PATH(), "utf-8");
  const lines = text.split(/\r?\n/);
  const tail = lines.slice(-50).join("\n");
  return { ok: true, output: tail + "\n" };
}

async function checkCmd(): Promise<UpdateRunResult> {
  const { fetchRemoteSha } = await import("../github-api.js");
  const remote = await fetchRemoteSha({ owner: "libz-renlab-ai", repo: "TeamBrain", branch: "release" });
  const local = readState().last_installed_sha;
  if (!remote) return { ok: false, output: "fetch failed (network/rate-limit)\n" };
  if (remote === local) return { ok: true, output: `up-to-date (${local.slice(0, 7)})\n` };
  return { ok: true, output: `update available: ${local.slice(0, 7)} -> ${remote.slice(0, 7)}\n` };
}

async function nowCmd(): Promise<UpdateRunResult> {
  // Reset throttle then exec the same updater in foreground
  const s = readState();
  s.last_check_ts = 0;
  s.consecutive_install_failures = 0;
  writeState(s);
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const updaterBin = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "bin-updater.cjs");
    const child = spawn(process.execPath, [updaterBin], { stdio: "inherit" });
    child.on("exit", (code) => resolve({
      ok: code === 0,
      output: code === 0 ? "update run finished. teamagent update --status to inspect.\n" : `updater exit ${code}\n`,
    }));
  });
}

function rollbackCmd(target?: string): UpdateRunResult {
  if (!fs.existsSync(ROLLBACK_DIR())) return { ok: false, output: "no backups\n" };
  const entries = fs.readdirSync(ROLLBACK_DIR()).sort();
  if (entries.length === 0) return { ok: false, output: "no backups\n" };
  if (!target) {
    return { ok: true, output: "available backups:\n" + entries.map((e) => "  " + e).join("\n") + "\n用 teamagent update --rollback <sha> 恢复\n" };
  }
  if (!entries.includes(target)) return { ok: false, output: `backup not found: ${target}\n` };
  const src = path.join(ROLLBACK_DIR(), target);
  // Resolve global dist via npm root -g
  const dist = findGlobalDist();
  if (!dist) return { ok: false, output: "cannot locate global teamagent dist\n" };
  fs.rmSync(dist, { recursive: true, force: true });
  copyDir(src, dist);
  // Update state
  const s = readState();
  s.last_installed_sha = target;
  s.pending_banner = null;
  writeState(s);
  return { ok: true, output: `rolled back to ${target}\n` };
}

function findGlobalDist(): string | null {
  try {
    const { execSync } = require("node:child_process");
    const root = String(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] })).trim();
    const dist = path.join(root, "teamagent", "dist");
    if (fs.existsSync(path.join(dist, "bin.js"))) return dist;
  } catch { /* ignore */ }
  return null;
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function parseUpdateArgs(argv: string[]): { sub: UpdateSubcommand; rest: string[] } {
  // accept --check / --now / --status / --disable / --enable / --rollback [sha] / --logs
  for (const a of argv) {
    if (a === "--check") return { sub: "check", rest: [] };
    if (a === "--now") return { sub: "now", rest: [] };
    if (a === "--status") return { sub: "status", rest: [] };
    if (a === "--disable") return { sub: "disable", rest: [] };
    if (a === "--enable") return { sub: "enable", rest: [] };
    if (a === "--logs") return { sub: "logs", rest: [] };
    if (a === "--rollback") {
      const idx = argv.indexOf("--rollback");
      return { sub: "rollback", rest: argv.slice(idx + 1).filter((x) => !x.startsWith("--")) };
    }
  }
  return { sub: "status", rest: [] };
}
```

- [ ] **Step 2: Test**

```ts
// packages/cli/src/__tests__/update.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runUpdateCommand,
  parseUpdateArgs,
  writeState,
} from "../commands/update.js";
import { defaultUpdateState } from "@teamagent/core";

let tmpHome: string;
let envBak: string | undefined;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tg-upd-cmd-"));
  envBak = process.env["TEAMAGENT_HOME"];
  process.env["TEAMAGENT_HOME"] = tmpHome;
});

afterEach(() => {
  if (envBak === undefined) delete process.env["TEAMAGENT_HOME"];
  else process.env["TEAMAGENT_HOME"] = envBak;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("update command", () => {
  it("status default returns full snapshot", async () => {
    const s = defaultUpdateState();
    s.last_installed_sha = "abcdef1234";
    writeState(s);
    const r = await runUpdateCommand("status");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("abcdef1234");
  });

  it("disable creates marker, enable removes", async () => {
    const dis = await runUpdateCommand("disable");
    expect(dis.ok).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, "auto-update.disabled"))).toBe(true);
    const en = await runUpdateCommand("enable");
    expect(en.ok).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, "auto-update.disabled"))).toBe(false);
  });

  it("logs shows tail or empty", async () => {
    const r = await runUpdateCommand("logs");
    expect(r.output).toBe("(empty)\n");
    fs.writeFileSync(path.join(tmpHome, "update.log"), "line1\nline2\n");
    const r2 = await runUpdateCommand("logs");
    expect(r2.output).toContain("line1");
  });

  it("parseUpdateArgs picks correct subcommand", () => {
    expect(parseUpdateArgs(["--status"]).sub).toBe("status");
    expect(parseUpdateArgs(["--check"]).sub).toBe("check");
    expect(parseUpdateArgs(["--rollback", "abc"]).rest).toEqual(["abc"]);
    expect(parseUpdateArgs([]).sub).toBe("status");
  });

  it("rollback with no backups returns error", async () => {
    const r = await runUpdateCommand("rollback", []);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Wire bin.ts**

```ts
case "update": {
  const { runUpdateCommand, parseUpdateArgs } = await import("./commands/update.js");
  const { sub, rest } = parseUpdateArgs(argv.slice(1));
  const r = await runUpdateCommand(sub, rest);
  process.stdout.write(r.output);
  process.exit(r.ok ? 0 : 1);
}
```

- [ ] **Step 4: Run + commit**

```bash
pnpm vitest run packages/cli/src/__tests__/update.test.ts
git add packages/cli/src/commands/update.ts packages/cli/src/__tests__/update.test.ts packages/cli/src/bin.ts
git commit -m "feat(auto-update): teamagent update 命令组 (check/now/status/disable/enable/rollback/logs)"
```

---

## Task 12: postinstall 接入 warmup + 写 update-state.json

**Files:**
- Modify: `packages/teamagent/postinstall.mjs`

- [ ] **Step 1: Add warmup + state initialization**

After the `install-user-hook` block, before the success banner, add:

```js
// Warmup vector model (skippable via TEAMAGENT_SKIP_WARMUP=1, e.g., during auto-update)
if (process.env.TEAMAGENT_SKIP_WARMUP !== "1") {
  try {
    execSync(`node "${binPath}" warmup`, {
      stdio: "inherit",
      timeout: 300_000,
    });
  } catch {
    process.stderr.write("ℹ️  warmup 失败，首次使用时按需下载\n");
  }
}

// Initialize update-state.json with the current release sha if available
try {
  const releaseMeta = path.join(pkgDir, "release-meta.json");
  if (fs.existsSync(releaseMeta)) {
    const meta = JSON.parse(fs.readFileSync(releaseMeta, "utf-8"));
    const home = path.join(os.homedir(), ".teamagent");
    fs.mkdirSync(home, { recursive: true });
    const statePath = path.join(home, "update-state.json");
    let state = {};
    if (fs.existsSync(statePath)) {
      try { state = JSON.parse(fs.readFileSync(statePath, "utf-8")); } catch { /* reset */ }
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8"));
    state.last_installed_sha = meta.sha;
    state.last_installed_version = pkg.version;
    state.installed_at = Date.now();
    state.consecutive_install_failures = 0;
    state.last_install_error = null;
    if (!state.interval_hours) state.interval_hours = 1;
    if (!("last_check_ts" in state)) state.last_check_ts = 0;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  }
} catch (e) {
  process.stderr.write(`ℹ️  update-state init 失败: ${e.message}\n`);
}
```

Add `import os from "node:os";` at top if not already present.

- [ ] **Step 2: Verify postinstall syntax**

```bash
node -c packages/teamagent/postinstall.mjs
```

Expected: no error.

- [ ] **Step 3: Commit**

```bash
git add packages/teamagent/postinstall.mjs
git commit -m "feat(auto-update): postinstall 调 warmup + 初始化 update-state.json"
```

---

## Task 13: README 改写

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current 30 秒上手 + 命令速查 sections**

```bash
grep -n "30 秒上手\|命令速查\|常见问题\|npm install -g teamagent" README.md
```

- [ ] **Step 2: Replace install command + add auto-update section**

In "30 秒上手"：

```markdown
## 30 秒上手

```bash
npm install -g github:libz-renlab-ai/TeamBrain#release
cd your-project
teamagent init
# → 重启 Claude Code，工作如常
# → 之后每小时自动检查更新（背后静默 git fetch + npm install）
```
```

新增章节（在"30 秒上手"之后、"它做了什么"之前）：

```markdown
## 自动更新

装完之后**完全不用管**——TeamAgent 每次开 Claude Code 时静默检查 GitHub release 分支，
有新版本就在后台自动 `npm install -g github:.../release` + 数据库迁移，
**当前会话不动**（避免热替换风险），下次开 Claude 看到一行 banner：

```
✨ TeamAgent: 已自动更新 abc1234 → def5678
   本次会话生效。详情: teamagent update --status
```

控制：

```bash
teamagent update --check       # 看 GitHub 上有没有新版本，不更新
teamagent update --now         # 跳过节流立刻更
teamagent update --status      # 看更新状态
teamagent update --disable     # 关闭自动更新（写 ~/.teamagent/auto-update.disabled）
teamagent update --enable      # 重新打开
teamagent update --rollback <sha>  # 回到任一备份版本
teamagent update --logs        # 看更新日志
```

环境变量：
- `TEAMAGENT_AUTO_UPDATE=0`：会话级禁用（不写文件）
- 节流默认 1 小时，由 `~/.teamagent/update-state.json` 的 `interval_hours` 控制（可改 1/6/24）
- 连续 3 次安装失败后自动退避 24 小时，避免反复打扰
```

在"命令速查"加入 `warmup`、`update --check`、`update --now`、`update --status`：

```markdown
teamagent warmup             # 预热向量模型 (~120MB，init 已自动跑)
teamagent update --check     # 查 release 分支有没有新版本
teamagent update --now       # 立刻更新
teamagent update --status    # 看更新状态
teamagent migrate-auto       # 链式跑所有 schema migration
```

"常见问题"加：

```markdown
**自动更新太频繁？** `teamagent update --disable` 完全关掉。或编辑 `~/.teamagent/update-state.json` 把 `interval_hours` 改大。

**模型下载失败？** 设置 `HF_ENDPOINT=https://hf-mirror.com` 重跑 `teamagent warmup`。

**新版本启动崩了？** `teamagent update --rollback <旧 sha>` 回退。备份在 `~/.teamagent/rollback/`。
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(auto-update): README 切换 GitHub 安装路径 + 自动更新章节"
```

---

## Task 14: E2E verification with subagent

**Files:**
- Modify: `docs/superpowers/specs/2026-04-29-auto-update-design.md` (验收记录段)

- [ ] **Step 1: Build everything green**

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm --filter teamagent build
```

Expected: typecheck clean, all tests pass, dist artifacts present including `bin-updater.cjs`.

- [ ] **Step 2: Push to TeamBrain remote and trigger CI**

```bash
git push TeamBrain auto-update
# Optionally merge to main on GitHub web UI; or push main directly:
# git checkout main && git merge auto-update --ff-only && git push TeamBrain main
```

Wait for `release-branch.yml` to run, verify a `release` branch appears on GitHub with `dist/`, `package.json`, `postinstall.mjs`, `release-meta.json` at the root.

- [ ] **Step 3: Run subagent for 5 acceptance scenarios**

Dispatch subagent (general-purpose) with the prompt:

```
You are verifying TeamAgent auto-update on a clean Windows machine. Run these 5 scenarios in sequence; record each as PASS / FAIL / BLOCKED with evidence (commands run, output, paths).

1. **首装**:
   - Pick a clean tmp dir, set HOME=<tmp>, run:
     `npm install -g github:libz-renlab-ai/TeamBrain#release`
   - Verify: ~/.claude/settings.json has SessionStart hook
   - Verify: ~/.teamagent/update-state.json exists with last_installed_sha set
   - Verify: vector model cache populated (look in $(npm root -g)/teamagent or @xenova/transformers cache dir)

2. **静默更新**:
   - Push a no-op commit to TeamBrain main → wait CI → release branch updated
   - Open a Claude Code session in any project. Wait ~30s for updater to finish.
   - Check ~/.teamagent/update.log: should show "update available" + "updated to <new sha>"
   - Check ~/.teamagent/update-state.json: pending_banner.shown=false, to=<new sha>
   - Open Claude again: stderr should print banner, pending_banner.shown=true after.

3. **节流**:
   - Set state.last_check_ts to now, interval_hours=1
   - Open Claude 5 times within 60s. update.log should have at most 1 fetch in this window (nothing in subsequent 4).

4. **失败容错**:
   - Set REPO_BRANCH to a non-existent branch by env stub (or temporarily edit src/bin-updater.ts), or simulate npm install failure.
   - Open Claude → updater logs error → state.consecutive_install_failures=1 → no crash, Claude UI normal.

5. **回滚**:
   - Manually corrupt new dist (e.g., truncate bin.js), then run `teamagent update --now`.
   - Verify migrate-auto fails or detect via doctor → restoreFromBackup runs → dist restored.
   - Or simpler: set runNpmInstall to fail mid-test (use update --rollback explicitly).

Report PASS/FAIL per scenario with evidence. If any FAIL or BLOCKED, give exact reason.
```

- [ ] **Step 4: Update 验收记录 section**

Edit `docs/superpowers/specs/2026-04-29-auto-update-design.md` 验收记录 table with results from subagent. If any scenario FAIL, iterate (fix + re-run that scenario only) until 5/5 PASS.

- [ ] **Step 5: Final commit + push**

```bash
git add docs/superpowers/specs/2026-04-29-auto-update-design.md
git commit -m "docs(auto-update): 验收记录 5/5 PASS"
git push TeamBrain auto-update
```

---

## Self-Review

**Spec coverage check:**
- §1 release CI → Task 1 ✓
- §2 安装命令 → Task 13 (README) + Task 12 (postinstall meta) ✓
- §3 warmup → Task 4, 5, 12 ✓
- §4.1 SessionStart 改造 → Task 9 ✓
- §4.2 updater 子进程 → Task 7 (logic) + Task 8 (IO bin) ✓
- §4.3 migrate-auto → Task 10 ✓
- §4.4 回滚 → Task 8 (backup/restore) + Task 11 (--rollback cmd) ✓
- §5 update-state.json → Task 2 ✓
- §6 banner → Task 9 ✓
- §7 update 命令组 → Task 11 ✓
- §8 attribution events → 暂未实现，留 follow-up（仅 stderr/log 已够 MVP）
- §9 README → Task 13 ✓
- 验收 5 场景 → Task 14 ✓

**Placeholder scan:** all code blocks complete; "TODO" / "implement later" 无。

**Type consistency:** UpdateState/PendingBanner 在所有 task 用同一签名（来自 core）。`UpdaterDeps` 接口在 Task 7 定义，Task 8 实现一致。

**Scope:** 14 tasks，每 task 多步、可独立 commit。整体在一个 plan 里执行可控。
