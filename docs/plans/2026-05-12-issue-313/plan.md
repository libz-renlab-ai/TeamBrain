# Plan — issue #313 auto-update for every user

> Three-section plan per `docs/PLAN-RESEARCH-REPORT.md`:
> (1) task description (2) expected outputs (3) how-to-eval-from-3rd-party-harness.
>
> 锚定 grill 评论：<https://github.com/libz-renlab-ai/TeamBrain/issues/313#issuecomment-4427127475>。
> Issue 已合并 #305（同根因下游症状：用户卡 0.10.1 + statusline 缺 TeamAgent 行）。

## 1. Task description

### Goal (issue author 拍板)

> **每个用户都能自动更新到最新系统**。不分网络（公司 NAT / 移动 / CI）、不分 OS（Windows / Mac / Linux）、不依赖用户主动配置 token / git / proxy。

### 改造方向

抛弃 `api.github.com/repos/.../branches/release` 作为 version-check 数据源（`packages/cli/src/github-api.ts:71` 的 60 req/hr 匿名通道）。换成三层架构：

```
Tier 1 (主路): https://libz-renlab-ai.github.io/TeamBrain/latest.json
              CI 在 release-branch push 时 generate + commit 到 gh-pages
              schema: { version, sha, releasedAt, tarball, generatedBy }
              GitHub Pages → Fastly CDN，无配额、毫秒级

Tier 2 (兜底): https://registry.npmjs.org/teamagent/latest
              Pages 失败时回退。接受 npm latest 滞后 ~1 周（Publish per 10 PRs）
              仅在 Tier 1 挂时触发，普通用户感知不到

Tier 3 (人话): Pages + npm 都失败 → 不再 silent backoff 24h
              SessionStart banner + checkCmd 输出显式提示：
              "查不到新版本（Pages: <reason>, npm: <reason>）。
               可手动: npm i -g teamagent@latest 或等下次启动。
               高级用户: 设 TEAMAGENT_GITHUB_TOKEN 走 5000/hr 认证通道。"
```

### 保留不动

- `PACKAGE_SPEC = github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz` 走静态 CDN，**不打 api.github.com，不消耗 quota**。Install 路径完全不动。
- `fetchRemoteSha` 函数保留（packages/cli/src/github-api.ts），不再用于 version-check，留作未来 install-path SHA pin 或 admin 工具使用。
- ETag/304 + 退避 state field 保留为 disk 兼容字段（旧 state 文件能读），但不再被新的主路触发。
- token 路径保留（`resolveGithubToken`）：用户已自行设了的话仍能 5000/hr 跑。

### 不在范围

- 改 `Publish per 10 PRs` 节奏（另一回事，不动）。
- 改 binary 分发通道（仍 release tarball）。
- 加 `git ls-remote` / CDN proxy 第三条路（grill 决策：三层足够，不引入第三方）。
- 把 PAT 打包进 npm tarball（安全违规）。
- 离线 install / 老版本迁移路径。

## 2. Expected outputs

### A. New helper module
`packages/cli/src/update/fetch-latest.ts` 导出：

```ts
export type FetchLatestSuccess = {
  ok: true;
  version: string;          // semver, e.g. "0.11.5"
  sha?: string;             // optional release-branch HEAD SHA (Pages source 才有)
  source: "pages" | "npm";
};

export type FetchLatestFailureReason =
  | "pages_network" | "pages_5xx" | "pages_404" | "pages_parse" | "pages_timeout"
  | "npm_network"   | "npm_5xx"   | "npm_404"   | "npm_parse"   | "npm_timeout";

export type FetchLatestFailure = {
  ok: false;
  pagesReason: FetchLatestFailureReason;
  pagesMessage: string;
  npmReason: FetchLatestFailureReason;
  npmMessage: string;
};

export type FetchLatestResult = FetchLatestSuccess | FetchLatestFailure;

export interface FetchLatestInput {
  httpsGet?: HttpsGet;      // test injection
  pagesUrl?: string;        // override for tests
  npmUrl?: string;          // override for tests
  userAgent?: string;
  timeoutMs?: number;       // default 10_000
}

export async function fetchLatestVersion(input?: FetchLatestInput): Promise<FetchLatestResult>;
```

行为契约：
- Pages 200 + valid JSON → 立刻返回 `{ ok: true, version, sha?, source: "pages" }`，**不调** npm。
- Pages 任何 failure → 调 npm registry；npm 200 → `{ ok: true, version, source: "npm" }`。
- 两路都 fail → `{ ok: false, pagesReason, pagesMessage, npmReason, npmMessage }`。
- **永不调用 `api.github.com`**。
- 永不抛异常（discriminated result）。

### B. Wire helper into runtime
- `packages/cli/src/updater-logic.ts`：`UpdaterDeps` 加 `fetchLatestVersion()`；`runUpdater` 主路替换：从 SHA 比对改 version 比对（与 `state.last_installed_version` 比；空字符串视为「未装过」total mismatch，触发首次 install）。保留 deprecated `fetchRemoteSha` 字段以便存量测试不破。
- `packages/cli/src/bin-updater.ts`：闭包注入 `fetchLatestVersion`。
- `packages/cli/src/commands/update.ts` `checkCmd`：调用 `fetchLatestVersion`；输出文本从 SHA short 改为 `version` short（`0.11.5 -> 0.11.6` 之类）。

### C. SessionStart Tier 3 banner
- `packages/cli/src/session-start-logic.ts`：当 `last_install_error` 含 `"version-check failed:"` 前缀，触发新 banner（vs 现有 `reinstall_banner` 路径）。文案 v1：

```
⚠️  TeamAgent: 暂时查不到新版本
    Pages: <pagesReason>
    npm: <npmReason>
    建议:
      • 手动: npm i -g teamagent@latest
      • 或等下次启动 (我们会重试)
      • 高级用户: 设 TEAMAGENT_GITHUB_TOKEN 走认证通道
```

### D. CI workflow
- `.github/workflows/release-branch.yml`：新增 step 「Publish latest.json to gh-pages」：

  ```yaml
  - name: Generate latest.json
    run: |
      VERSION=$(node -p "require('./package.json').version")
      SHA=${GITHUB_SHA}
      RELEASED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      cat > latest.json <<EOF
      {
        "version": "$VERSION",
        "sha": "$SHA",
        "releasedAt": "$RELEASED_AT",
        "tarball": "https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz",
        "generatedBy": "github-actions/release-branch.yml@${GITHUB_RUN_ID}"
      }
      EOF
  - name: Publish to gh-pages
    uses: peaceiris/actions-gh-pages@v3
    with:
      github_token: ${{ secrets.GITHUB_TOKEN }}
      publish_dir: ./
      publish_branch: gh-pages
      keep_files: true
      destination_dir: .
  ```

  实际 yaml 调用 + permission + flow 控制按当前 workflow 风格落地（plan 不写死）。

### E. Tests
- `packages/cli/src/__tests__/fetch-latest.test.ts`：8 个场景（matrix `{ pages: 200|5xx|404|timeout|parse } × { npm: not-called | 200 | 5xx }`），verify
  - `httpsGet` 收到的 URL **从不是 `api.github.com`**
  - 成功 case 的 `source` 标记正确
  - 失败 case 的 `pagesReason` + `npmReason` 都填了
- 既有 `packages/cli/src/__tests__/update.test.ts` 适配新 helper（mock 改注入 `fetchLatestVersion` 而非 `fetchRemoteSha`）。

### F. Docs
- `docs/features/auto-update-channel.md`：URL、schema、guarantees、为什么不直接 npm、Tier 3 文案、out-of-scope。
- `CHANGELOG.md` 在 `## Unreleased` 段加一行用户可见描述。

### G. Boris workflow artifacts
- `docs/plans/2026-05-12-issue-313/research.md`（本目录已写）
- `docs/plans/2026-05-12-issue-313/plan.md`（本文件）
- `docs/plans/2026-05-12-issue-313/judge.md`（同目录，下一个 commit 写）
- `docs/plans/2026-05-12-issue-313/report.md`（merge 后 driver 收尾写）

## 3. How-to-eval-from-3rd-party-harness

完整 judge 落地见 `judge.md`。摘要：

### Network capture (V1, must PASS in PR CI)
Fresh 机器、不设 `*_GITHUB_TOKEN`：
1. 装 `teamagent@<本 PR 版本>`。
2. 跑 `teamagent update --check` + 触发 SessionStart hook ×5。
3. mitmproxy / instrumented `https.get` 抓所有 outbound HTTP。
4. **PASS**：0 个请求打 `api.github.com/*` 或 `raw.githubusercontent.com/*`；≥1 个请求打 Pages 或 npm registry；`teamagent update --status` 显示 latest version 正确。

### Volume test (V3, must PASS)
单机 10 分钟连跑 `teamagent update --check` ×200。**PASS**：无任何 rate-limit-shaped 失败。

### Multi-environment matrix (V2, PR review 时手动跑或留 follow-up)
5 种网络环境（direct / corporate proxy / mobile throttle / api-blocked / npm-blocked）分别 PASS V1 主条件。

### Tier 3 readability (V4, PASS-pending until human review)
mock DNS / iptables 制造 Pages + npm 双挂。**PASS**：用户看到的提示包含 ① 失败原因 ② ≥1 条手动恢复路径 ③ 不含 "GitHub anonymous rate limit" 这种内部术语。

LLM-judgeable 三段 JSON dump 与 grep anchor list 在 `judge.md`。

## Operating constraints

- 单 PR ship（不触发 oversized split）。
- 普通 PR，禁 `--draft`。
- PR squash-only merge：`gh pr merge <N> --squash --delete-branch`（user-level memory `feedback_squash_only_merge.md`）。
- `/review` 循环至 PASS（ADR-0007）；PR-PLAN 在 finding 出现时按 `docs/PR-PLAN.md` 在同 branch fix（**禁开 follow-up issue**）。
- POSTPR 三步收尾（`docs/POSTPR.md`）。
- 每个 Write/Edit 后立即原子 commit（CLAUDE.md §开发节奏 + user-level `atomic-commits-on-edit.md`）。

## Risk / Open question

1. **gh-pages 分支首次推送 latest.json 时若 branch 不存在** —— `peaceiris/actions-gh-pages` 默认会创建；但需要确认 repo 设置允许 actions 推 gh-pages（应该 OK，因为 landing page 已经走这条路）。
2. **Tier 3 banner 文案 v1** —— 由 implementer 落地；merge 前 reporter 可改文案。
3. **既有 update.test.ts 单测可能要大改** —— mock 接口从 `fetchRemoteSha` 切到 `fetchLatestVersion`。改动量取决于既有覆盖。
4. **`/review` 可能发现的潜在 finding**：(a) 新 helper 重复了 github-api.ts 的 timeout/safe-resolve 逻辑 → 可抽 shared util；(b) Tier 3 banner 路径与 reinstall_banner 路径有重叠 → 可考虑合并入口；(c) state field 兼容性测试覆盖度。预备在 same-branch fix loop 里处理。
