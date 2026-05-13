import { describe, expect, it } from "vitest";

import { executePresence } from "../commands/presence.js";

const ANCHOR_MS = Date.parse("2026-05-13T12:00:00Z");

function snapshotResponse(snap: unknown): typeof fetch {
  const handler = async (): Promise<Response> => {
    return new Response(JSON.stringify(snap), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return handler as unknown as typeof fetch;
}

describe("teamagent presence — CLI subcommand contract", () => {
  it("prints state=unknown when TEAMAGENT_REALTIME_URL is unset", async () => {
    const result = await executePresence({
      receiverUrl: undefined,
      userId: "alice@example",
    });
    expect(result.state).toBe("unknown");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^state=unknown \(TEAMAGENT_REALTIME_URL not set\)/);
  });

  it("renders active state for a fresh user_prompt_submit snapshot", async () => {
    const fetchImpl = snapshotResponse({
      event: "user_prompt_submit",
      ts: new Date(ANCHOR_MS - 60_000).toISOString(),
    });
    const result = await executePresence({
      receiverUrl: "http://127.0.0.1:9787",
      userId: "alice@example",
      now: ANCHOR_MS,
      fetchImpl,
    });
    expect(result.state).toBe("active");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("state=active");
    expect(result.stdout).toContain("color=green");
    expect(result.stdout).toContain("event=user_prompt_submit");
  });

  it("renders offline state for a Stop snapshot regardless of age", async () => {
    const fetchImpl = snapshotResponse({
      event: "stop",
      ts: new Date(ANCHOR_MS - 1_000).toISOString(),
    });
    const result = await executePresence({
      receiverUrl: "http://127.0.0.1:9787",
      userId: "alice@example",
      now: ANCHOR_MS,
      fetchImpl,
    });
    expect(result.state).toBe("offline");
    expect(result.stdout).toContain("state=offline");
    expect(result.stdout).toContain("color=gray");
  });

  it("renders idle when last user_prompt_submit aged past active_ttl", async () => {
    const fetchImpl = snapshotResponse({
      event: "user_prompt_submit",
      ts: new Date(ANCHOR_MS - 15 * 60_000).toISOString(),
    });
    const result = await executePresence({
      receiverUrl: "http://127.0.0.1:9787",
      userId: "alice@example",
      now: ANCHOR_MS,
      fetchImpl,
    });
    expect(result.state).toBe("idle");
    expect(result.stdout).toContain("state=idle");
    expect(result.stdout).toContain("color=yellow");
  });

  it("renders error when receiver fetch fails (network refused)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:9787");
    }) as unknown as typeof fetch;
    const result = await executePresence({
      receiverUrl: "http://127.0.0.1:9787",
      userId: "alice@example",
      now: ANCHOR_MS,
      fetchImpl,
    });
    expect(result.state).toBe("error");
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("state=error");
    expect(result.stdout).toContain("fetch failed");
  });

  it("treats 404 as no-snapshot (offline, exit 0)", async () => {
    const fetchImpl = (async () => {
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
    const result = await executePresence({
      receiverUrl: "http://127.0.0.1:9787",
      userId: "alice@example",
      now: ANCHOR_MS,
      fetchImpl,
    });
    expect(result.state).toBe("offline");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("no snapshots returned for alice@example");
  });

  it("unwraps {snapshot: ...} response wrappers", async () => {
    const fetchImpl = snapshotResponse({
      snapshot: {
        event: "user_prompt_submit",
        ts: new Date(ANCHOR_MS - 5_000).toISOString(),
      },
      stale_seconds: 5,
    });
    const result = await executePresence({
      receiverUrl: "http://127.0.0.1:9787",
      userId: "alice@example",
      now: ANCHOR_MS,
      fetchImpl,
    });
    expect(result.state).toBe("active");
  });

  it("unwraps {rows: [...]} response wrappers", async () => {
    const fetchImpl = snapshotResponse({
      rows: [
        {
          event: "session_start",
          ts: new Date(ANCHOR_MS - 30_000).toISOString(),
        },
      ],
    });
    const result = await executePresence({
      receiverUrl: "http://127.0.0.1:9787",
      userId: "alice@example",
      now: ANCHOR_MS,
      fetchImpl,
    });
    expect(result.state).toBe("active");
  });

  it("encodes the user_id parameter properly", async () => {
    let capturedUrl = "";
    const fetchImpl = (async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return new Response("null", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    await executePresence({
      receiverUrl: "http://127.0.0.1:9787",
      userId: "alice+test@example.com",
      now: ANCHOR_MS,
      fetchImpl,
    });
    expect(capturedUrl).toContain("/api/cc-status/latest");
    expect(capturedUrl).toContain(
      `user_id=${encodeURIComponent("alice+test@example.com")}`,
    );
  });

  it("attaches bearer token when configured", async () => {
    let capturedAuth: string | null = null;
    const fetchImpl = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const headers = new Headers(init?.headers);
      capturedAuth = headers.get("authorization");
      return new Response("null", { status: 200 });
    }) as unknown as typeof fetch;
    await executePresence({
      receiverUrl: "http://127.0.0.1:9787",
      bearerToken: "topsecret",
      userId: "alice@example",
      now: ANCHOR_MS,
      fetchImpl,
    });
    expect(capturedAuth).toBe("Bearer topsecret");
  });
});
