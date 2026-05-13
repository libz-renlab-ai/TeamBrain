import { describe, it, expect } from "vitest";
import { runGitHubActivityPortContract } from "@teamagent/ports/contracts";
import {
  GhCliGitHubActivityAdapter,
  type GhSpawner,
} from "../gh-cli-adapter.js";

const ALICE_COMMITS_API = JSON.stringify([
  {
    sha: "abc1234",
    commit: {
      author: { name: "alice", date: "2026-05-13T08:00:00Z" },
      message: "fix: typo\n\nbody",
    },
    author: { login: "alice" },
  },
  {
    sha: "outside",
    commit: {
      author: { name: "alice", date: "2025-01-01T00:00:00Z" },
      message: "old commit",
    },
    author: { login: "alice" },
  },
]);

const ALICE_PRS_API = JSON.stringify({
  items: [
    {
      number: 42,
      title: "fix bug",
      state: "closed",
      created_at: "2026-05-13T07:00:00Z",
      closed_at: "2026-05-13T09:30:00Z",
      pull_request: { merged_at: "2026-05-13T09:30:00Z" },
      user: { login: "alice" },
    },
  ],
});

const ALICE_ISSUES_API = JSON.stringify({
  items: [
    {
      number: 100,
      title: "feature request",
      state: "open",
      created_at: "2026-05-13T12:00:00Z",
      closed_at: null,
      user: { login: "alice" },
      labels: [{ name: "enhancement" }, "good-first-issue"],
    },
    {
      // PR entries returned by /search/issues are filtered out
      number: 101,
      title: "should be filtered",
      state: "open",
      created_at: "2026-05-13T13:00:00Z",
      user: { login: "alice" },
      pull_request: {},
      labels: [],
    },
  ],
});

const EMPTY_ARRAY = "[]";
const EMPTY_ITEMS = JSON.stringify({ items: [] });

function makeRouter(): {
  spawner: GhSpawner;
  calls: { command: string; args: string[] }[];
} {
  const calls: { command: string; args: string[] }[] = [];
  const spawner: GhSpawner = async (command, args) => {
    calls.push({ command, args });
    const url = args[1] ?? "";
    // Treat ANY commits request as alice (fixture). Author filter is
    // already done client-side via the in-window check.
    if (url.startsWith("/repos/")) {
      if (url.includes(`author=alice`)) {
        return { kind: "exit", code: 0, stdout: ALICE_COMMITS_API, stderr: "" };
      }
      return { kind: "exit", code: 0, stdout: EMPTY_ARRAY, stderr: "" };
    }
    if (url.startsWith("/search/issues")) {
      if (url.includes("alice")) {
        if (url.includes("is%3Apr")) {
          return { kind: "exit", code: 0, stdout: ALICE_PRS_API, stderr: "" };
        }
        return { kind: "exit", code: 0, stdout: ALICE_ISSUES_API, stderr: "" };
      }
      return { kind: "exit", code: 0, stdout: EMPTY_ITEMS, stderr: "" };
    }
    return { kind: "exit", code: 0, stdout: EMPTY_ARRAY, stderr: "" };
  };
  return { spawner, calls };
}

describe("GhCliGitHubActivityAdapter", () => {
  runGitHubActivityPortContract(() => {
    const { spawner } = makeRouter();
    return new GhCliGitHubActivityAdapter({
      spawner,
      defaultProject: "owner/repo",
    });
  });

  it("returns empty arrays when gh is not installed and project is omitted (no defaultProject)", async () => {
    const adapter = new GhCliGitHubActivityAdapter({
      spawner: async () => ({ kind: "enoent" }),
    });
    const opts = {
      author: "alice",
      since: "2026-05-13T00:00:00Z",
      until: "2026-05-13T23:59:59Z",
    };
    await expect(adapter.fetchCommitsByAuthor(opts)).resolves.toEqual([]);
    await expect(adapter.fetchPullRequestsByAuthor(opts)).resolves.toEqual([]);
    await expect(adapter.fetchIssuesByAuthor(opts)).resolves.toEqual([]);
  });

  it("falls back to git log when gh exits non-zero for commits", async () => {
    let ghCalls = 0;
    let gitCalls = 0;
    const adapter = new GhCliGitHubActivityAdapter({
      spawner: async (cmd) => {
        if (cmd === "gh") {
          ghCalls++;
          return { kind: "exit", code: 1, stdout: "", stderr: "boom" };
        }
        if (cmd === "git") {
          gitCalls++;
          // Format: %H<FIELD>%aI<FIELD>%an<FIELD>%s<REC>
          const sep = "<<<TEAMAGENT-LIVE-INSPECT-FIELD>>>";
          const rec = "<<<TEAMAGENT-LIVE-INSPECT-REC>>>";
          const out = [
            `aaaa${sep}2026-05-13T05:00:00Z${sep}alice${sep}feat: x${rec}`,
            `bbbb${sep}2026-05-13T06:00:00Z${sep}alice${sep}fix: y${rec}`,
          ].join("");
          return { kind: "exit", code: 0, stdout: out, stderr: "" };
        }
        return { kind: "enoent" };
      },
      defaultProject: "owner/repo",
    });
    const r = await adapter.fetchCommitsByAuthor({
      author: "alice",
      since: "2026-05-13T00:00:00Z",
      until: "2026-05-13T23:59:59Z",
    });
    expect(ghCalls).toBe(1);
    expect(gitCalls).toBe(1);
    expect(r.map((c) => c.sha)).toEqual(["aaaa", "bbbb"]);
  });

  it("parses PR.state correctly (merged_at present → merged)", async () => {
    const adapter = new GhCliGitHubActivityAdapter({
      spawner: makeRouter().spawner,
      defaultProject: "owner/repo",
    });
    const r = await adapter.fetchPullRequestsByAuthor({
      author: "alice",
      since: "2026-05-13T00:00:00Z",
      until: "2026-05-13T23:59:59Z",
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.state).toBe("merged");
    expect(r[0]?.mergedAt).toBe("2026-05-13T09:30:00Z");
  });

  it("filters PR entries out of /search/issues results", async () => {
    const adapter = new GhCliGitHubActivityAdapter({
      spawner: makeRouter().spawner,
      defaultProject: "owner/repo",
    });
    const r = await adapter.fetchIssuesByAuthor({
      author: "alice",
      since: "2026-05-13T00:00:00Z",
      until: "2026-05-13T23:59:59Z",
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.number).toBe(100);
    expect(r[0]?.labels).toEqual(["enhancement", "good-first-issue"]);
  });

  it("emits a project query parameter when an explicit project is provided", async () => {
    const { spawner, calls } = makeRouter();
    const adapter = new GhCliGitHubActivityAdapter({ spawner });
    await adapter.fetchCommitsByAuthor({
      author: "alice",
      project: "myorg/myrepo",
      since: "2026-05-13T00:00:00Z",
      until: "2026-05-13T23:59:59Z",
    });
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.args[1]).toContain("/repos/myorg/myrepo/commits");
  });
});
