import type { KnowledgeEntry } from "@teamagent/types";
import { scoreEntry } from "../scorer.js";

/**
 * 用户级 nested rule store 的输出 schema。
 *
 * 一次 compile 产出多份 markdown：
 * - `root-index`: 顶层 INDEX.md，列每个 tier 的计数与跳转
 * - `tier-index`: 每个 tier 目录下的 INDEX.md，按 score 排序列规则
 * - `rule`:       一条规则一份 .md，方便人工浏览/审计
 *
 * Adapter 拿到 artifacts 后做 IO（创建目录、原子写文件、清理孤儿）。
 */
export interface NestedRuleArtifact {
  kind: "root-index" | "tier-index" | "rule";
  /** 相对 rules 根目录的路径，例：`canonical/INDEX.md`、`canonical/my-rule.md` */
  relativePath: string;
  /** markdown 文件内容（含末尾换行） */
  contents: string;
  /** 仅 kind==="rule" 时有意义；用于 cleanup 时精确匹配。 */
  ruleId?: string;
  /** 规则归属的 tier；root-index 时为 undefined。 */
  tier?: KnowledgeEntry["current_tier"];
}

/** 5 个 tier，固定顺序——展示按这个顺序，目录每次 compile 都会出现（用 INDEX.md 兜底）。*/
export const NESTED_TIERS: ReadonlyArray<NonNullable<KnowledgeEntry["current_tier"]>> = [
  "enforced",
  "canonical",
  "stable",
  "probation",
  "experimental",
  "dormant",
];

/**
 * 把一条 KnowledgeEntry 渲染为 standalone markdown 文件。纯函数。
 *
 * 与 SKILL.md 不同——没有 frontmatter，纯文档化展示，便于 `~/.claude/teamagent/rules/` 做人审。
 */
export function formatRuleAsMarkdown(entry: KnowledgeEntry): string {
  const lines: string[] = [];
  lines.push(`# ${entry.id}`);
  lines.push("");
  lines.push("## 元信息");
  lines.push("");
  lines.push(`- Tier: ${entry.current_tier}`);
  lines.push(`- Confidence: ${entry.confidence.toFixed(2)}`);
  lines.push(`- Source: ${entry.source}`);
  lines.push(`- Hits: ${entry.hit_count}`);
  if (entry.last_hit_at) lines.push(`- Last hit: ${entry.last_hit_at}`);
  if (entry.created_at) lines.push(`- Created: ${entry.created_at}`);
  lines.push("");
  if (entry.trigger) {
    lines.push("## 触发场景");
    lines.push("");
    lines.push(sanitizeBlockMarkers(entry.trigger));
    lines.push("");
  }
  lines.push("## 正确做法");
  lines.push("");
  lines.push(sanitizeBlockMarkers(entry.correct_pattern));
  lines.push("");
  if (entry.type === "avoidance" && entry.wrong_pattern) {
    lines.push("## ❌ 错误做法");
    lines.push("");
    lines.push(sanitizeBlockMarkers(entry.wrong_pattern));
    lines.push("");
  }
  lines.push("## 原因");
  lines.push("");
  lines.push(sanitizeBlockMarkers(entry.reasoning));
  lines.push("");
  return lines.join("\n");
}

/**
 * 渲染单 tier 的 INDEX.md。纯函数。entries 内部按 score 降序。
 */
export function formatTierIndex(
  tier: NonNullable<KnowledgeEntry["current_tier"]>,
  entries: KnowledgeEntry[],
  now: string,
): string {
  const active = entries.filter((e) => e.status === "active" && e.current_tier === tier);
  const maxHit = Math.max(1, ...active.map((e) => e.hit_count));
  const sorted = [...active].sort(
    (a, b) => scoreEntry(b, maxHit, now) - scoreEntry(a, maxHit, now),
  );
  const lines: string[] = [];
  lines.push(`# ${tier} (${active.length} rules)`);
  lines.push("");
  lines.push(`Last compiled: ${now}`);
  lines.push("");
  if (active.length === 0) {
    lines.push("（暂无）");
    lines.push("");
    return lines.join("\n");
  }
  for (const e of sorted) {
    const tldr = oneLineTldr(e);
    const safe = encodeRuleIdForPath(e.id);
    lines.push(
      `- [${e.id}](./${safe}.md) — ${tldr} [${e.confidence.toFixed(2)}, ${e.hit_count}hit]`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * 渲染顶层 INDEX.md。纯函数。
 */
export function formatRootIndex(entries: KnowledgeEntry[], now: string): string {
  const active = entries.filter((e) => e.status === "active");
  const byTier = new Map<NonNullable<KnowledgeEntry["current_tier"]>, number>();
  for (const t of NESTED_TIERS) byTier.set(t, 0);
  for (const e of active) {
    if (e.current_tier) {
      byTier.set(e.current_tier, (byTier.get(e.current_tier) ?? 0) + 1);
    }
  }
  const lines: string[] = [];
  lines.push("# TeamAgent Rules");
  lines.push("");
  lines.push(`Last compiled: ${now}`);
  lines.push(`Total active: ${active.length}`);
  lines.push("");
  lines.push("## By tier");
  lines.push("");
  for (const t of NESTED_TIERS) {
    const n = byTier.get(t) ?? 0;
    const noun = n === 1 ? "rule" : "rules";
    lines.push(`- [${t}](./${t}/INDEX.md) — ${n} ${noun}`);
  }
  lines.push("");
  lines.push("> 由 `teamagent compile` 自动维护，请勿手动编辑该目录内文件。");
  lines.push("");
  return lines.join("\n");
}

/** Options for `compileNestedRuleArtifacts`. */
export interface CompileNestedRuleOptions {
  /**
   * 元原则模式：只编译 source==='preset' 的条目。
   * 与旧 `MarkdownCompiler` 的 `--preset-only` 行为对齐（issue #42 codex P1）。
   */
  presetOnly?: boolean;
}

/**
 * 把 entries 编译成 nested rule store artifacts。纯函数。
 *
 * - 跳过 archived
 * - 同名 rule id 取第一条（DualLayerStore 已做 dedup，此处只是兜底）
 * - 每个 tier 不论是否有规则都会出现 INDEX.md（让 adapter 能稳定地清理孤儿）
 * - 不同 rule id 编码后落到同一文件名时（例：`a/b` vs `a_b`），后到的会附加
 *   稳定哈希后缀，避免互相覆盖（issue #42 codex P2）
 */
export function compileNestedRuleArtifacts(
  entries: KnowledgeEntry[],
  now: string,
  options: CompileNestedRuleOptions = {},
): NestedRuleArtifact[] {
  let active = entries.filter((e) => e.status === "active");
  if (options.presetOnly) {
    active = active.filter((e) => e.source === "preset");
  }

  const byId = new Map<string, KnowledgeEntry>();
  for (const e of active) if (!byId.has(e.id)) byId.set(e.id, e);
  const deduped = [...byId.values()];

  const artifacts: NestedRuleArtifact[] = [];

  artifacts.push({
    kind: "root-index",
    relativePath: "INDEX.md",
    contents: formatRootIndex(deduped, now),
  });

  for (const tier of NESTED_TIERS) {
    artifacts.push({
      kind: "tier-index",
      relativePath: `${tier}/INDEX.md`,
      contents: formatTierIndex(tier, deduped, now),
      tier,
    });
  }

  // 跨 tier 的 (tier, fileBasename) 唯一性追踪——两条不同 id 编码到同一文件名时，
  // 第二条之后追加 ` -<hash>` 后缀。第一条保持干净文件名，避免无谓污染。
  const usedFilenames = new Set<string>();
  for (const e of deduped) {
    const tier = e.current_tier;
    if (!tier) continue;
    const baseSafe = encodeRuleIdForPath(e.id);
    let safe = baseSafe;
    let key = `${tier}/${safe}`;
    if (usedFilenames.has(key)) {
      const disc = stableHashSuffix(e.id);
      safe = `${baseSafe}-${disc}`;
      key = `${tier}/${safe}`;
      // 极端情况下哈希也碰撞，加序号兜底
      let n = 2;
      while (usedFilenames.has(key)) {
        safe = `${baseSafe}-${disc}-${n}`;
        key = `${tier}/${safe}`;
        n++;
      }
    }
    usedFilenames.add(key);
    artifacts.push({
      kind: "rule",
      relativePath: `${tier}/${safe}.md`,
      contents: formatRuleAsMarkdown(e),
      ruleId: e.id,
      tier,
    });
  }

  return artifacts;
}

/**
 * 把 rule id 编码为安全的文件名片段：
 * - 只保留 [A-Za-z0-9._-]，其它字符替换成 `_`
 * - `..` 与连续 `/` 一并消除——防止 path traversal 写到目录外
 *
 * 这样仍然可逆地保留可读性（id `pers-2026-04-14-abc` 直接映射成同名 .md），
 * 而 `a/../b` 这类异常 id 会被压成 `a______b`。
 */
function encodeRuleIdForPath(id: string): string {
  // 1) 替换路径敏感字符；2) 折叠任何 ≥2 的连续点（`..`、`...`）为单下划线，
  //    防止 path traversal；3) 兜底空 / 单点串。
  const noTraversal = id.replace(/\.{2,}/g, "_");
  const safe = noTraversal.replace(/[^A-Za-z0-9._-]/g, "_");
  if (safe === "" || safe === ".") return "_";
  return safe;
}

/**
 * 32-bit FNV-1a → 6 hex 字符。纯函数，给 path encode 做去歧义后缀。
 * 不用于安全签名——只为让 `a/b`、`a_b`、`a:b` 经 `_` 归一化后仍能产生不同后缀。
 */
function stableHashSuffix(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 6);
}

/** 单行 TLDR：取 reasoning 第一行截断。 */
function oneLineTldr(entry: KnowledgeEntry): string {
  const raw = (entry.reasoning ?? "").split("\n")[0]?.trim() ?? "";
  const sanitized = sanitizeBlockMarkers(raw);
  return sanitized.length > 80 ? sanitized.slice(0, 79) + "…" : sanitized;
}

/** 与 markdown.ts 相同：阻止用户字段里嵌入 TEAMAGENT block 标记伪装区块边界。*/
function sanitizeBlockMarkers(text: string): string {
  return text.replace(/TEAMAGENT:(START|END)/g, "TEAMAGENT​:$1");
}
