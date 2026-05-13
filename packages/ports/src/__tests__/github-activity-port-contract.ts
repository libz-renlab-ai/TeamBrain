import { describe, it, expect } from "vitest";
import type {
  GitHubActivityPort,
  GitHubCommit,
  GitHubPullRequest,
  GitHubIssue,
} from "../github-activity-port.js";

/**
 * GitHubActivityPort 契约。任何实现（gh-cli adapter / fake / git-log
 * fallback）必须满足这些不变量。
 */
export function runGitHubActivityPortContract(
  factory: () => GitHubActivityPort | Promise<GitHubActivityPort>
): void {
  describe("GitHubActivityPort contract", () => {
    const WINDOW = {
      since: "2026-05-12T00:00:00Z",
      until: "2026-05-13T23:59:59Z",
    };

    it("returns an array (possibly empty) for fetchCommitsByAuthor", async () => {
      const port = await factory();
      const r = await port.fetchCommitsByAuthor({
        author: "alice",
        ...WINDOW,
      });
      expect(Array.isArray(r)).toBe(true);
      for (const c of r) {
        assertCommitShape(c);
        assertTimestampInWindow(c.authoredAt, WINDOW);
      }
    });

    it("returns an array (possibly empty) for fetchPullRequestsByAuthor", async () => {
      const port = await factory();
      const r = await port.fetchPullRequestsByAuthor({
        author: "alice",
        ...WINDOW,
      });
      expect(Array.isArray(r)).toBe(true);
      for (const p of r) {
        assertPrShape(p);
        assertTimestampInWindow(p.createdAt, WINDOW);
      }
    });

    it("returns an array (possibly empty) for fetchIssuesByAuthor", async () => {
      const port = await factory();
      const r = await port.fetchIssuesByAuthor({
        author: "alice",
        ...WINDOW,
      });
      expect(Array.isArray(r)).toBe(true);
      for (const issue of r) {
        assertIssueShape(issue);
        assertTimestampInWindow(issue.createdAt, WINDOW);
      }
    });

    it("does not throw when author is unknown (returns empty arrays)", async () => {
      const port = await factory();
      const unknown = {
        author: "this-author-definitely-does-not-exist-xyz123",
        ...WINDOW,
      };
      await expect(port.fetchCommitsByAuthor(unknown)).resolves.toEqual([]);
      await expect(
        port.fetchPullRequestsByAuthor(unknown)
      ).resolves.toEqual([]);
      await expect(port.fetchIssuesByAuthor(unknown)).resolves.toEqual([]);
    });

    it("respects the time window: returned items have timestamps inside [since, until]", async () => {
      const port = await factory();
      const r = await port.fetchCommitsByAuthor({
        author: "alice",
        ...WINDOW,
      });
      for (const c of r) {
        expect(c.authoredAt >= WINDOW.since).toBe(true);
        expect(c.authoredAt <= WINDOW.until).toBe(true);
      }
    });
  });
}

function assertCommitShape(c: GitHubCommit): void {
  expect(typeof c.sha).toBe("string");
  expect(typeof c.message).toBe("string");
  expect(typeof c.authoredAt).toBe("string");
  expect(typeof c.author).toBe("string");
  expect(typeof c.repo).toBe("string");
  if (c.prNumber !== undefined) expect(typeof c.prNumber).toBe("number");
}

function assertPrShape(p: GitHubPullRequest): void {
  expect(typeof p.number).toBe("number");
  expect(typeof p.title).toBe("string");
  expect(["open", "closed", "merged"]).toContain(p.state);
  expect(typeof p.createdAt).toBe("string");
  expect(typeof p.author).toBe("string");
  expect(typeof p.repo).toBe("string");
}

function assertIssueShape(i: GitHubIssue): void {
  expect(typeof i.number).toBe("number");
  expect(typeof i.title).toBe("string");
  expect(["open", "closed"]).toContain(i.state);
  expect(typeof i.createdAt).toBe("string");
  expect(typeof i.author).toBe("string");
  expect(typeof i.repo).toBe("string");
  expect(Array.isArray(i.labels)).toBe(true);
}

function assertTimestampInWindow(
  ts: string,
  win: { since: string; until: string }
): void {
  expect(ts >= win.since).toBe(true);
  expect(ts <= win.until).toBe(true);
}

export { InMemoryGitHubActivityPort } from "../github-activity-port-inmemory.js";
