// Spin up a persistent mock-server with BPP routes wired and a sample
// BestPractice already POSTed to it, so we can open Chrome and screenshot
// the dashboard + the /v1/inbox JSON.
//
// Run: npx tsx docs/plans/2026-05-13-bpp-poc/evidence/run-server.ts
// Stops on Ctrl+C.

import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startMockServer } from '../../../../packages/digital-twin/src/mock-server.js';

const PORT = Number(process.env.BPP_DEMO_PORT ?? 9787);

async function main(): Promise<void> {
  const outputDir = mkdtempSync(join(tmpdir(), 'bpp-screenshot-'));
  const server = await startMockServer({ port: PORT, outputDir });
  console.log(`[bpp-screenshot-server] up at ${server.url}`);
  console.log(`[bpp-screenshot-server] outputDir = ${outputDir}`);

  // Push 3 best practices to make the demo realistic
  const bps = [
    {
      id: 'bp-demo-01-mock-db',
      type: 'rule',
      title: '测试时不要 mock 数据库',
      body: 'Mocking the database hides migration bugs.',
      example: 'PR #200 — mocked tests passed but prod migration broke.',
      pushed_by: 'alice@team.com',
      pushed_by_display: 'Alice',
      topic: 'testing',
      confidence_score: 0.87,
      confidence_tier: 'canonical',
    },
    {
      id: 'bp-demo-02-brainstorm-first',
      type: 'habit',
      title: '写代码前先调用 brainstorming skill',
      body: '复杂任务先 brainstorm，再动手写实现。',
      example: 'Alice 在 #326 brainstorm 后实现无返工；Bob 同类任务直接动手返工 200 行。',
      pushed_by: 'alice@team.com',
      pushed_by_display: 'Alice',
      topic: 'ai-collab',
      confidence_score: 0.92,
      confidence_tier: 'enforced',
    },
    {
      id: 'bp-demo-03-atomic-commits',
      type: 'context-mgmt',
      title: '改完代码立刻原子 commit',
      body: '每个 file edit 立刻 commit，不要攒一堆。',
      example: '小黑攒 10 个文件一起 commit，pre-commit hook 失败后排查整整 1h；大黄每个 edit 立刻 commit，3 分钟解决。',
      pushed_by: 'bob@team.com',
      pushed_by_display: 'Bob',
      topic: 'git-flow',
      confidence_score: 0.78,
      confidence_tier: 'stable',
    },
  ];

  for (const partial of bps) {
    const bp = {
      schema_version: 1 as const,
      ...partial,
      conflict_with: [],
      mining_evidence: {
        sessions_observed: 8,
        pattern_count: 6,
        reject_count: 0,
        extraction_method: 'behavior-mining-v1',
      },
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      created_at: new Date().toISOString(),
    };
    const res = await fetch(`${server.url}/v1/bp-push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bp, receivers: ['charlie@team.com'] }),
    });
    const body = await res.json();
    console.log(`[seed] pushed ${bp.id}: HTTP ${res.status} →`, body.ok ? 'ok' : body);
  }

  console.log('[bpp-screenshot-server] ready for Chrome');
  console.log('  • Dashboard      : ' + server.url + '/');
  console.log('  • Charlie inbox  : ' + server.url + '/v1/inbox?receiver=charlie@team.com');
  console.log('  • cc-status all  : ' + server.url + '/api/cc-status/all');
  console.log('[bpp-screenshot-server] press Ctrl+C to stop');

  process.on('SIGINT', async () => {
    console.log('\n[bpp-screenshot-server] shutting down…');
    await server.close();
    process.exit(0);
  });

  // Keep alive indefinitely
  setInterval(() => {}, 60_000);
}

main().catch((err) => {
  console.error('server failed:', err);
  process.exit(1);
});
