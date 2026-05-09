import { sanitizeUserFacingText, type AttributionEvent, type VisibilityMode } from "@teamagent/types";
import type { Renderer } from "@teamagent/ports";

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
const HEADER = "✨ TeamAgent · 本次操作归因";

/**
 * 把 kind 翻译成给用户看的"做了什么"短语。
 *
 * 对应 PR `teamwork/hookshell-attribution-fused` commit 4：AttributionEvent
 * 改成 discriminated union by `kind` 后，Renderer 不再吃自由 `action` 字符串，
 * 而是按 `kind` 做 exhaustive switch。新增 kind 必须在这里加分支，否则
 * `_exhaustive: never` 在编译期报错。
 */
function describeAction(event: AttributionEvent): string {
  switch (event.kind) {
    case "pitfall.added":
      return `添加知识条目 ${event.knowledgeId} (${event.category}/${event.tag})`;
    case "skeleton.knowledge-added":
      return `[skeleton] 添加模拟知识 ${event.knowledgeId} + legacy markdown 预览`;
    case "skeleton.l0-validation":
      return event.ok
        ? `[skeleton] L0 通过演示 ${event.knowledgeId}`
        : `[skeleton] L0 拒绝演示 ${event.knowledgeId}`;
    case "skeleton.skills-compiled":
      return "[skeleton] Skills 编译演示";
    case "extractor.deduped":
      return `去重: ${event.count} 条`;
    case "extractor.skipped":
      return `跳过: ${event.count} 条`;
    case "extractor.extracted":
      return `提取知识 ${event.knowledgeId}`;
    case "extractor.rejected-l0":
      return `L0 拒绝 ${event.knowledgeId}`;
    case "extractor.failed":
      return `提取失败 (${event.count})`;
    case "compiler.recompiled":
      return `重编译完成 (+${event.count})`;
    case "compiler.failed":
      return "重编译失败";
    case "ingest.failed":
      return `ingest 失败 (${event.count})`;
    case "ingest.skipped":
      return `ingest 跳过 (${event.count})`;
    case "ingest.rejected-l0":
      return `ingest L0 拒绝 ${event.knowledgeId}`;
    case "ingest.accepted":
      return `入库 ${event.knowledgeId}`;
    case "importer.skipped":
      return "导入跳过";
    case "importer.structured":
      return "已导入";
    case "importer.failed":
      return "导入失败";
    case "validator.blocked-promotion":
      return `${event.level.toUpperCase()} 阻断晋升 ${event.knowledgeId}: ${event.fromTier} → ${event.toTier}`;
    case "calibrator.adjusted":
      return `校准 ${event.knowledgeId}: ${event.confidenceBefore.toFixed(2)} → ${event.confidenceAfter.toFixed(2)}`;
    case "calibrator.v2-adjusted":
      return `校准 ${event.knowledgeId}: tier ${event.tierBefore} → ${event.tierAfter}`;
    case "compile.skill-should-write":
      return `tier ${event.tierBefore} → ${event.tierAfter}，将导出 skill ${event.knowledgeId}`;
    case "compile.skill-should-remove":
      return `tier ${event.tierBefore} → ${event.tierAfter}，将移除 skill ${event.knowledgeId}`;
    case "compile.skills-compiled":
      return `Skills 编译完成: 写入 ${event.written}，移除 ${event.removed}`;
    case "hook-stop.rules-vectorized":
      return `向量化补全 ${event.count} 条规则`;
    case "hook-stop.analyze-started":
      return `分析会话中 (${event.modeTag})`;
    case "hook-stop.analyze-finished":
      return event.firstLine ?? "分析完成";
    case "hook-stop.analyze-skipped":
      return `跳过 analyze: ${event.reason}`;
    case "hook-stop.calibration-started":
      return "校准置信度中";
    case "hook-stop.calibration-finished":
      return "校准完成";
    case "hook-stop.skills-updating":
      return "更新 Skills 中";
    case "hook-stop.skills-exported":
      return `Skills 导出 ${event.count} 条`;
    case "hook-stop.scan-errors-started":
      return "扫描工具失败信号 (scan-errors)";
    case "hook-stop.scan-errors-progress":
      return `scan-errors ${event.lastLine}`;
    case "hook-stop.scan-errors-timeout":
      return `scan-errors 超时 (>${event.timeoutMs}ms)，跳过`;
    case "hook-stop.semantic-scan-hit":
      return `semantic-scan 命中 ${event.count} 条规则`;
    case "hook-stop.semantic-scan-timeout":
      return `semantic-scan 超时 (>${event.timeoutMs}ms)，跳过`;
    case "hook-stop.skip-concurrent":
      return `stop hook pid ${event.otherPid} 仍在运行，跳过本次 Stop event`;
    case "hook-pre.matched":
      return `pre-hook 命中规则 ${event.ruleId} → ${event.permissionDecision}`;
    case "hook-pre.passed":
      return `pre-hook 通过 (扫描 ${event.ruleCount} 条规则)`;
    case "user-prompt.injected":
      return `user-prompt 注入 ${event.injectedIds.length} 条规则`;
    case "user-prompt.flagged":
      return `user-prompt 标记规则 ${event.ruleId}`;
    // issue #245: 升级流程遥测
    case "update-prompt-shown":
      return `升级 banner 已弹出: ${event.fromVer || "(初装)"} → ${event.toVer} (snooze 级别 ${event.snoozeLevel})`;
    case "update-snoozed":
      return `升级 snooze 到级别 ${event.level} (静音至 ${new Date(event.untilTs).toISOString()})`;
    case "update-never-set":
      return "升级 banner 已永久关闭 (never_prompt=true)";
    case "update-installed":
      return `升级完成: ${event.fromVer || "(初装)"} → ${event.toVer} (用时 ${event.durationMs}ms)`;
    default: {
      // 编译期 exhaustiveness check：如果 AttributionEvent union 增加新 kind
      // 而这里漏了 case，TS 会在 `_exhaustive: never = event` 这行报错。
      const _exhaustive: never = event;
      void _exhaustive;
      return "未知事件";
    }
  }
}

/** 从 kind 派生"知识库变化"行（仅 pitfall / skeleton.knowledge-added 有意义）。 */
function describeKnowledgeChange(event: AttributionEvent): string | undefined {
  if (event.kind === "pitfall.added") {
    return `${event.knowledgeCountBefore} → ${event.knowledgeCountAfter} 条 (${event.level}/${event.category}/${event.tag})`;
  }
  if (event.kind === "skeleton.knowledge-added") {
    return `${event.knowledgeCountBefore} → ${event.knowledgeCountAfter} 条`;
  }
  return undefined;
}

/** 从 kind 派生"传播到"行（仅 pitfall.added 有 skill md 路径）。 */
function describeTarget(event: AttributionEvent): string | undefined {
  if (event.kind === "pitfall.added") {
    return event.skillMdPath;
  }
  return undefined;
}

/**
 * 归因事件→文本 渲染器。
 *
 * 模式对应 spec v5.2 和 plan v1.2 的归因总线规范：
 * - silent：返回空串
 * - smart: 只显示 highlight/warning 的完整归因块
 * - verbose: + counterfactual + 附加原始 JSON
 *
 * 内部按 `event.kind` 做 exhaustive switch（见 `describeAction`），
 * 新增 kind 必须同步加 case，否则编译期报错。
 */
export class StdoutRenderer implements Renderer {
  render(events: AttributionEvent[], mode: VisibilityMode): string {
    if (mode === "silent") return "";

    const visible = mode === "verbose"
      ? events
      : events.filter((e) => e.severity !== "info");

    if (visible.length === 0) return "";

    const lines: string[] = [DIVIDER, HEADER, DIVIDER];

    for (const e of visible) {
      lines.push(`▸ 做了什么: ${sanitizeUserFacingText(describeAction(e))}`);

      const change = describeKnowledgeChange(e);
      if (change) lines.push(`▸ 知识库变化: ${sanitizeUserFacingText(change)}`);

      const target = describeTarget(e);
      if (target) lines.push(`▸ 传播到: ${sanitizeUserFacingText(target)}`);

      // sanitize before stderr write — security-specialist /review on PR #152
      // (B-126/B-130 cousin): rule content can carry ANSI escapes / surrogate
      // halves / control bytes that would otherwise hijack the user's terminal.
      // pre-tool-use-handler.ts already sanitizes its rendered systemMessage;
      // this path covers all 8 hook channels' AttributionEvent renders.
      if (e.userFacingValue) {
        lines.push(`▸ 下次体验: ${sanitizeUserFacingText(e.userFacingValue)}`);
      }
      if (mode === "verbose" && e.counterfactual) {
        lines.push(`▸ 如果没有 TeamAgent: ${sanitizeUserFacingText(e.counterfactual)}`);
      }
    }

    lines.push(DIVIDER);

    if (mode === "verbose") {
      lines.push("");
      lines.push("--- raw events ---");
      // sanitize the raw JSON dump too — `JSON.stringify` does not escape
      // C1 bytes (`\x80-\x9f`), so an event field carrying 8-bit CSI / OSC
      // sequences emits them as raw bytes here even though the per-line
      // call sites above are sanitized. Belt-and-suspenders for the
      // verbose mode every-byte audit dump.
      lines.push(sanitizeUserFacingText(JSON.stringify(events, null, 2)));
    }

    return lines.join("\n");
  }
}
