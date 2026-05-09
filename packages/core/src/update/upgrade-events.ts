/**
 * Issue #245 — 升级流程 AttributionBus emitter helpers (pure, no IO).
 *
 * grill plan called for `packages/core/src/attribution/upgrade-events.ts`,
 * but the rest of the upgrade subsystem (snooze.ts / update-state.ts /
 * prompt-text.ts) lives under `packages/core/src/update/`, so this file
 * stays grouped with its siblings — same exports either way.
 *
 * 4 个工厂函数对应 4 个 emit 点：
 *   - SessionStart hook 弹 banner    → makeUpdatePromptShownEvent
 *   - `teamagent update --snooze`    → makeUpdateSnoozedEvent
 *   - `teamagent update --never`     → makeUpdateNeverSetEvent
 *   - runUpdater 写入新 sha 后        → makeUpdateInstalledEvent
 *
 * 这一层只负责"造 event 对象"；写入 AttributionBus 与 SqliteEventLog 的
 * IO 在 cli/imperative-shell 层做（见 packages/cli/src/lib/upgrade-event-emitter.ts）。
 * 这样 functional core / imperative shell 边界保持干净，pure 测试可直接
 * 断言 factory 的输入输出，不需要 mock fs / mock bus。
 *
 * 设计取舍：
 *   - severity 全 "info"——升级 banner / snooze / install 都是用户自己触发
 *     的事件，不抢救 / 不告警，render mode=smart 时默认不显示。
 *   - source: "update" 让 Renderer 按 channel 分组对齐 hook-pre / hook-stop。
 *   - timestamp 取自调用方的 `now`，便于 fake-clock E2E 测试。
 */

import type {
  AttributionEvent,
  UpdatePromptShownEvent,
  UpdateSnoozedEvent,
  UpdateNeverSetEvent,
  UpdateInstalledEvent,
} from "@teamagent/types";

/** 共同生成器 —— 把 epoch ms 转 ISO 8601。 */
function isoFromMs(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

export function makeUpdatePromptShownEvent(input: {
  fromVer: string;
  toVer: string;
  snoozeLevel: number;
  nowMs: number;
}): UpdatePromptShownEvent {
  return {
    kind: "update-prompt-shown",
    source: "update",
    severity: "info",
    timestamp: isoFromMs(input.nowMs),
    fromVer: input.fromVer,
    toVer: input.toVer,
    snoozeLevel: input.snoozeLevel,
  };
}

export function makeUpdateSnoozedEvent(input: {
  level: number;
  untilTs: number;
  nowMs: number;
}): UpdateSnoozedEvent {
  return {
    kind: "update-snoozed",
    source: "update",
    severity: "info",
    timestamp: isoFromMs(input.nowMs),
    level: input.level,
    untilTs: input.untilTs,
  };
}

export function makeUpdateNeverSetEvent(input: {
  nowMs: number;
}): UpdateNeverSetEvent {
  return {
    kind: "update-never-set",
    source: "update",
    severity: "info",
    timestamp: isoFromMs(input.nowMs),
  };
}

export function makeUpdateInstalledEvent(input: {
  fromVer: string;
  toVer: string;
  durationMs: number;
  nowMs: number;
}): UpdateInstalledEvent {
  return {
    kind: "update-installed",
    source: "update",
    severity: "info",
    timestamp: isoFromMs(input.nowMs),
    fromVer: input.fromVer,
    toVer: input.toVer,
    durationMs: input.durationMs,
  };
}

/**
 * Type-guard for `kind LIKE 'update-%'` filter — used by `teamagent stats`
 * to aggregate the 7d "升级事件" section without re-stringifying kind unions.
 */
export function isUpgradeAttributionEvent(
  e: AttributionEvent,
): e is
  | UpdatePromptShownEvent
  | UpdateSnoozedEvent
  | UpdateNeverSetEvent
  | UpdateInstalledEvent {
  return (
    e.kind === "update-prompt-shown" ||
    e.kind === "update-snoozed" ||
    e.kind === "update-never-set" ||
    e.kind === "update-installed"
  );
}

/**
 * Factory for the matching `PersistedEvent` row that lands in events.db.
 *
 * AttributionBus carries the in-memory rich event for Renderer; events.db
 * stores the durable JSON row for `teamagent stats` 7d aggregation. We
 * keep `id` deterministic-ish (`update-{kind}-{nowMs}`) so concurrent
 * SessionStarts do not double-emit (`INSERT OR IGNORE` upserts), but
 * also unique enough across distinct firings.
 */
export interface UpgradePersistedRow {
  id: string;
  kind:
    | "update-prompt-shown"
    | "update-snoozed"
    | "update-never-set"
    | "update-installed";
  timestamp: string;
  schema_version: 1;
  /** Free-form payload preserved as-is in events.payload column (JSON). */
  payload: Record<string, unknown>;
}

export function attributionToPersistedRow(
  e: UpdatePromptShownEvent | UpdateSnoozedEvent | UpdateNeverSetEvent | UpdateInstalledEvent,
  randSuffix: string,
): UpgradePersistedRow {
  const id = `update-${e.kind}-${Date.parse(e.timestamp)}-${randSuffix}`;
  switch (e.kind) {
    case "update-prompt-shown":
      return {
        id,
        kind: e.kind,
        timestamp: e.timestamp,
        schema_version: 1,
        payload: {
          fromVer: e.fromVer,
          toVer: e.toVer,
          snoozeLevel: e.snoozeLevel,
        },
      };
    case "update-snoozed":
      return {
        id,
        kind: e.kind,
        timestamp: e.timestamp,
        schema_version: 1,
        payload: {
          level: e.level,
          untilTs: e.untilTs,
        },
      };
    case "update-never-set":
      return {
        id,
        kind: e.kind,
        timestamp: e.timestamp,
        schema_version: 1,
        payload: {},
      };
    case "update-installed":
      return {
        id,
        kind: e.kind,
        timestamp: e.timestamp,
        schema_version: 1,
        payload: {
          fromVer: e.fromVer,
          toVer: e.toVer,
          durationMs: e.durationMs,
        },
      };
    default: {
      // exhaustive check — adding a new update-* kind without updating this
      // function fails compile here.
      const _exhaustive: never = e;
      void _exhaustive;
      throw new Error(`unhandled upgrade event kind: ${(e as { kind: string }).kind}`);
    }
  }
}
