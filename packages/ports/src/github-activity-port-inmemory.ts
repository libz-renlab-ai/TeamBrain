import type {
  FetchByAuthorOptions,
  GitHubActivityPort,
  GitHubCommit,
  GitHubIssue,
  GitHubPullRequest,
} from "./github-activity-port.js";

/**
 * In-memory reference implementation of GitHubActivityPort.
 *
 * Lives outside `__tests__/` so production CLI code can import it without
 * pulling vitest into the runtime closure (contract files import vitest
 * at the top level, which is fine for tests but breaks `tsx bin.ts` at
 * runtime).
 *
 * Adapter tests and core unit tests reuse this fixture for deterministic,
 * IO-free runs.
 */
export class InMemoryGitHubActivityPort implements GitHubActivityPort {
  constructor(
    private readonly fixture: {
      commits: GitHubCommit[];
      pullRequests: GitHubPullRequest[];
      issues: GitHubIssue[];
    }
  ) {}

  async fetchCommitsByAuthor(
    opts: FetchByAuthorOptions
  ): Promise<GitHubCommit[]> {
    return this.fixture.commits.filter(
      (c) =>
        c.author === opts.author &&
        c.authoredAt >= opts.since &&
        c.authoredAt <= opts.until &&
        (opts.project === undefined || c.repo === opts.project)
    );
  }

  async fetchPullRequestsByAuthor(
    opts: FetchByAuthorOptions
  ): Promise<GitHubPullRequest[]> {
    return this.fixture.pullRequests.filter(
      (p) =>
        p.author === opts.author &&
        p.createdAt >= opts.since &&
        p.createdAt <= opts.until &&
        (opts.project === undefined || p.repo === opts.project)
    );
  }

  async fetchIssuesByAuthor(
    opts: FetchByAuthorOptions
  ): Promise<GitHubIssue[]> {
    return this.fixture.issues.filter(
      (i) =>
        i.author === opts.author &&
        i.createdAt >= opts.since &&
        i.createdAt <= opts.until &&
        (opts.project === undefined || i.repo === opts.project)
    );
  }
}
