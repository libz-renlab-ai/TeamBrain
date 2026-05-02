import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compileNestedRuleArtifacts,
  NESTED_TIERS,
  type NestedRuleArtifact,
  type CompileNestedRuleOptions,
} from "@teamagent/core";
import type { Compiler } from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";

/** writeToFile 的返回，兼容 MarkdownCompilerLike 形状。 */
export interface NestedRuleStoreWriteInfo {
  /** 入口 INDEX.md 路径，给 attribution / 日志用。 */
  filePath: string;
  /** 写入的 artifact 总数（含 root + tier indexes + 每条 rule）。 */
  blockLineCount: number;
  /** 兼容字段，nested store 没有真正的"行号偏移"概念，恒为 0。 */
  blockStartLine: number;
}

export interface NestedRuleStoreCompilerOptions {
  /** 默认 `~/.claude/teamagent/rules`。可由 env `TEAMAGENT_RULES_DIR` 或显式参数覆盖。 */
  rulesDir?: string;
  now?: () => string;
  /**
   * 编译选项透传给 core——目前只有 `presetOnly`，与 `MarkdownCompiler` 行为对齐
   * （issue #42 codex P1）。
   */
  compileOptions?: CompileNestedRuleOptions;
}

const DEFAULT_DIR = path.join(os.homedir(), ".claude", "teamagent", "rules");

/**
 * 把 KnowledgeEntry[] 编译为用户级 nested rule store。
 *
 * 取代 MarkdownCompiler（CLAUDE.md 单文件）默认出口——避免单文档膨胀。
 * 接口与 MarkdownCompilerLike 一致，可直接喂给 compile-pipeline。
 *
 * 写入位置（默认）：`~/.claude/teamagent/rules/`
 * - `INDEX.md`                顶层入口，列各 tier 计数
 * - `<tier>/INDEX.md`         单 tier 入口
 * - `<tier>/<rule-id>.md`     一条规则一个文件
 *
 * Cleanup 策略：每次 compile 写入后，扫描 rules dir 下的 `<tier>/<id>.md`，
 * 凡是 ruleId 不在本轮 artifacts 中的，删除（孤儿清理）。用户手动放进去的
 * 任意其它 .md（例如 `NOTES.md`）只要不在 ruleId 集合内但也不是 INDEX.md，
 * 在 v1 实现里**保留**——只删与"前一轮规则"完全同名的文件。
 */
export class NestedRuleStoreCompiler implements Compiler<string> {
  private readonly rulesDir: string;
  private readonly now: () => string;
  private readonly compileOptions: CompileNestedRuleOptions;

  constructor(opts: NestedRuleStoreCompilerOptions = {}) {
    this.rulesDir =
      opts.rulesDir ?? process.env["TEAMAGENT_RULES_DIR"] ?? DEFAULT_DIR;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.compileOptions = opts.compileOptions ?? {};
  }

  /** 纯：返回一个简短摘要字符串（用于日志/兼容旧 Compiler<string> 接口）。 */
  compile(entries: KnowledgeEntry[]): string {
    const artifacts = compileNestedRuleArtifacts(entries, this.now(), this.compileOptions);
    const ruleCount = artifacts.filter((a) => a.kind === "rule").length;
    return `nested-rule-store: ${ruleCount} rules @ ${this.rulesDir}`;
  }

  /**
   * 写入 nested rules，并清理孤儿。返回 MarkdownCompilerLike 兼容信息。
   */
  writeToFile(entries: KnowledgeEntry[]): NestedRuleStoreWriteInfo {
    const artifacts = compileNestedRuleArtifacts(entries, this.now(), this.compileOptions);

    fs.mkdirSync(this.rulesDir, { recursive: true });
    for (const tier of NESTED_TIERS) {
      fs.mkdirSync(path.join(this.rulesDir, tier), { recursive: true });
    }

    const writtenRuleFiles = new Set<string>();
    for (const a of artifacts) {
      const target = path.join(this.rulesDir, a.relativePath);
      writeAtomic(target, a.contents);
      if (a.kind === "rule") writtenRuleFiles.add(target);
    }

    this.cleanupOrphans(artifacts);

    const indexPath = path.join(this.rulesDir, "INDEX.md");
    return {
      filePath: indexPath,
      blockLineCount: artifacts.length,
      blockStartLine: 0,
    };
  }

  /**
   * 删除"上一轮存在、本轮不存在"的 rule 文件。
   *
   * 策略：只考虑落在 `<tier>/` 下、扩展名 `.md` 且不是 `INDEX.md` 的文件；
   * 把它们的 (tier, basename without .md) 当作 ruleId 候选。
   * 若该 ruleId 不在本轮 artifacts 的 rule 集合里 -- 删掉。
   *
   * 注意：用户手动放进来的 `NOTES.md` 之类**也会被当成 rule 候选误删**——
   * 为了避免这种行为，文件名以大写字母开头视为"用户文件"保留。这是一个
   * 务实的约定：编译器写出的 ruleId 在本仓库里都是小写 / kebab-case。
   */
  private cleanupOrphans(artifacts: NestedRuleArtifact[]): void {
    const aliveIds = new Set<string>();
    for (const a of artifacts) {
      if (a.kind === "rule" && a.ruleId && a.tier) {
        aliveIds.add(`${a.tier}/${pathBasename(a.relativePath)}`);
      }
    }

    for (const tier of NESTED_TIERS) {
      const tierDir = path.join(this.rulesDir, tier);
      if (!fs.existsSync(tierDir)) continue;
      let entries: string[];
      try {
        entries = fs.readdirSync(tierDir);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (name === "INDEX.md") continue;
        if (!name.endsWith(".md")) continue;
        // 大写起始视为用户笔记，跳过
        if (/^[A-Z]/.test(name)) continue;
        const key = `${tier}/${name}`;
        if (aliveIds.has(key)) continue;
        try {
          fs.unlinkSync(path.join(tierDir, name));
        } catch {
          /* swallow */
        }
      }
    }
  }
}

function pathBasename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

/** 原子写：先写 .tmp，再 rename；失败回退覆盖写。 */
function writeAtomic(target: string, contents: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, contents, "utf-8");
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.writeFileSync(target, contents, "utf-8");
      fs.unlinkSync(tmp);
    } catch {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* leave for next run */
      }
      throw err;
    }
  }
}
