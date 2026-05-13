/**
 * GitHubActivityPort：抓取 GitHub commits / PRs / issues 给 #372 live
 * inspection 用。
 *
 * 实现约束：
 * - 调用方注入时间窗（since / until ISO8601），Port 不内生 "now"
 *   （Functional Core 原则：时间由 caller 传入，纯函数可测）
 * - 三个方法相互独立；任一返回空数组都合法（adapter 可以只实现部分）
 * - 异常通过 throw 暴露（caller 决定降级）；空响应不抛错
 * - author 字段语义是 GitHub login 或 git author name；adapter 自行决定
 *   如何匹配（gh CLI 用 GitHub login；git log fallback 用 author name）
 * - 不分页参数——adapter 自己处理（gh CLI 默认 30，本 Port 最多需要 100
 *   条；超出 100 的 author activity 已经远超单次 click-time inspection 关
 *   注的窗口）
 */

export interface GitHubCommit {
  sha: string;
  /** 简短消息（first line of commit message） */
  message: string;
  /** ISO 8601 author date */
  authoredAt: string;
  /** GitHub login 或 git author name */
  author: string;
  /** repo slug "owner/repo"（adapter 自行填充） */
  repo: string;
  /** 可选 PR 号（commit 已经 merge 进 PR 的话） */
  prNumber?: number;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601；undefined 表示尚未关闭 */
  closedAt?: string;
  /** ISO 8601；undefined 表示尚未合并 */
  mergedAt?: string;
  author: string;
  repo: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  createdAt: string;
  closedAt?: string;
  author: string;
  repo: string;
  labels: string[];
}

export interface FetchByAuthorOptions {
  /** GitHub login 或 git author name */
  author: string;
  /** repo slug "owner/repo"；undefined 表示当前工作目录的 git remote 推断 */
  project?: string;
  /** ISO 8601 起点（含） */
  since: string;
  /** ISO 8601 终点（含） */
  until: string;
}

export interface GitHubActivityPort {
  fetchCommitsByAuthor(opts: FetchByAuthorOptions): Promise<GitHubCommit[]>;
  fetchPullRequestsByAuthor(
    opts: FetchByAuthorOptions
  ): Promise<GitHubPullRequest[]>;
  fetchIssuesByAuthor(opts: FetchByAuthorOptions): Promise<GitHubIssue[]>;
}
