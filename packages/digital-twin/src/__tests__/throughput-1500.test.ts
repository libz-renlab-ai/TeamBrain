// M2 (对话上传通道) 质量验收 — "上传通道支持团队规模 30 人 × 每人每天 50 场
// 对话 = 每天 1500 场，全部成功落盘". Drives 1500 cc-session uploads through a
// real running server and asserts every one lands on disk. Verified by
// judge.md §V1.F, which greps this test's stdout for `landed=1500/1500`.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { startMockServer, type MockServerHandle } from '../mock-server.js';

const TOTAL = 1500;
/** Concurrency cap — 1500 simultaneous sockets would exhaust the ephemeral
 *  port range on Windows CI; 50-wide batches keep it bounded and fast. */
const BATCH = 50;

function ccSessionBody(sessionId: string, userId: string): string {
  const compressed = gzipSync(
    Buffer.from(`{"role":"user","content":"throughput ${sessionId}"}\n`),
  );
  return JSON.stringify({
    schema_version: 1,
    envelope: {
      session_id: sessionId,
      user_id: userId,
      captured_at: '2026-05-14T12:00:00.000Z',
    },
    transcript: {
      compression: 'gzip+base64',
      content: compressed.toString('base64'),
    },
  });
}

describe('cc-session upload throughput', () => {
  let server: MockServerHandle;

  afterEach(async () => {
    await server.close();
  });

  it(
    'lands all 1500 sessions/day (30 members x 50 convos) on disk',
    async () => {
      const outputDir = mkdtempSync(join(tmpdir(), 'dt-throughput-'));
      server = await startMockServer({ port: 0, outputDir });

      let posted2xx = 0;
      for (let start = 0; start < TOTAL; start += BATCH) {
        const batch: Array<Promise<void>> = [];
        for (let i = start; i < Math.min(start + BATCH, TOTAL); i++) {
          // 30 members, 50 conversations each — mirror the spec's team shape.
          const memberIdx = i % 30;
          const userId = `member-${String(memberIdx).padStart(2, '0')}@libz.ai`;
          const sessionId = `tput-${String(i).padStart(4, '0')}`;
          batch.push(
            fetch(`${server.url}/v1/cc-sessions`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: ccSessionBody(sessionId, userId),
            }).then((res) => {
              if (res.status === 200) posted2xx++;
            }),
          );
        }
        await Promise.all(batch);
      }

      // Count what actually landed under <outputDir>/<user>/<date>/*.jsonl.
      let landed = 0;
      for (const user of readdirSync(outputDir)) {
        const userDir = join(outputDir, user);
        for (const date of readdirSync(userDir)) {
          const dateDir = join(userDir, date);
          if (!existsSync(dateDir)) continue;
          landed += readdirSync(dateDir).filter((f) => f.endsWith('.jsonl')).length;
        }
      }

      // The grep anchor judge.md §V1.F keys on.
      console.log(`landed=${landed}/${TOTAL}`);
      console.log(`posted_2xx=${posted2xx}/${TOTAL}`);

      expect(posted2xx).toBe(TOTAL);
      expect(landed).toBe(TOTAL);
    },
    60_000,
  );
});
