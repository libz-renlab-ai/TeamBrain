/**
 * Smoke test: lock the contract against the in-memory fake to catch regressions
 * in the contract itself (e.g. if a new assertion is added to the suite but
 * the reference impl no longer satisfies it).
 *
 * Real adapter (gh CLI) re-runs the same suite from
 * `packages/adapters/src/github-activity/__tests__/`.
 */
import { describe } from "vitest";
import type {
  GitHubCommit,
  GitHubPullRequest,
  GitHubIssue,
} from "../github-activity-port.js";
import {
  InMemoryGitHubActivityPort,
  runGitHubActivityPortContract,
} from "./github-activity-port-contract.js";

describe("InMemoryGitHubActivityPort", () => {
  const fixture: {
    commits: GitHubCommit[];
    pullRequests: GitHubPullRequest[];
    issues: GitHubIssue[];
  } = {
    commits: [
      {
        sha: "abc1234",
        message: "fix: typo",
        authoredAt: "2026-05-13T08:00:00Z",
        author: "alice",
        repo: "owner/repo",
        prNumber: 42,
      },
      {
        sha: "def5678",
        message: "feat: add x",
        authoredAt: "2026-05-13T09:30:00Z",
        author: "alice",
        repo: "owner/repo",
      },
      {
        sha: "ghi9999",
        message: "outside window",
        authoredAt: "2025-01-01T00:00:00Z",
        author: "alice",
        repo: "owner/repo",
      },
    ],
    pullRequests: [
      {
        number: 42,
        title: "fix bug",
        state: "merged",
        createdAt: "2026-05-12T12:00:00Z",
        mergedAt: "2026-05-13T09:00:00Z",
        author: "alice",
        repo: "owner/repo",
      },
    ],
    issues: [
      {
        number: 100,
        title: "feature request",
        state: "open",
        createdAt: "2026-05-12T15:00:00Z",
        author: "alice",
        repo: "owner/repo",
        labels: ["enhancement"],
      },
    ],
  };

  runGitHubActivityPortContract(() => new InMemoryGitHubActivityPort(fixture));
});
