import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildUserLevelHookCommand } from "../lib/user-level-hook-shim.js";

/**
 * Round-2 F2: CPU-friendly sync sleep. The previous busy-wait
 * `while (Date.now() < until)` loop pegged a core at 100% during contention.
 * We delegate to the OS `sleep` / `timeout` command via `execSync` so the
 * caller-thread is parked instead. Falls back to busy-wait only if the OS
 * binary is missing.
 */
function sleepSync(ms: number): void {
  try {
    if (process.platform === "win32") {
      // Windows `timeout` only supports whole-second granularity. We always
      // wait at least 1 second when called for SLEEP_MS=200; that's still
      // bounded and CPU-free.
      execSync(`timeout /t 1 /nobreak`, { stdio: "ignore", windowsHide: true });
    } else {
      execSync(`sleep ${(ms / 1000).toFixed(2)}`, { stdio: "ignore" });
    }
  } catch {
    // Last-resort busy wait if /usr/bin/sleep / timeout is unavailable.
    const until = Date.now() + ms;
    while (Date.now() < until) {
      // spin
    }
  }
}

const HOOK_TAG = "teamagent-pre-tool-use";
const POST_HOOK_TAG = "teamagent-post-tool-use";
const USER_PROMPT_TAG = "teamagent-user-prompt-submit";
const STOP_HOOK_TAG   = "teamagent-stop";
const STATUS_LINE_TAG = "teamagent-statusline";
// B+C scope (2026-05-09): four new channels folded into installHook.
// SessionStart and DigitalTwinTap are user-level only (see channelOps and
// `installHook` body for rationale); SessionEnd / PreCompact write to both
// project and user-level settings like the existing four.
const SESSION_START_TAG = "teamagent-session-start";
const SESSION_END_TAG   = "teamagent-session-end";
const PRE_COMPACT_TAG   = "teamagent-pre-compact";
const DIGITAL_TWIN_TAG  = "teamagent-digital-twin-tap";

export interface InstallHookOptions {
  cwd?: string;
  /** 显式指定 PreToolUse hook 入口绝对路径 */
  hookEntry?: string;
  /** 显式指定 PostToolUse hook 入口绝对路径 */
  postHookEntry?: string;
  /** 显式指定 UserPromptSubmit hook 入口绝对路径 */
  userPromptEntry?: string;
  /** 显式指定 Stop hook 入口绝对路径 */
  stopEntry?: string;
  /** 显式指定 statusLine 脚本入口绝对路径 */
  statusLineEntry?: string;
  /** 显式指定 SessionStart hook 入口绝对路径（user-level only） */
  sessionStartEntry?: string;
  /** 显式指定 SessionEnd hook 入口绝对路径 */
  sessionEndEntry?: string;
  /** 显式指定 PreCompact hook 入口绝对路径 */
  preCompactEntry?: string;
  /** 显式指定 digital-twin-tap Stop hook 入口绝对路径（user-level only） */
  digitalTwinEntry?: string;
  /**
   * Issue #146 install-hook TODO — 显式指定 digital-twin daemon 二进制
   * `bin-uploader.cjs` 的源路径。Default: `<cliRoot>/../digital-twin/dist/
   * bin-uploader.cjs` (monorepo 布局，与 `resolveDaemonBin` 一致)。install-hook
   * 把它复制到 `<homeDir>/.teamagent/digital-twin/bin-uploader.cjs`，承担起
   * 之前由 Stop hook 首次启动时 `resolveDaemonBin` self-install 兜底的 upgrade
   * 路径。
   */
  daemonBinaryEntry?: string;
  /** 显式指定 user-level home（默认 os.homedir()）。测试用。 */
  homeDir?: string;
  /**
   * Issue #161 — Layer 1 viral install. When `true` (default), additionally
   * write the same TeamAgent hook entries (PreToolUse / PostToolUse /
   * UserPromptSubmit / Stop) into `<homeDir>/.claude/settings.json` so
   * Claude Code launched from any cwd (including sub-directories of an
   * already-initialized project) registers the project's hooks. The
   * project-level write to `<cwd>/.claude/settings.local.json` is unchanged
   * either way. When `false`, behaviour is unchanged from before #161.
   */
  userLevel?: boolean;
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookEntry[];
    PostToolUse?: HookEntry[];
    UserPromptSubmit?: HookEntry[];
    Stop?: HookEntry[];
    [k: string]: unknown;
  };
  statusLine?: {
    type?: string;
    command?: string;
    _teamagentTag?: string;
    /** 用户原 statusLine.command 字面值（issue #104：chain wrap 备份用） */
    _teamagentOriginalCommand?: string;
    /** 用户原 statusLine.type（默认 "command"） */
    _teamagentOriginalType?: string;
    /** 备份来源：user = ~/.claude/settings.json；project = 当前 settings.local.json */
    _teamagentOriginalScope?: "user" | "project";
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
  /** TeamAgent 标签，用于卸载识别（自定义字段，settings.json 不要求）*/
  _teamagentTag?: string;
}

interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

/**
 * Issue #299: exported so `teamagent doctor` can resolve the same dist root
 * the install pipeline uses when walking the install table. Behaviour unchanged.
 */
export function cliRoot(): string {
  // 从当前文件位置向上走，找到包含 dist/bin-pre-tool-use.cjs 的目录。
  // - Dev (source, tsx):  .../packages/cli/src/commands/install-hook.ts
  //                       → .../packages/cli/
  // - Bundled (npm):      .../node_modules/teamagent/dist/bin.js
  //                       → .../node_modules/teamagent/
  // 旧实现硬编码"退 3 层"，在 bundle 模式退到 node_modules/，
  // 再拼 "dist/bin-stop.cjs" 得到 node_modules/dist/bin-stop.cjs（不存在）。
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "dist", "bin-pre-tool-use.cjs"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 兜底：bundle 时总是 dist/bin.js → 上一级就是包根
  return path.dirname(path.dirname(here));
}

function defaultHookEntry(): string {
  return path.join(cliRoot(), "dist", "bin-pre-tool-use.cjs");
}

function defaultPostHookEntry(): string {
  return path.join(cliRoot(), "dist", "bin-post-tool-use.cjs");
}

// B+C scope: default entry paths for the four newly-wired channels. Each one
// is best-effort — if the .cjs is missing on disk, the channel is silently
// skipped at install time (existing pattern; see `hasPostBundle` etc.). This
// preserves backward compatibility for builds that haven't run `pnpm build`
// for the new bundles yet.
function defaultSessionStartEntry(): string {
  return path.join(cliRoot(), "dist", "bin-session-start.cjs");
}

function defaultSessionEndEntry(): string {
  return path.join(cliRoot(), "dist", "bin-session-end.cjs");
}

function defaultPreCompactEntry(): string {
  return path.join(cliRoot(), "dist", "bin-pre-compact.cjs");
}

function defaultDigitalTwinEntry(): string {
  return path.join(cliRoot(), "dist", "bin-digital-twin-tap.cjs");
}

/**
 * Issue #146 install-hook TODO — default source path for `bin-uploader.cjs`
 * (the digital-twin uploader daemon spawned by `bin-digital-twin-tap.cjs`).
 *
 * Issue #368 (v0.11.1) — now resolves to `<cliRoot>/dist/bin-uploader.cjs`,
 * the same dist directory the other staged hook bins come from. Previously
 * this pointed at `<cliRoot>/../digital-twin/dist/bin-uploader.cjs`, which
 * exists only in a monorepo checkout: in the published tarball there's no
 * sibling `digital-twin` package, so `stageDaemonBinaryToUser` silently
 * no-op'd ("source missing") and `resolveDaemonBin`'s monorepo fallback
 * (also pointing at a non-existent path) returned null. Net effect on
 * every curl-installed machine: zero uploads, no error.
 *
 * Fix flow:
 *   1. teamagent tsup.config (release tarball) builds bin-uploader.cjs into
 *      packages/teamagent/dist → tarball ships it at <install>/dist/.
 *   2. cli tsup.hook.config (monorepo dev) builds bin-uploader.cjs into
 *      packages/cli/dist → matches cliRoot() walk-up in dev.
 *   3. defaultDaemonBinaryEntry returns <cliRoot>/dist/bin-uploader.cjs;
 *      both layouts above land it where this expects.
 */
function defaultDaemonBinaryEntry(): string {
  return path.join(cliRoot(), "dist", "bin-uploader.cjs");
}

/**
 * 把 Windows 反斜杠路径转为正斜杠格式。
 * Git Bash 会吞掉路径里的反斜杠（视为转义），所以 hook command 必须用 /。
 * `C:\path\to\repo` → `C:/path/to/repo`
 */
function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * B-091: stage a bundle from `<srcDistPath>` (e.g. node_modules/teamagent/dist/bin-*.cjs)
 * to a stable user-owned location at `<homeDir>/.teamagent/hooks/<basename>`.
 *
 * Why: the user-level `~/.claude/settings.json` is shared across every project
 * on the machine. If we wrote the literal `node_modules/.../dist/bin-*.cjs`
 * absolute path into it, then nvm version switches, npm reinstalls, worktree
 * cleanups (e.g. `/private/tmp/<repo>` deleted), or "last init from a
 * different project replaces my command" all silently brick TeamAgent hooks
 * for every project on the machine.
 *
 * Pattern mirrors `installUserHook` (sibling B-091 implementation):
 * 1. compute dest = <homeDir>/.teamagent/hooks/<basename(srcDistPath)>
 * 2. mkdir -p the parent dir
 * 3. copyFileSync the bundle (overwrite existing — fresh bundle on each install)
 * 4. return dest
 */
/**
 * Issue #146 install-hook TODO — stage `bin-uploader.cjs` to the
 * user-level digital-twin location managed by `resolveDaemonBin`. Pattern
 * mirrors `stageBundleToUserTeamagent` (skip-if-newer + atomic tmp+rename)
 * but writes to `<homeDir>/.teamagent/digital-twin/bin-uploader.cjs`
 * instead of `<homeDir>/.teamagent/hooks/<bundle>`.
 *
 * Best-effort:
 * - Source missing (digital-twin not built in this worktree) → no-op,
 *   returns staged=false with a reason. install-hook continues. The Stop
 *   hook's `resolveDaemonBin` runtime self-install still picks up the
 *   binary on first daemon spawn from the monorepo dist path.
 * - Copy failure (Windows EBUSY, EPERM, EXDEV) → returns staged=false
 *   with reason; same recovery story as source-missing.
 *
 * Returns a structured result so the caller (and tests) can assert on
 * the outcome without having to inspect the filesystem.
 */
export interface DaemonStagingResult {
  staged: boolean;
  destPath: string;
  reason?: string;
}

export function stageDaemonBinaryToUser(
  srcDistPath: string,
  homeDir: string,
): DaemonStagingResult {
  const dest = path.join(homeDir, ".teamagent", "digital-twin", "bin-uploader.cjs");
  if (!fs.existsSync(srcDistPath)) {
    return {
      staged: false,
      destPath: dest,
      reason: `daemon binary source missing: ${srcDistPath} (build with pnpm --filter @teamagent/digital-twin build)`,
    };
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  // Skip-if-newer: same heuristic as stageBundleToUserTeamagent — avoids
  // pointless I/O on every install AND avoids racing concurrent daemon
  // processes that already loaded the staged binary.
  try {
    const srcStat = fs.statSync(srcDistPath);
    const destStat = fs.statSync(dest);
    if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
      return { staged: true, destPath: dest, reason: "already up-to-date (skip-if-newer)" };
    }
  } catch {
    // dest missing — fall through to the copy.
  }

  // Atomic copy via tmp + rename — protects against in-flight daemon
  // process reading a half-written .cjs on Unix and against Windows EBUSY
  // when the previous daemon's copy is still mapped.
  const tmp = `${dest}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    fs.copyFileSync(srcDistPath, tmp);
    fs.renameSync(tmp, dest);
    return { staged: true, destPath: dest };
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // best-effort cleanup
    }
    return {
      staged: false,
      destPath: dest,
      reason: `daemon binary copy failed: ${(err as Error).message ?? String(err)}`,
    };
  }
}

function stageBundleToUserTeamagent(srcDistPath: string, homeDir: string): string {
  const dest = path.join(homeDir, ".teamagent", "hooks", path.basename(srcDistPath));
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  // Round-2 F3: skip the copy if the destination already contains the same
  // bytes — same size + dest mtime is at-least-as-new as src. Avoids
  // pointless I/O on every init AND avoids racing with concurrent hook
  // processes that already loaded the staged bundle. (rsync-style heuristic.)
  try {
    const srcStat = fs.statSync(srcDistPath);
    const destStat = fs.statSync(dest);
    if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
      return dest;
    }
  } catch {
    // dest missing or unreadable — fall through to the copy below.
  }

  // Round-2 F3: atomic copy via tmp + rename. On Windows an unconditional
  // copyFileSync over an in-use bundle throws EBUSY and crashes init; on
  // Unix an in-flight hook process can otherwise see a half-written file.
  // rename(2) is atomic on POSIX and very-near-atomic on NTFS.
  const tmp = `${dest}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    fs.copyFileSync(srcDistPath, tmp);
    fs.renameSync(tmp, dest);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
  return dest;
}

/**
 * B-086: judge whether a hook entry belongs to TeamAgent for a given channel.
 *
 * Dual signal — mirrors `install-user-hook.ts:isTeamagentSessionStartEntry`:
 * - Strong: `_teamagentTag` is present (any TeamAgent-tagged entry, covers
 *   both old and new tagging schemes).
 * - Heuristic: `entry.hooks[*].command` contains the channel's bundle
 *   filename (e.g. `bin-pre-tool-use.cjs`). These filenames are TeamAgent-
 *   specific and unlikely to collide with foreign hooks.
 *
 * Used in `applyChannelOps` so re-installing on top of an upgraded user
 * who already has untagged-legacy TeamAgent entries doesn't double-fire.
 */
type HookChannel =
  | "PreToolUse"
  | "PostToolUse"
  | "UserPromptSubmit"
  | "Stop"
  | "SessionStart"
  | "SessionEnd"
  | "PreCompact";

// Bundle filenames for each channel. Stop has TWO bundles (bin-stop +
// bin-digital-twin-tap); the heuristic detects either as TeamAgent-owned so
// re-install dedup catches both flavours. New bundles added 2026-05-09 (B+C).
const CHANNEL_BUNDLE_FILENAMES: Record<HookChannel, readonly string[]> = {
  PreToolUse: ["bin-pre-tool-use.cjs"],
  PostToolUse: ["bin-post-tool-use.cjs"],
  UserPromptSubmit: ["bin-user-prompt-submit.cjs"],
  Stop: ["bin-stop.cjs", "bin-digital-twin-tap.cjs"],
  SessionStart: ["bin-session-start.cjs"],
  SessionEnd: ["bin-session-end.cjs"],
  PreCompact: ["bin-pre-compact.cjs"],
};

function isTeamagentEntry(entry: HookEntry, channel: HookChannel): boolean {
  if (entry._teamagentTag) return true;
  const filenames = CHANNEL_BUNDLE_FILENAMES[channel];
  const cmds = entry.hooks?.map((c) => c.command ?? "") ?? [];
  return cmds.some((c) => filenames.some((f) => c.includes(f)));
}

/**
 * v0.11.0 channelOps unification — declarative source for every TeamAgent
 * hook channel write. Both project-level (`installHook`'s body) and user-level
 * (`applyUserLevelChannelOps`) consume this list via `applyChannelOps` so the
 * registration logic lives in exactly one place.
 *
 * `scopes` is the controlled distinction:
 * - "project" only — none today; project-level skips SessionStart and
 *   digital-twin-tap because both are whole-machine concerns.
 * - "user" only — `SessionStart` (whole-machine SessionStart auto-init)
 *   and the second `Stop` op (`bin-digital-twin-tap.cjs`).
 * - "both" — the four shared channels (PreToolUse / PostToolUse /
 *   UserPromptSubmit / Stop@bin-stop) plus SessionEnd / PreCompact.
 *
 * `Stop` appears twice intentionally — `bin-stop.cjs` (learning pipeline)
 * and `bin-digital-twin-tap.cjs` (digital-twin tap). The `CHANNEL_BUNDLE_FILENAMES`
 * map already accounts for the dual-bundle channel.
 */
type ChannelDef = {
  readonly channel: HookChannel;
  readonly tag: string;
  readonly bundleFilename: string;
  readonly matcher?: string;
  readonly timeout: number;
  readonly scopes: ReadonlyArray<"project" | "user">;
};

// Issue #299: exported so `teamagent doctor` (and unit tests asserting tsup
// build entries) can iterate the install table without duplicating the
// channel definitions. Treat as read-only.
export const ALL_CHANNELS: ReadonlyArray<ChannelDef> = [
  { channel: "PreToolUse",       tag: HOOK_TAG,           bundleFilename: "bin-pre-tool-use.cjs",       matcher: "Bash|Write|Edit|WebFetch", timeout: 30, scopes: ["project", "user"] },
  { channel: "PostToolUse",      tag: POST_HOOK_TAG,      bundleFilename: "bin-post-tool-use.cjs",      matcher: "Bash|Write|Edit|WebFetch", timeout: 30, scopes: ["project", "user"] },
  { channel: "UserPromptSubmit", tag: USER_PROMPT_TAG,    bundleFilename: "bin-user-prompt-submit.cjs",                                       timeout: 10, scopes: ["project", "user"] },
  { channel: "Stop",             tag: STOP_HOOK_TAG,      bundleFilename: "bin-stop.cjs",                                                     timeout: 60, scopes: ["project", "user"] },
  { channel: "SessionEnd",       tag: SESSION_END_TAG,    bundleFilename: "bin-session-end.cjs",                                              timeout: 30, scopes: ["project", "user"] },
  { channel: "PreCompact",       tag: PRE_COMPACT_TAG,    bundleFilename: "bin-pre-compact.cjs",                                              timeout: 30, scopes: ["project", "user"] },
  // user-level only. SessionStart is whole-machine semantics (the SessionStart
  // hook auto-inits any project's knowledge.db). digital-twin-tap stays
  // user-level too so v0.11's removal of digital-twin-tap.sh from committed
  // .claude/settings.json doesn't reintroduce a project-level double-tap.
  { channel: "SessionStart",     tag: SESSION_START_TAG,  bundleFilename: "bin-session-start.cjs",                                            timeout: 10, scopes: ["user"] },
  { channel: "Stop",             tag: DIGITAL_TWIN_TAG,   bundleFilename: "bin-digital-twin-tap.cjs",                                         timeout: 5,  scopes: ["user"] },
];

/**
 * Issue #299: each install-table entry resolved to its expected absolute
 * dist path. `teamagent doctor` walks this and `existsSync`s each `absPath`
 * to verify the released tarball actually shipped every bundle declared by
 * `ALL_CHANNELS`. The silent-skip branch in `applyChannelOps` used to
 * swallow missing bundles entirely, leaving `doctor` and the install command
 * both green while the hook never registered.
 */
export interface InstallTableBundleEntry {
  channel: HookChannel;
  tag: string;
  bundleFilename: string;
  absPath: string;
  scopes: ReadonlyArray<"project" | "user">;
}

export function enumerateInstallTableBundlePaths(): InstallTableBundleEntry[] {
  const root = cliRoot();
  return ALL_CHANNELS.map((def) => ({
    channel: def.channel,
    tag: def.tag,
    bundleFilename: def.bundleFilename,
    absPath: path.join(root, "dist", def.bundleFilename),
    scopes: def.scopes,
  }));
}

const ALL_HOOK_CHANNELS: ReadonlyArray<HookChannel> = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Stop",
  "SessionStart",
  "SessionEnd",
  "PreCompact",
];

/**
 * v0.11.0 channelOps unification — single loop body shared by project-level
 * and user-level hook installation.
 *
 * Behaviour for each `ChannelDef` whose `scopes` include the requested `scope`
 * and whose `channel` is in `channelFilter` (if provided):
 *
 * 1. Strip from `settings.hooks[channel]`:
 *    - any entry whose `_teamagentTag === def.tag` (idempotent re-install of OUR op)
 *    - any UNTAGGED entry that `isTeamagentEntry()` flags for this channel —
 *      B-086 dedup, mirrors the pre-v0.11 user-level behaviour. Project-level
 *      gains this for free; previously project-level only stripped tag-matches.
 *    - PRESERVE entries with a DIFFERENT teamagent tag for the same channel
 *      (Stop hosts both bin-stop and digital-twin-tap; they must coexist).
 *
 * 2. Resolve the bundle path via `resolveBundle(def.bundleFilename)`. An empty
 *    string or a non-existent path means "skip this op" (silent — matches the
 *    pre-v0.11 best-effort pattern).
 *
 * 3. Build the on-disk command:
 *    - scope=project → `node <forwardSlashPath>` (direct dist path; no staging)
 *    - scope=user    → `buildUserLevelHookCommand(stagedPath)` where the bundle
 *                       has been atomically copied to `<homeDir>/.teamagent/hooks/`
 *                       via `stageBundleToUserTeamagent` (with EBUSY fallback to
 *                       the original path).
 *
 * 4. Push the new entry; matchers are added when `def.matcher` is set.
 *
 * 5. After processing all matching ops, drop any channel array that ended up
 *    empty so the resulting JSON shape matches the pre-v0.11 output.
 *
 * The caller is responsible for read+write of the settings file and (for user
 * scope) lock acquisition. This helper is pure mutation of an in-memory
 * `ClaudeSettings`.
 *
 * Contract:
 * - **Idempotent**: repeated calls with the same `(scope, ops, settings,
 *   homeDir)` shape produce the same final settings shape (strip-then-push).
 * - **Lock requirement**: caller MUST hold the user-level settings lock when
 *   `scope === "user"`. Project scope is cwd-scoped and needs no lock.
 * - **Precondition**: `settings.hooks` may be undefined on entry; the helper
 *   creates it. `settings.hooks[channel]` may be undefined or any HookEntry[].
 * - **Postcondition**: `settings.hooks[channel]` is either present with at
 *   least one entry or absent (empty arrays are pruned).
 */
function applyChannelOps(opts: {
  scope: "project" | "user";
  settings: ClaudeSettings;
  resolveBundle: (filename: string) => string;
  homeDir: string;
  channelFilter?: ReadonlySet<HookChannel> | undefined;
}): void {
  const { scope, settings, resolveBundle, homeDir, channelFilter } = opts;
  if (!settings.hooks) settings.hooks = {};

  for (const def of ALL_CHANNELS) {
    if (!def.scopes.includes(scope)) continue;
    if (channelFilter && !channelFilter.has(def.channel)) continue;

    // Strip our-tag entries + untagged-legacy entries. Preserve foreign hooks
    // and entries with a different teamagent tag for the same channel.
    if (settings.hooks[def.channel]) {
      const list = settings.hooks[def.channel] as HookEntry[];
      settings.hooks[def.channel] = list.filter((h) => {
        if (h._teamagentTag === def.tag) return false;
        if (!h._teamagentTag && isTeamagentEntry(h, def.channel)) return false;
        return true;
      });
    }

    const bundlePath = resolveBundle(def.bundleFilename);
    if (!bundlePath || !fs.existsSync(bundlePath)) {
      // Issue #299: previously a silent `continue` — the user-level
      // digital-twin Stop tap was dropped without trace when 0.11.0 shipped
      // without its bundle. Now we emit one stderr line so the user (and
      // CI logs) can see exactly which channel was skipped and why. Install
      // still continues — partial install is better than a hard failure for
      // the cross-version-compat case the silent skip originally guarded
      // against (older dist missing a newer bundle).
      // The strict gate moved to `teamagent doctor` (checkInstallTableBundles),
      // which fails-loud with exit non-zero on any missing install-table bundle.
      process.stderr.write(
        `teamagent: skipping channel ${def.channel} — bundle ${def.bundleFilename} not found\n`,
      );
      continue;
    }

    let command: string;
    if (scope === "user") {
      // Stage to ~/.teamagent/hooks/<filename>; on EBUSY fall back to the
      // in-place dist path so install never breaks the hook entirely.
      let pathForCommand: string;
      try {
        pathForCommand = stageBundleToUserTeamagent(bundlePath, homeDir);
      } catch (err: any) {
        process.stderr.write(
          `teamagent install-hook: failed to stage ${path.basename(bundlePath)} ` +
            `(${err?.code ?? err?.message ?? err}) — falling back to in-place dist path\n`,
        );
        pathForCommand = bundlePath;
      }
      command = buildUserLevelHookCommand(pathForCommand);
    } else {
      command = `node ${shellQuote(toForwardSlash(bundlePath))}`;
    }

    if (!settings.hooks[def.channel]) settings.hooks[def.channel] = [];
    const newEntry: HookEntry = {
      _teamagentTag: def.tag,
      hooks: [{ type: "command", command, timeout: def.timeout }],
    };
    if (def.matcher) newEntry.matcher = def.matcher;
    (settings.hooks[def.channel] as HookEntry[]).push(newEntry);
  }

  // Drop any channels left empty (preserves prior structure when we never
  // had to touch them).
  for (const ch of ALL_HOOK_CHANNELS) {
    const list = settings.hooks[ch] as HookEntry[] | undefined;
    if (Array.isArray(list) && list.length === 0) delete settings.hooks[ch];
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
}

/**
 * Inspect `settings` for a TeamAgent-owned entry on `channel` matching `tag`,
 * including untagged-legacy entries that point at the channel's bundle
 * filename. Used to derive `alreadyInstalled` BEFORE `applyChannelOps`
 * strips and re-pushes the entry.
 *
 * Exported so the soft-retired `installUserHook` shim (and any future caller
 * that needs the same "did we already register this channel?" predicate)
 * can reuse the exact same dual-signal logic without redefining it locally.
 */
export function hasTeamagentChannelEntry(
  settings: ClaudeSettings,
  channel: HookChannel,
  tag: string,
): boolean {
  const list = settings.hooks?.[channel] as HookEntry[] | undefined;
  if (!Array.isArray(list)) return false;
  return list.some((h) => {
    if (h._teamagentTag === tag) return true;
    if (!h._teamagentTag && isTeamagentEntry(h, channel)) return true;
    return false;
  });
}

/**
 * v0.11.0 — high-level user-level install entry point. Acquires the
 * settings.json lock, reads + applyChannelOps + writes the user-level
 * settings file. Used by both `installHook(userLevel:true)` (the main
 * path) and the soft-retired `installUserHook` shim
 * (with `channelFilter: ["SessionStart"]`).
 *
 * `entries` is a partial map: missing keys cause those channels to be
 * silently skipped (matches the pre-v0.11 best-effort behaviour).
 */
export function applyUserLevelChannelOps(
  homeDir: string,
  entries: Partial<{
    hookEntry: string;
    postHookEntry: string;
    userPromptEntry: string;
    stopEntry: string;
    sessionStartEntry: string;
    sessionEndEntry: string;
    preCompactEntry: string;
    digitalTwinEntry: string;
  }>,
  opts: { channelFilter?: ReadonlyArray<HookChannel> } = {},
): void {
  const userSettingsPath = path.join(homeDir, ".claude", "settings.json");

  const filenameToPath: Record<string, string | undefined> = {
    "bin-pre-tool-use.cjs":      entries.hookEntry,
    "bin-post-tool-use.cjs":     entries.postHookEntry,
    "bin-user-prompt-submit.cjs": entries.userPromptEntry,
    "bin-stop.cjs":              entries.stopEntry,
    "bin-session-start.cjs":     entries.sessionStartEntry,
    "bin-session-end.cjs":       entries.sessionEndEntry,
    "bin-pre-compact.cjs":       entries.preCompactEntry,
    "bin-digital-twin-tap.cjs":  entries.digitalTwinEntry,
  };

  const channelFilter = opts.channelFilter
    ? new Set<HookChannel>(opts.channelFilter)
    : undefined;

  const { fd, lockPath } = acquireSettingsLock(homeDir);
  try {
    const settings = readSettings(userSettingsPath);
    applyChannelOps({
      scope: "user",
      settings,
      resolveBundle: (filename) => filenameToPath[filename] ?? "",
      homeDir,
      channelFilter,
    });
    writeSettings(userSettingsPath, settings);
  } finally {
    releaseSettingsLock(fd, lockPath);
  }
}

function readSettings(file: string): ClaudeSettings {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, "utf-8").trim();
  if (!raw) return {};
  // B-fix #2: malformed settings.json from any external tool should not abort
  // init. Back up the corrupt file (preserve the user's accident-recoverable
  // copy) and start fresh from `{}`. Logged once to stderr so the user knows.
  try {
    return JSON.parse(raw) as ClaudeSettings;
  } catch (err) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const bak = `${file}.bak-${ts}`;
    try {
      fs.copyFileSync(file, bak);
    } catch {
      // best-effort backup; if even copy fails we still proceed with {}
    }
    process.stderr.write(
      `teamagent install-hook: ${file} malformed; backed up to ${bak}; starting fresh\n`,
    );
    return {};
  }
}

/**
 * Round-2 F5: cap the number of `<file>.bak-<ts>` siblings on disk so 100
 * `teamagent init` runs don't leave 200 stale backups (each potentially
 * containing user secrets / paths) lying around forever. We keep the newest
 * `RETENTION_BACKUPS` per file and prune everything older.
 */
const RETENTION_BACKUPS = 5;

function safeMtime(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * List `.bak-<ts>` siblings of `file` sorted newest-first by mtime. Shared
 * helper for both pruning (older entries trimmed) and lookup (the soft-retired
 * `installUserHook` shim needs the freshest backup to populate its
 * `backupPath` return field). Keeping the listing in one place ties it to the
 * `.bak-<ts>` naming convention `writeSettings` writes — change one, change
 * the other together.
 */
function listSettingsBackups(
  file: string,
): ReadonlyArray<{ name: string; mtimeMs: number }> {
  const dir = path.dirname(file);
  const base = path.basename(file);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.startsWith(`${base}.bak-`))
    .map((e) => ({ name: e, mtimeMs: safeMtime(path.join(dir, e)) }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Locate the most recent `.bak-<timestamp>` sibling of `file`. Returns the
 * absolute path, or null when no backups exist. Exported so the soft-retired
 * `installUserHook` shim can populate its `backupPath` return field without
 * reimplementing the listing logic.
 */
export function findMostRecentSettingsBackup(file: string): string | null {
  const baks = listSettingsBackups(file);
  const newest = baks[0];
  return newest ? path.join(path.dirname(file), newest.name) : null;
}

function pruneOldBackups(file: string): void {
  const baks = listSettingsBackups(file);
  // We're about to create one more backup. Keep the newest
  // (RETENTION_BACKUPS - 1) and let that new one round us up to
  // RETENTION_BACKUPS total.
  const dir = path.dirname(file);
  for (const old of baks.slice(RETENTION_BACKUPS - 1)) {
    try {
      fs.unlinkSync(path.join(dir, old.name));
    } catch {
      // best-effort
    }
  }
}

function writeSettings(file: string, settings: ClaudeSettings): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // B-fix #2/#7: always take a `.bak-<ts>` backup of an existing file before
  // overwriting (timestamp avoids clobbering prior backups), then write atomically
  // via tmp + POSIX rename. This makes SIGINT, disk-full, and concurrent-init
  // races non-corrupting: either the old file or the new file is on disk, never
  // a half-written file.
  if (fs.existsSync(file)) {
    // Round-2 F5: prune old `.bak-*` siblings BEFORE creating a new one so
    // the on-disk count stays bounded at RETENTION_BACKUPS.
    pruneOldBackups(file);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const bak = `${file}.bak-${ts}`;
    try {
      fs.copyFileSync(file, bak);
    } catch {
      // best-effort backup
    }
  }

  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, file);
}

/**
 * Concurrent-init advisory lock for user-level `~/.claude/settings.json`.
 *
 * Two `teamagent init` runs from different projects can race on the
 * read-modify-write window and lose one's write. Default `userLevel:true`
 * raises the collision rate.
 *
 * Strategy:
 * - exclusive create (`fs.openSync(lockPath, 'wx')`)
 * - on EEXIST: stale-detect (mtime > 30s → unlink + retry once); otherwise
 *   busy-wait 200ms × up to 5 retries
 * - degrade gracefully: if all retries exhausted, log a warning and proceed
 *   anyway — never block init forever
 *
 * Caller must always call `releaseSettingsLock(fd, lockPath)` in finally.
 */
function acquireSettingsLock(homeDir: string): { fd: number | null; lockPath: string } {
  const lockPath = path.join(homeDir, ".claude", ".settings.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const STALE_MS = 30_000;
  const MAX_RETRIES = 5;
  const SLEEP_MS = 200;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      return { fd, lockPath };
    } catch (err: any) {
      if (err?.code !== "EEXIST") {
        // Unexpected — degrade and proceed
        process.stderr.write(
          `teamagent install-hook: settings lock open failed (${err?.code ?? err}); proceeding without lock\n`,
        );
        return { fd: null, lockPath };
      }
      // Stale-detect
      try {
        const st = fs.statSync(lockPath);
        const age = Date.now() - st.mtimeMs;
        if (age > STALE_MS) {
          try {
            fs.unlinkSync(lockPath);
          } catch {
            // someone else may have unlinked; loop will retry
          }
          continue;
        }
      } catch {
        // statSync failed — lockfile vanished between EEXIST and stat; retry
        continue;
      }
      if (attempt === MAX_RETRIES) {
        process.stderr.write(
          `teamagent install-hook: settings lock contention at ${lockPath} after ${MAX_RETRIES} retries; proceeding without lock\n`,
        );
        return { fd: null, lockPath };
      }
      // Round-2 F2: CPU-friendly sync sleep — defers to OS `sleep` / `timeout`
      // via execSync so we don't burn a core while waiting. installHook is
      // sync and can't be ported to async without ripping the public API.
      sleepSync(SLEEP_MS);
    }
  }
  return { fd: null, lockPath };
}

function releaseSettingsLock(fd: number | null, lockPath: string): void {
  // Round-2 F1: only unlink the lockfile if we actually own it (fd !== null).
  // The degraded path in `acquireSettingsLock` returns fd=null when MAX_RETRIES
  // is exhausted — at that point the lockfile is still held by another process.
  // Unconditionally unlinking it would defeat mutual exclusion entirely.
  if (fd === null) return;
  try {
    fs.closeSync(fd);
  } catch {
    // best-effort
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // best-effort — another process may have already unlinked
  }
}

/**
 * 把 TeamAgent PreToolUse hook 注册到 .claude/settings.local.json。
 * 用 settings.local.json 而非 settings.json 是因为：
 * - settings.local.json 是用户机器本地配置（Claude Code 约定不入 git）
 * - 入 git 的话每次提交都会带上 hook 引用，跨开发者不一致
 *
 * 重复安装是幂等的。
 */
export function installHook(opts: InstallHookOptions = {}): {
  settingsPath: string;
  hookEntry: string;
  postHookEntry: string;
  alreadyInstalled: boolean;
  postAlreadyInstalled: boolean;
  /** issue #104 起含义变更：true = statusLine bundle 缺失（极少发生）。
   *  用户已有 statusLine 时不再 skip，而是 chain wrap，见 statusLineMergedScope。 */
  statusLineSkipped: boolean;
  /** issue #104：本次 install 把哪一层用户 statusLine wrap 进了 chain；
   *  null = 用户原本就没有 statusLine，TeamBrain 独占 */
  statusLineMergedScope: "user" | "project" | null;
  /**
   * Issue #146 install-hook TODO — outcome of staging `bin-uploader.cjs`
   * into `<homeDir>/.teamagent/digital-twin/`. Best-effort: when staging
   * fails (source missing / copy error), `staged=false` and `reason`
   * explains why, but installHook itself does NOT throw — the Stop hook's
   * runtime `resolveDaemonBin` self-install path still serves as a safety
   * net so first-time installs without a built digital-twin/dist still
   * upload eventually.
   */
  daemonBinary: DaemonStagingResult;
} {
  const cwd = opts.cwd ?? process.cwd();
  const settingsPath = path.join(cwd, ".claude", "settings.local.json");
  const homeDir = opts.homeDir ?? os.homedir();

  // Resolve every bundle path up front so project + user scopes share the
  // same map. Each resolver is best-effort except for the primary PreToolUse
  // bundle, which is the hard install gate (preserved from pre-v0.11).
  const hookEntry          = opts.hookEntry          ?? defaultHookEntry();
  const postHookEntry      = opts.postHookEntry      ?? defaultPostHookEntry();
  const userPromptEntry    = opts.userPromptEntry    ?? path.join(cliRoot(), "dist", "bin-user-prompt-submit.cjs");
  const stopEntry          = opts.stopEntry          ?? path.join(cliRoot(), "dist", "bin-stop.cjs");
  const sessionStartEntry  = opts.sessionStartEntry  ?? defaultSessionStartEntry();
  const sessionEndEntry    = opts.sessionEndEntry    ?? defaultSessionEndEntry();
  const preCompactEntry    = opts.preCompactEntry    ?? defaultPreCompactEntry();
  const digitalTwinEntry   = opts.digitalTwinEntry   ?? defaultDigitalTwinEntry();
  const statusLineEntry    = opts.statusLineEntry    ?? path.join(cliRoot(), "dist", "teamagent-statusline.cjs");

  // 确认 PreToolUse bundled .cjs 存在
  if (!fs.existsSync(hookEntry)) {
    throw new Error(
      `Hook bundle not found: ${hookEntry}\n` +
        `请先运行: pnpm --filter @teamagent/cli build:hook`,
    );
  }

  const settings = readSettings(settingsPath);

  // Capture pre-strip state for the test-contract `alreadyInstalled` /
  // `postAlreadyInstalled` flags. After v0.11.0 channelOps unification,
  // applyChannelOps strips and re-pushes idempotently — flag detection MUST
  // happen before the call.
  const alreadyInstalled     = hasTeamagentChannelEntry(settings, "PreToolUse",  HOOK_TAG);
  const postAlreadyInstalled = hasTeamagentChannelEntry(settings, "PostToolUse", POST_HOOK_TAG);

  // Single declarative loop replaces the six pre-v0.11 inline blocks
  // (PreToolUse / PostToolUse / UserPromptSubmit / Stop / SessionEnd / PreCompact).
  // Project scope skips SessionStart and digital-twin-tap by ChannelDef.scopes.
  const projectBundleMap: Record<string, string> = {
    "bin-pre-tool-use.cjs":      hookEntry,
    "bin-post-tool-use.cjs":     postHookEntry,
    "bin-user-prompt-submit.cjs": userPromptEntry,
    "bin-stop.cjs":              stopEntry,
    "bin-session-end.cjs":       sessionEndEntry,
    "bin-pre-compact.cjs":       preCompactEntry,
    // SessionStart + digital-twin-tap are not project-level; map entries
    // are harmless because ChannelDef.scopes filters them out anyway.
  };
  applyChannelOps({
    scope: "project",
    settings,
    resolveBundle: (filename) => projectBundleMap[filename] ?? "",
    homeDir,
  });

  // statusLine 注册。CC 只有一个 statusLine 槽位 — 若用户已有 statusLine（user
  // level `~/.claude/settings.json` 或 project level `.claude/settings.local.json`），
  // 把用户 cmd 与 TeamBrain cmd chain 起来：
  //   bash -c '<user_cmd>; echo; <teamagent_cmd>'
  // 中间 echo 让两段输出换行（issue #104）。用户原 cmd 字面值备份到
  // _teamagentOriginalCommand / Type / Scope，便于 uninstall 还原。
  // statusLine is NOT a hook channel — it stays outside applyChannelOps.
  const hasStatusLineBundle = fs.existsSync(statusLineEntry);
  let statusLineSkipped = false;
  let statusLineMergedScope: "user" | "project" | null = null;
  if (hasStatusLineBundle) {
    const teamCmd = `node ${shellQuote(toForwardSlash(statusLineEntry))}`;
    const existing = settings.statusLine;
    const existingIsTagged = existing?._teamagentTag === STATUS_LINE_TAG;
    const existingIsEmpty = !existing || Object.keys(existing).length === 0;

    let userCmd: string | null = null;
    let userType = "command";
    let userScope: "user" | "project" | null = null;

    if (existingIsTagged) {
      // 之前装过 teamagent — 复用上次备份（保留用户原 cmd），idempotent
      const orig = existing?._teamagentOriginalCommand;
      const origType = existing?._teamagentOriginalType;
      const origScope = existing?._teamagentOriginalScope;
      if (typeof orig === "string" && orig.length > 0) {
        userCmd = orig;
        userType = typeof origType === "string" ? origType : "command";
        userScope = origScope === "project" || origScope === "user" ? origScope : null;
      }
    } else if (!existingIsEmpty) {
      // 用户在 project level 自己写过 statusLine — 收编为 project scope 备份
      const cmd = existing?.command;
      const t = existing?.type;
      if (typeof cmd === "string" && cmd.length > 0) {
        userCmd = cmd;
        userType = typeof t === "string" ? t : "command";
        userScope = "project";
      }
    }

    if (!userCmd) {
      // project level 无信号 — 看 user level (~/.claude/settings.json)
      const userLevel = readUserLevelStatusLine(homeDir);
      if (userLevel) {
        userCmd = userLevel.command;
        userType = userLevel.type;
        userScope = "user";
      }
    }

    const newStatusLine: NonNullable<ClaudeSettings["statusLine"]> = {
      type: "command",
      command: buildStatusLineCommand(userCmd, teamCmd),
      _teamagentTag: STATUS_LINE_TAG,
    };
    if (userCmd) {
      newStatusLine._teamagentOriginalCommand = userCmd;
      newStatusLine._teamagentOriginalType = userType;
      newStatusLine._teamagentOriginalScope = userScope ?? "user";
      statusLineMergedScope = userScope;
    }
    settings.statusLine = newStatusLine;
  } else {
    statusLineSkipped = true;
  }

  writeSettings(settingsPath, settings);

  // Issue #161 — Layer 1 viral install. Default `userLevel: true` so Claude
  // Code launched from a sub-directory of an initialized project still has
  // the TeamAgent hooks registered. The user-level write is additive and
  // idempotent — existing TeamAgent-tagged entries are replaced in place,
  // foreign entries are preserved untouched.
  const userLevel = opts.userLevel ?? true;
  if (userLevel) {
    applyUserLevelChannelOps(homeDir, {
      hookEntry,
      postHookEntry,
      userPromptEntry,
      stopEntry,
      sessionStartEntry,
      sessionEndEntry,
      preCompactEntry,
      digitalTwinEntry,
    });
  }

  // Issue #146 install-hook TODO — stage the digital-twin daemon binary
  // (`bin-uploader.cjs`) alongside the hook bundles. The Stop hook
  // (`bin-digital-twin-tap.cjs`) spawns this daemon detached when a session
  // ends; pre-F1 the binary was self-installed lazily at first daemon spawn,
  // which meant `git pull` -> rebuild never picked up changes (you had to
  // delete `~/.teamagent/digital-twin/bin-uploader.cjs` by hand). Folding
  // staging into install-hook makes `teamagent install-hook` upgrade the
  // daemon binary too, mirroring how the hook bundles are kept fresh.
  const daemonBinaryEntry = opts.daemonBinaryEntry ?? defaultDaemonBinaryEntry();
  const daemonBinary = stageDaemonBinaryToUser(daemonBinaryEntry, homeDir);

  return {
    settingsPath,
    hookEntry,
    postHookEntry,
    alreadyInstalled,
    postAlreadyInstalled,
    statusLineSkipped,
    statusLineMergedScope,
    daemonBinary,
  };
}

/**
 * 读 user-level `~/.claude/settings.json` 的 statusLine。返回非 teamagent 自己的
 * 那条；teamagent 自己 tag 过的或文件不存在均返回 null（避免重入嵌套）。
 */
function readUserLevelStatusLine(
  homeDir: string,
): { command: string; type: string } | null {
  const userSettingsPath = path.join(homeDir, ".claude", "settings.json");
  if (!fs.existsSync(userSettingsPath)) return null;
  try {
    const raw = fs.readFileSync(userSettingsPath, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      statusLine?: { command?: string; type?: string; _teamagentTag?: string };
    };
    const sl = parsed.statusLine;
    if (!sl || typeof sl.command !== "string" || sl.command.length === 0) return null;
    if (sl._teamagentTag) return null;
    return { command: sl.command, type: typeof sl.type === "string" ? sl.type : "command" };
  } catch {
    return null;
  }
}

function escapeForBashSingleQuote(s: string): string {
  // POSIX 单引号转义：'foo' bar → 'foo'\''bar'
  return s.replace(/'/g, "'\\''");
}

function buildStatusLineCommand(
  userCmd: string | null,
  teamCmd: string,
): string {
  if (!userCmd) return teamCmd;
  const u = escapeForBashSingleQuote(userCmd);
  const t = escapeForBashSingleQuote(teamCmd);
  // issue #331: Claude Code pipes JSON to stdin of the statusLine.command,
  // and we have **two** segments sharing that pipe. If we naively run
  //   bash -c '<user>; echo; <teamagent>'
  // the first segment's `cat` / `jq` will drain stdin and the second segment
  // sees EOF — so all CC-derived fields (模型/上下文/用量/5h/7d/会话) silently
  // come up empty. Fix: snapshot stdin into a shell variable once at the top
  // of the wrapper, then feed BOTH segments via `printf %s "$_TS_IN" | ...`.
  // No tmpfiles; no fifo; works with the user's existing `input=$(cat)`
  // pattern because each segment still reads from its own stdin.
  return `bash -c '_TS_IN=$(cat); printf "%s" "$_TS_IN" | { ${u}; }; echo; printf "%s" "$_TS_IN" | { ${t}; }'`;
}

/** 移除 TeamAgent hook 注册（PreToolUse + PostToolUse 一并）。 */
export function uninstallHook(opts: { cwd?: string } = {}): {
  settingsPath: string;
  removed: boolean;
} {
  const cwd = opts.cwd ?? process.cwd();
  const settingsPath = path.join(cwd, ".claude", "settings.local.json");

  if (!fs.existsSync(settingsPath)) {
    return { settingsPath, removed: false };
  }

  const settings = readSettings(settingsPath);
  if (!settings.hooks) {
    return { settingsPath, removed: false };
  }

  let removedAny = false;

  if (settings.hooks.PreToolUse) {
    const before = settings.hooks.PreToolUse.length;
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
      (h) => h._teamagentTag !== HOOK_TAG,
    );
    if (settings.hooks.PreToolUse.length !== before) removedAny = true;
    if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
  }

  if (settings.hooks.PostToolUse) {
    const before = settings.hooks.PostToolUse.length;
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
      (h) => h._teamagentTag !== POST_HOOK_TAG,
    );
    if (settings.hooks.PostToolUse.length !== before) removedAny = true;
    if (settings.hooks.PostToolUse.length === 0) delete settings.hooks.PostToolUse;
  }

  if (settings.hooks.UserPromptSubmit) {
    const before = settings.hooks.UserPromptSubmit.length;
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
      (h) => h._teamagentTag !== USER_PROMPT_TAG,
    );
    if (settings.hooks.UserPromptSubmit.length !== before) removedAny = true;
    if (settings.hooks.UserPromptSubmit.length === 0) delete settings.hooks.UserPromptSubmit;
  }

  if (settings.hooks.Stop) {
    const before = settings.hooks.Stop.length;
    // B+C scope (2026-05-09): Stop now hosts both bin-stop and the
    // digital-twin-tap entry — drop both teamagent tags.
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (h) => h._teamagentTag !== STOP_HOOK_TAG && h._teamagentTag !== DIGITAL_TWIN_TAG,
    );
    if (settings.hooks.Stop.length !== before) removedAny = true;
    if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
  }

  // B+C scope (2026-05-09): clean SessionStart/SessionEnd/PreCompact entries
  // too. Project-level rarely has SessionStart (it's user-level only) but we
  // sweep for safety in case a future test or migration writes one.
  for (const [channel, tag] of [
    ["SessionStart", SESSION_START_TAG],
    ["SessionEnd", SESSION_END_TAG],
    ["PreCompact", PRE_COMPACT_TAG],
  ] as const) {
    const list = settings.hooks[channel] as HookEntry[] | undefined;
    if (!Array.isArray(list)) continue;
    const before = list.length;
    const next = list.filter((h) => h._teamagentTag !== tag);
    if (next.length !== before) removedAny = true;
    if (next.length === 0) {
      delete settings.hooks[channel];
    } else {
      settings.hooks[channel] = next;
    }
  }

  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  // statusLine：只有在明确打了 teamagent tag 时才动。issue #104 起 install
  // 会把用户原 cmd 备份到 _teamagentOriginalCommand。卸载策略：
  //   scope=project → 把项目级 statusLine 写回原 {type, command}
  //   scope=user / 缺失 → 直接删项目级条目（用户的 ~/.claude/settings.json
  //     从未被 install 触碰，CC 重新解析时会回到用户级）
  if (settings.statusLine?._teamagentTag === STATUS_LINE_TAG) {
    const orig = settings.statusLine._teamagentOriginalCommand;
    const origType = settings.statusLine._teamagentOriginalType;
    const origScope = settings.statusLine._teamagentOriginalScope;
    if (
      typeof orig === "string" &&
      orig.length > 0 &&
      origScope === "project"
    ) {
      settings.statusLine = {
        type: typeof origType === "string" ? origType : "command",
        command: orig,
      };
    } else {
      delete settings.statusLine;
    }
    removedAny = true;
  }

  writeSettings(settingsPath, settings);
  return { settingsPath, removed: removedAny };
}

function shellQuote(p: string): string {
  // 双引号包装 + 反斜杠转义内部引号；适用于 Windows + bash + Claude Code
  if (/^[A-Za-z0-9_./:\\-]+$/.test(p)) return p;
  return `"${p.replace(/"/g, '\\"')}"`;
}

/**
 * B+C scope (2026-05-09): orphan shell-hook scanner.
 *
 * Scans `<cwd>/.claude/hooks/*.sh` and cross-references each filename against
 * the `command` strings in:
 *   - `<cwd>/.claude/settings.json`        (committed, repo-shipped)
 *   - `<cwd>/.claude/settings.local.json`  (gitignored, per-host)
 *
 * A `.sh` is "orphan" when no command string in either file references its
 * basename. Returns the list of orphan basenames sorted alphabetically.
 *
 * Non-throwing: missing dirs / unreadable files / malformed JSON degrade to
 * "no orphans found"; the caller treats this as a soft warning, not an error.
 *
 * Detection is a substring check on the basename (e.g. `laziness-self-report.sh`)
 * — same heuristic used by `isTeamagentEntry`. False-positive rate is low
 * because shell scripts are generally referenced by full filename, but we
 * deliberately do NOT register orphans automatically. The caller decides
 * whether to warn, fail, or interactively prompt.
 */
export function auditOrphanShellHooks(cwd: string): string[] {
  const hooksDir = path.join(cwd, ".claude", "hooks");
  if (!fs.existsSync(hooksDir)) return [];

  let candidates: string[];
  try {
    candidates = fs
      .readdirSync(hooksDir)
      .filter((f) => f.endsWith(".sh"));
  } catch {
    return [];
  }
  if (candidates.length === 0) return [];

  // Aggregate every `command` string from both settings files.
  const commandStrings: string[] = [];
  for (const settingsFile of [
    path.join(cwd, ".claude", "settings.json"),
    path.join(cwd, ".claude", "settings.local.json"),
  ]) {
    if (!fs.existsSync(settingsFile)) continue;
    try {
      const raw = fs.readFileSync(settingsFile, "utf-8").trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw) as ClaudeSettings;
      if (!parsed.hooks) continue;
      for (const ch of Object.keys(parsed.hooks)) {
        const list = parsed.hooks[ch] as HookEntry[] | undefined;
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
          for (const hookCmd of entry.hooks ?? []) {
            if (typeof hookCmd.command === "string") {
              commandStrings.push(hookCmd.command);
            }
          }
        }
      }
    } catch {
      // malformed json; skip this file
    }
  }

  const orphans = candidates.filter(
    (basename) => !commandStrings.some((c) => c.includes(basename)),
  );
  return orphans.sort();
}
