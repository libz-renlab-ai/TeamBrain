import type { KnowledgeEntry } from "@teamagent/types";
import { normalizeChannel } from "@teamagent/types";

export interface ToolCallContext {
  toolName: string;
  input: Record<string, unknown>;
}

const ENFORCEMENT_RANK: Record<KnowledgeEntry["enforcement"], number> = {
  block: 3,
  warn: 2,
  suggest: 1,
  passive: 0,
};

/**
 * 给定工具调用上下文 + 规则集，返回命中的规则。
 * 纯函数。性能目标：100 条规则下 <5ms。
 *
 * 匹配规则（Phase 1 关键词版）：
 * 1. 仅 status=active 且 type=avoidance 的规则参与匹配
 * 2. 收集 wrong_pattern（用 `|` 或 `/` 分隔多个候选）作为关键词
 * 3. 把 input 的 command/content/file_path/url/old_string/new_string 拼成文本
 * 4. 大小写不敏感的子串匹配——任一关键词命中即算命中规则
 * 5. scope.file_types/paths 限制：必须匹配才允许命中
 * 6. 命中按 enforcement 降序返回（block 在前）
 */
export function matchRules(
  ctx: ToolCallContext,
  rules: KnowledgeEntry[],
): KnowledgeEntry[] {
  const inputText = extractInputText(ctx);
  const inputTextLower = inputText.toLowerCase();
  const filePath = stringField(ctx.input, "file_path");

  const matches: KnowledgeEntry[] = [];

  for (const rule of rules) {
    if (rule.status !== "active") continue;
    // M3 洞1: 脱钩 type，matcher 真正判的是 "是否有 wrong_pattern"。
    // 原 `rule.type !== "avoidance"` 硬筛把 34 条 type=practice+wrong_pattern 的
    // 规则扫进死角 (其中 11 条 enforcement=block)，分数永不动。
    // 改为只判 wrong_pattern 有无 — type 仅用于 CLAUDE.md 渲染语义。
    if (!rule.wrong_pattern) continue;

    // M4-A: PreToolUse matcher only processes tool-action channel.
    // ai-narrative / user-input / passive-knowledge rules physically cannot
    // fire here — their triggers live in AI output, user prompt, or are
    // abstract principles. Undefined channel (legacy DB rows) treated as
    // tool-action for backward compatibility.
    if (normalizeChannel((rule as any).channel) !== "tool-action") continue;

    if (!checkScope(rule, filePath)) continue;

    const patterns = splitPatterns(rule.wrong_pattern);
    const matched = patterns.some((p) => patternMatches(inputText, inputTextLower, p));
    if (matched) matches.push(rule);
  }

  matches.sort(
    (a, b) =>
      (ENFORCEMENT_RANK[b.enforcement] ?? 0) - (ENFORCEMENT_RANK[a.enforcement] ?? 0),
  );
  return matches;
}

function extractInputText(ctx: ToolCallContext): string {
  const parts: string[] = [];
  for (const key of [
    "command",
    "content",
    "file_path",
    "url",
    "old_string",
    "new_string",
    "pattern",
    "query",
    "prompt",
  ]) {
    const v = ctx.input[key];
    if (typeof v !== "string") continue;
    if (key === "command" && isMetaCommand(v)) {
      // #86 fix: meta-commands carry user-authored prose in quoted args
      // (issue body, commit message). Scan only the command structure +
      // flag names, not the prose. See META_COMMAND_PREFIXES jsdoc.
      parts.push(stripQuotedArgs(v));
    } else {
      parts.push(v);
    }
  }
  return parts.join("\n");
}

/**
 * Meta-commands whose quoted args carry user-authored prose (issue body, commit
 * message, etc.) which should NOT be scanned for wrong_pattern substring hits.
 * Example: `gh issue create --body "moment is bad"` MUST NOT trigger a
 * wrong_pattern: "moment" rule, because the body is documentation/discussion
 * about the rule rather than an actual install of the bad package. See #86.
 *
 * Conservative whitelist — only commands whose primary purpose is authoring
 * text content (issue/pr/release/commit/tag bodies). General Bash commands and
 * `git` subcommands that touch code (e.g. `git apply`, `git checkout`) are NOT
 * exempted; they may legitimately need substring detection inside quoted args.
 */
const META_COMMAND_PREFIXES = [
  "gh issue create",
  "gh issue comment",
  "gh issue edit",
  "gh pr create",
  "gh pr comment",
  "gh pr edit",
  "gh pr review",
  "gh release create",
  "gh release edit",
  "gh repo edit",
  "git commit -m",
  "git commit --message",
  "git tag -m",
  "git tag --message",
  "git notes add -m",
];

function isMetaCommand(command: string): boolean {
  const trimmed = command.trimStart();
  return META_COMMAND_PREFIXES.some((p) => trimmed.startsWith(p));
}

/**
 * Strip the *contents* of single- and double-quoted string literals from `text`,
 * preserving the surrounding quote characters so the command's flag structure
 * remains visible to the matcher. Backslash escapes inside the quotes are
 * honored. Heredocs and bare-word args are untouched — they aren't the
 * false-positive surface this targets.
 */
function stripQuotedArgs(text: string): string {
  return text
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}


function stringField(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === "string" ? v : undefined;
}

/** 切分时丢弃的最小 token 长度。<3 字符的 token（"a"/"to"）会匹配万物，必须排除。 */
const MIN_TOKEN_LENGTH = 3;

function splitPatterns(raw: string): string[] {
  // 只用 `|` 作为多模式分隔。
  // 早期设计也用 `/`，但 `/` 在 unix 路径里太常见，会把 `import a/b/c` 错切成
  // `a`/`b`/`c` 这种短 token，导致规则乱命中。
  // 同样，<3 字符的 token 也会乱命中（"b" 命中 bar.ts、baz.ts、big.zip 等所有含 b 的字符串）。
  // 0 号用户实际使用时踩到这两个坑。
  const tokens = raw
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_TOKEN_LENGTH);
  // 如果切分后没有合格 token，回退为整体匹配（不切分）
  return tokens.length > 0 ? tokens : [raw.trim()];
}

function patternMatches(inputText: string, inputTextLower: string, pattern: string): boolean {
  const token = pattern.trim();
  if (!token) return false;

  // For plain package/API words, avoid substring false positives such as
  // `moment` matching `momentum`. Punctuation-heavy patterns keep substring
  // semantics because they are usually paths, scoped packages, or code snippets.
  if (/^[a-z0-9_-]+$/i.test(token)) {
    return plainTokenMatches(inputTextLower, token.toLowerCase());
  }

  return containsNonExtending(inputTextLower, token.toLowerCase());
}

/**
 * Returns true if `textLower` contains `patternLower` without the match being
 * extended by a letter or digit immediately after it. Only applies when the
 * last char of the pattern is a letter or digit; patterns ending in punctuation
 * (`.`, `(`, `-`, `'`) use plain includes() — e.g. "sk-" and ".removeAt(" work.
 */
function containsNonExtending(textLower: string, patternLower: string): boolean {
  const lastChar = patternLower[patternLower.length - 1] ?? "";
  if (!isLetterOrDigit(lastChar)) {
    return textLower.includes(patternLower);
  }
  let offset = textLower.indexOf(patternLower);
  while (offset !== -1) {
    const afterIdx = offset + patternLower.length;
    const afterChar = afterIdx < textLower.length ? textLower[afterIdx]! : "";
    if (!isLetterOrDigit(afterChar)) return true;
    offset = textLower.indexOf(patternLower, offset + 1);
  }
  return false;
}

function isLetterOrDigit(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 65 && code <= 90)  || // A-Z
    (code >= 48 && code <= 57)     // 0-9
  );
}

function plainTokenMatches(inputTextLower: string, tokenLower: string): boolean {
  let idx = inputTextLower.indexOf(tokenLower);
  while (idx !== -1) {
    const before = idx === 0 ? "" : inputTextLower[idx - 1]!;
    const afterIdx = idx + tokenLower.length;
    const after = afterIdx >= inputTextLower.length ? "" : inputTextLower[afterIdx]!;
    if (!isPlainTokenChar(before) && !isPlainTokenChar(after)) return true;
    idx = inputTextLower.indexOf(tokenLower, idx + 1);
  }
  return false;
}

function isPlainTokenChar(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    ch === "_" ||
    ch === "-"
  );
}

/**
 * 检查 scope.file_types / paths 限制（如果 rule 设置了的话）。
 *
 * 语义：scope 只限制"哪些文件"被这条规则覆盖，不阻止"非文件操作"被匹配。
 * 因此当 ctx 没有 file_path（典型如 Bash 命令）时，file_types / paths 不适用，
 * 直接放行。例如一条范围是 `*.ts` 的"禁用 axios"规则，Write *.md 不会命中
 * （scope 过滤），但 Bash `npm install axios` 仍会命中（没有 file_path）。
 */
function checkScope(rule: KnowledgeEntry, filePath: string | undefined): boolean {
  if (!filePath) return true;

  const fileTypes = rule.scope.file_types;
  if (fileTypes && fileTypes.length > 0) {
    const ok = fileTypes.some((ft) => matchesGlob(ft, filePath));
    if (!ok) return false;
  }

  const paths = rule.scope.paths;
  if (paths && paths.length > 0) {
    const ok = paths.some((p) => matchesGlob(p, filePath));
    if (!ok) return false;
  }

  return true;
}

/** Phase 1 简化 glob：仅支持 `*` (除 / 外任意) 和 `**` (任意路径) */
function matchesGlob(pattern: string, target: string): boolean {
  const SPECIAL_RE = /[.+?^${}()|[\]\\]/g;
  const escaped = pattern
    .replace(SPECIAL_RE, "\\$&")
    .replace(/\*\*/g, "{{DSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{DSTAR}}/g, ".*");
  const re = new RegExp(`^${escaped}$`);
  if (re.test(target)) return true;
  // B-047: patterns without `/` (e.g. "*.css") are basename-only globs;
  // match against the file's basename so file_types still work, without
  // re-introducing the substring bypass for path globs like "src/**/*.ts".
  if (!pattern.includes("/")) {
    const slash = target.lastIndexOf("/");
    const basename = slash >= 0 ? target.slice(slash + 1) : target;
    return re.test(basename);
  }
  return false;
}
