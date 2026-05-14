// BPP SSE broadcaster — in-memory pub/sub for bp-pushed / bp-revoked events.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §4.1.
// Design notes:
//   - We deliberately do NOT import `realtime-stream.ts::createSseHandler`. That
//     handler is poll-based (re-reads the cc-status store every pollMs and diffs
//     the roster). BPP needs *event push*, not poll-diff. We only reuse the wire
//     protocol: every frame is one `data: <json>\n\n` line.
//   - The subscriber callback shape is `(line: string) => void`. The HTTP layer
//     wraps `res.write` and passes that as the sink; tests pass an array.push.
//     Keeping the broadcaster type-free of `node:http` types makes it trivial
//     to test and to drive from other transports later (websocket, in-process).
//   - On `wireBroadcasterToHandlers`: bp-pushed broadcasts only to the receivers
//     listed in the request (targeted fan-out). bp-revoked broadcasts to every
//     currently-subscribed receiver, because revoke cascade by spec §5.3 hits
//     every inbox carrying that bp_id and the broadcaster has no efficient way
//     to know exactly who that was; spamming a JSON event of size O(100B) to
//     all subscribers is cheaper than re-querying disk per receiver.

export type BppEventType = 'bp-pushed' | 'bp-revoked';

export interface BppEvent {
  type: BppEventType;
  bp_id: string;
  /** Recipients listed in the push (informational for clients to filter). */
  receivers: string[];
}

export type SseSink = (line: string) => void;

/** Frame a payload object as one SSE `data:` event. Pure function. */
function frame(payload: BppEvent): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export class BppSseBroadcaster {
  private subs = new Map<string, Set<SseSink>>();

  subscribe(receiverId: string, sink: SseSink): void {
    let set = this.subs.get(receiverId);
    if (!set) {
      set = new Set<SseSink>();
      this.subs.set(receiverId, set);
    }
    set.add(sink);
  }

  disconnect(receiverId: string, sink: SseSink): void {
    const set = this.subs.get(receiverId);
    if (!set) return;
    set.delete(sink);
    if (set.size === 0) this.subs.delete(receiverId);
  }

  /**
   * For bp-pushed: fan-out only to receivers listed in event.receivers.
   * For bp-revoked: spec §5.3 says "SSE 广播 revoke 事件给所有 client" — every
   * currently-subscribed receiver gets the event.
   */
  broadcast(event: BppEvent): void {
    const targets: string[] =
      event.type === 'bp-revoked' ? Array.from(this.subs.keys()) : event.receivers;

    const line = frame(event);
    for (const r of targets) {
      const set = this.subs.get(r);
      if (!set) continue;
      // Snapshot before iterating: failing sinks are removed in-place, and we
      // don't want delete-during-iteration to skip a sibling.
      for (const sink of Array.from(set)) {
        try {
          sink(line);
        } catch {
          // Dead connection — drop and continue. Spec §4.1 doesn't define a
          // retry contract; the client is expected to reconnect.
          set.delete(sink);
        }
      }
      if (set.size === 0) this.subs.delete(r);
    }
  }
}

// ---------- handler composition ----------------------------------------------

/**
 * Minimal shape we require from the original handlers, mirroring
 * `server-handlers.ts::handleBpPush` and `revoke.ts::handleRevoke` return
 * types, but kept structural so tests can pass simple stubs.
 */
export interface BpPushBodyLike {
  bp: { id: string; [k: string]: unknown };
  receivers: string[];
}
export interface BpPushResultLike {
  ok: true;
  bp_id: string;
  delivered_to: string[];
}
export interface RevokeBodyLike {
  bp_id: string;
  lead_user_id: string;
  reason: string;
}
export interface RevokeResultLike {
  ok: true;
  bp_id: string;
  revoked_inbox_count: number;
}

export type PushHandler = (rootDir: string, body: BpPushBodyLike) => BpPushResultLike;
export type RevokeHandler = (rootDir: string, body: RevokeBodyLike) => RevokeResultLike;

/**
 * Wrap (push, revoke) handlers so each fires a broadcaster event AFTER the
 * original returns successfully. The originals are not mutated; if the
 * original throws, the broadcast is skipped.
 */
export function wireBroadcasterToHandlers(
  broadcaster: BppSseBroadcaster,
  originalPush: PushHandler,
  originalRevoke: RevokeHandler,
): { handleBpPush: PushHandler; handleRevoke: RevokeHandler } {
  return {
    handleBpPush(rootDir, body) {
      const out = originalPush(rootDir, body);
      broadcaster.broadcast({
        type: 'bp-pushed',
        bp_id: out.bp_id,
        receivers: out.delivered_to,
      });
      return out;
    },
    handleRevoke(rootDir, body) {
      const out = originalRevoke(rootDir, body);
      broadcaster.broadcast({
        type: 'bp-revoked',
        bp_id: out.bp_id,
        // Revoke fan-out is "everyone"; receivers field is informational only
        // for clients. We leave it empty here — broadcaster.broadcast routes
        // bp-revoked to all live subscribers regardless of this list.
        receivers: [],
      });
      return out;
    },
  };
}
