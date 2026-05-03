import type { SkillCompiler, AttributionBus } from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";

/** MarkdownCompiler 的最小接口，让 compile-pipeline 依赖注入而非具体实现。 */
export interface MarkdownCompilerLike {
  compile(entries: KnowledgeEntry[]): string;
  writeToFile(entries: KnowledgeEntry[]): { filePath: string; blockLineCount: number; blockStartLine: number };
}

export interface SkillEvent {
  action: "skill_should_write" | "skill_should_remove";
  id: string;
}

export interface CompilePipelineDeps {
  /** 只需要 getAll()——caller 可传 KnowledgeStore 或 DualLayerStore 等任意实现 */
  store: { getAll(): KnowledgeEntry[] };
  /** Legacy/internal markdown output. Normal commands leave this undefined. */
  markdownCompiler?: MarkdownCompilerLike;
  skillCompiler: SkillCompiler;
  bus?: AttributionBus;
  /** 来自 calibrate pipeline 的 skill 事件 */
  skillEvents?: SkillEvent[];
  dryRun?: boolean;
  /** Explicit opt-in for the legacy CLAUDE.md block writer. */
  writeMarkdown?: boolean;
}

export interface CompilePipelineResult {
  markdown: { path: string; blockLineCount: number };
  skills: { written: string[]; removed: string[] };
}

export async function runCompile(deps: CompilePipelineDeps): Promise<CompilePipelineResult> {
  const entries = deps.store.getAll();

  // 1. Legacy CLAUDE.md 出口。Normal compile writes Skills only.
  let mdPath = "(skipped)";
  let mdLineCount = 0;
  if (deps.writeMarkdown && deps.markdownCompiler && !deps.dryRun) {
    const info = deps.markdownCompiler.writeToFile(entries);
    mdPath = info.filePath;
    mdLineCount = info.blockLineCount;
  } else if (deps.writeMarkdown && deps.dryRun) {
    mdPath = "(dry-run)";
  }

  // 2. Skills 出口
  const artifacts = deps.skillCompiler.compile(entries);
  const written = deps.dryRun ? artifacts.map((a) => a.ruleId) : (await deps.skillCompiler.write(artifacts)).written;

  const toRemove = deps.skillEvents
    ?.filter((e) => e.action === "skill_should_remove")
    .map((e) => e.id) ?? [];
  const removed = deps.dryRun ? toRemove : (await deps.skillCompiler.cleanup(toRemove)).removed;

  deps.bus?.emit({
    source: "compile",
    action: "skills_compiled",
    target: { id: "skills" },
    severity: "info",
    userFacingValue: `Skills written: ${written.length}, removed: ${removed.length}`,
    timestamp: new Date().toISOString(),
  });

  return {
    markdown: { path: mdPath, blockLineCount: mdLineCount },
    skills: { written, removed },
  };
}
