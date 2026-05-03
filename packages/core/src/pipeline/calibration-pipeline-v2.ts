import type {
  CalibratorV2,
  KnowledgeStore,
  AttributionBus,
  Observation,
  TierTransition,
  DeltaStep,
  Validator,
} from "@teamagent/ports";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

export interface CalibrationV2Deps {
  calibrator: CalibratorV2;
  store: KnowledgeStore;
  events: PersistedEvent[];
  observations: Observation[];
  bus?: AttributionBus;
  now: () => Date;
  dryRun?: boolean;
  /** 可选：LLM 门闸 (M2.3)。提供则晋升 stable/canonical/enforced 时跑 L1/L2。 */
  validator?: Validator;
  /** 可选：LLM 客户端。validator 需要才会调用。 */
  callLLM?: (prompt: string) => Promise<string>;
  /** 可选：召回近邻规则给 L1。缺省时 similarRules=[]。 */
  similarityFinder?: (entry: KnowledgeEntry) => Promise<KnowledgeEntry[]>;
}

export interface CalibrationV2Record {
  knowledge_id: string;
  confidence_before: number;
  confidence_after: number;
  status_after?: KnowledgeEntry["status"];
  demerit_before: number;
  demerit_after: number;
  tier_before: string;
  tier_after: string;
  tier_transition: TierTransition | null;
  delta_breakdown: DeltaStep[];
}

export interface CalibrationV2Result {
  scanned: number;
  adjusted: CalibrationV2Record[];
  dormantNew: string[];
}

export async function runCalibrationPipelineV2(
  deps: CalibrationV2Deps,
): Promise<CalibrationV2Result> {
  const entries = deps.store.getAll();
  const now = deps.now();

  // Convert event-only outcomes into observations so Wilson confidence reacts
  // even when no PostToolUse result exists (notably blocked tool calls and
  // narrative/user-input guidance).
  const syntheticObs: Observation[] = deps.events
    .filter((e) => e.knowledge_id && syntheticOutcomeForEvent(e.kind) !== null)
    .map((e) => ({
      id: `synth-${e.kind}-${e.id}`,
      knowledge_id: e.knowledge_id!,
      timestamp: e.timestamp,
      outcome: syntheticOutcomeForEvent(e.kind)!,
      source_event: e.id,
      tool_use_id: e.tool_use_id,
    }));
  const allObservations = [...deps.observations, ...syntheticObs];

  const obsIdx = indexByKnowledgeId(allObservations);
  const evtIdx = indexByKnowledgeId(deps.events);

  const adjusted: CalibrationV2Record[] = [];
  const dormantNew: string[] = [];

  for (const entry of entries) {
    if (entry.status === "archived") continue;
    // Dormant rules: only process if demerit has decayed below threshold (resurrection check)
    const isDormant = entry.status === "dormant" || entry.current_tier === "dormant";
    if (isDormant && entry.demerit >= 50) continue;
    const obsForEntry = obsIdx.get(entry.id) ?? [];
    const evtForEntry = evtIdx.get(entry.id) ?? [];
    if (!isDormant && obsForEntry.length === 0 && evtForEntry.length === 0 && entry.demerit === 0) {
      continue; // no signal
    }

    const calResult = deps.calibrator.calibrate(entry, {
      events: evtForEntry as PersistedEvent[],
      observations: obsForEntry as Observation[],
      now,
    });

    // ── M2.3: Validator 晋升门闸（L1 stable / L2 canonical+）────────────
    let result = calResult;
    if (
      deps.validator &&
      deps.callLLM &&
      result.tier_transition &&
      isPromotion(result.tier_before, result.tier_after)
    ) {
      const proposedTier = result.tier_after;
      // L1 跑于 stable / canonical / enforced
      const needsL1 = L1_GATED_TIERS.has(proposedTier);
      if (needsL1) {
        const similar = deps.similarityFinder
          ? await deps.similarityFinder(entry).catch(() => [])
          : [];
        const l1 = await deps
          .validator
          .validateLevel1({ entry, similarRules: similar }, deps.callLLM)
          .catch((e): import("@teamagent/ports").ValidationLLMResult => ({
            ok: false,
            confidence: 0,
            reason: `validator_l1_error: ${String(e).slice(0, 120)}`,
          }));
        if (!l1.ok) {
          result = overrideTier(
            result,
            entry.current_tier,
            `l1_blocked: ${l1.reason}`,
          );
          deps.bus?.emit({
            source: "validator",
            action: "blocked_promotion",
            target: { id: entry.id },
            severity: "info",
            userFacingValue: `L1 blocked ${entry.current_tier} → ${proposedTier}: ${l1.reason}`,
            timestamp: now.toISOString(),
          });
        }
      }
      // L2 跑于 canonical / enforced，且 L1 未 block
      const needsL2 =
        L2_GATED_TIERS.has(proposedTier) && result.tier_transition !== null;
      if (needsL2) {
        const recentHits = evtForEntry
          .filter(
            (e) =>
              e.kind === "hook-pre.matched" || e.kind === "hook-pre.blocked",
          )
          .slice(-20)
          .map((e) => ({
            tool_input:
              (e as unknown as { payload?: { tool_input?: unknown } }).payload
                ?.tool_input ?? null,
            timestamp: e.timestamp,
          }));
        const seniors = deps.store
          .getAll()
          .filter(
            (r) =>
              (r.current_tier === "canonical" ||
                r.current_tier === "enforced") &&
              r.id !== entry.id,
          );
        const l2 = await deps
          .validator
          .validateLevel2(
            { entry, recentHits, existingSeniorRules: seniors },
            deps.callLLM,
          )
          .catch((e): import("@teamagent/ports").ValidationLLMResult => ({
            ok: false,
            confidence: 0,
            reason: `validator_l2_error: ${String(e).slice(0, 120)}`,
          }));
        if (!l2.ok) {
          result = overrideTier(
            result,
            entry.current_tier,
            `l2_blocked: ${l2.reason}`,
          );
          deps.bus?.emit({
            source: "validator",
            action: "blocked_promotion",
            target: { id: entry.id },
            severity: "info",
            userFacingValue: `L2 blocked ${entry.current_tier} → ${proposedTier}: ${l2.reason}`,
            timestamp: now.toISOString(),
          });
        }
      }
    }

    const confChanged = Math.abs(result.confidence_delta) > 1e-6;
    const demChanged = Math.abs(result.demerit_delta) > 1e-6;
    const tierChanged = result.tier_transition !== null;
    if (!confChanged && !demChanged && !tierChanged) continue;

    // ── M2.4: skill 导出事件 ─────────────────────────────────────────────
    if (tierChanged) {
      const wasStablePlus = STABLE_PLUS.has(result.tier_before);
      const isStablePlus = STABLE_PLUS.has(result.tier_after);
      if (!wasStablePlus && isStablePlus) {
        deps.bus?.emit({
          source: "compile",
          action: "skill_should_write",
          target: { id: entry.id },
          severity: "info",
          userFacingValue: `tier ${result.tier_before} → ${result.tier_after}，将导出 skill`,
          timestamp: now.toISOString(),
        });
      } else if (wasStablePlus && !isStablePlus) {
        deps.bus?.emit({
          source: "compile",
          action: "skill_should_remove",
          target: { id: entry.id },
          severity: "info",
          userFacingValue: `tier ${result.tier_before} → ${result.tier_after}，将移除 skill`,
          timestamp: now.toISOString(),
        });
      }
    }

    if (!deps.dryRun) {
      deps.store.update(entry.id, {
        confidence: result.confidence,
        demerit: result.demerit,
        current_tier: result.tier_after,
        status: result.status,
        demerit_last_updated: now.toISOString(),
        tier_entered_at: tierChanged ? now.toISOString() : entry.tier_entered_at,
        max_tier_ever:
          tierChanged && tierRankGt(result.tier_after, entry.max_tier_ever)
            ? result.tier_after
            : entry.max_tier_ever,
        last_validated_at: now.toISOString(),
      } as Partial<KnowledgeEntry>);
    }

    if (result.tier_after === "dormant") {
      dormantNew.push(entry.id);
    }

    adjusted.push({
      knowledge_id: entry.id,
      confidence_before: entry.confidence,
      confidence_after: result.confidence,
      status_after: result.status,
      demerit_before: entry.demerit,
      demerit_after: result.demerit,
      tier_before: result.tier_before,
      tier_after: result.tier_after,
      tier_transition: result.tier_transition,
      delta_breakdown: result.delta_breakdown,
    });

    deps.bus?.emit({
      source: "calibrator",
      action: "v2_adjusted",
      target: { id: entry.id },
      before: { confidence: entry.confidence, tier: entry.current_tier, demerit: entry.demerit },
      after: { confidence: result.confidence, tier: result.tier_after, demerit: result.demerit },
      severity: result.tier_after === "dormant" ? "warning" : "info",
      userFacingValue:
        result.tier_transition
          ? `${entry.id}: ${result.tier_before} → ${result.tier_after} (${result.tier_transition.reason})`
          : `${entry.id}: conf ${entry.confidence.toFixed(2)} → ${result.confidence.toFixed(2)}`,
      timestamp: now.toISOString(),
    });
  }

  return { scanned: entries.length, adjusted, dormantNew };
}

function indexByKnowledgeId<T extends { knowledge_id?: string }>(
  items: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    if (!it.knowledge_id) continue;
    const list = m.get(it.knowledge_id);
    if (list) list.push(it);
    else m.set(it.knowledge_id, [it]);
  }
  return m;
}

const TIER_RANK: Record<string, number> = {
  experimental: 0,
  probation: 1,
  stable: 2,
  canonical: 3,
  enforced: 4,
  dormant: -1,
};
function tierRankGt(a: string, b: string): boolean {
  return (TIER_RANK[a] ?? -1) > (TIER_RANK[b] ?? -1);
}

/** 判断 from → to 是否为（非 dormant 的）晋升。 */
function isPromotion(from: string, to: string): boolean {
  if (from === "dormant" || to === "dormant") return false;
  return tierRankGt(to, from);
}

const L1_GATED_TIERS = new Set(["stable", "canonical", "enforced"]);
const L2_GATED_TIERS = new Set(["canonical", "enforced"]);
const STABLE_PLUS = new Set(["stable", "canonical", "enforced"]);

function syntheticOutcomeForEvent(kind: string): Observation["outcome"] | null {
  if (
    kind === "hook-pre.blocked" ||
    kind === "ai.override.complied" ||
    kind === "ai.narrative.complied"
  ) {
    return "success";
  }
  if (
    kind === "ai.override.ignored" ||
    kind === "ai.override.blocked_circumvented" ||
    kind === "ai.narrative.recurred"
  ) {
    return "failure";
  }
  return null;
}

/**
 * Validator 阻断晋升时：回退 tier 到 revertTo；清除 tier_transition；
 * 在 delta_breakdown 里留记录以便 stats --explain 展示。
 *
 * 保守策略：不修改 confidence / demerit 变化（L1/L2 只把关升，不把关降）。
 */
function overrideTier<
  R extends {
    tier_after: string;
    tier_transition: TierTransition | null;
    delta_breakdown: DeltaStep[];
  },
>(result: R, revertTo: string, reason: string): R {
  return {
    ...result,
    tier_after: revertTo as R["tier_after"],
    tier_transition: null,
    delta_breakdown: [
      ...result.delta_breakdown,
      {
        type: "tier_transition",
        note: `reverted to ${revertTo}: ${reason}`,
      } as DeltaStep,
    ],
  };
}
