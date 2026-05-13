// BPP Phase 1 live demo — spins up mock-server, POSTs a BestPractice,
// reads the inbox back, prints every step for evidence capture.
//
// Run: npx tsx docs/plans/2026-05-13-bpp-poc/evidence/run-demo.ts
//
// Output is captured into evidence/demo-stdout.txt for the HTML report.

import { mkdtempSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startMockServer } from '../../../../packages/digital-twin/src/mock-server.js';

const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

function log(label: string, body: unknown): void {
  console.log(`\n${CYAN}━━━ ${label} ━━━${RESET}`);
  if (typeof body === 'string') {
    console.log(body);
  } else {
    console.log(JSON.stringify(body, null, 2));
  }
}

async function main(): Promise<void> {
  const outputDir = mkdtempSync(join(tmpdir(), 'bpp-demo-'));
  log('Step 0 · spin up mock-server', `outputDir = ${outputDir}`);
  const server = await startMockServer({ port: 0, outputDir });
  console.log(`${GREEN}server URL: ${server.url}${RESET}`);

  // ─────────────────────────────── Alice 推一条 best practice ──
  const bp = {
    schema_version: 1 as const,
    id: 'bp-demo-2026-05-13-mock-db',
    type: 'rule' as const,
    title: '测试时不要 mock 数据库',
    body: 'Mocking the database hides migration bugs. Use a real local DB (sqlite/duckdb) in tests; the speed difference is < 50ms per test and the integration-bug coverage is huge.',
    example:
      'PR #200: alice mocked the user_session table; tests passed; the prod migration that renamed the column shipped; broke for 4 hours.',
    pushed_by: 'alice@team.com',
    pushed_by_display: 'Alice',
    topic: 'testing' as const,
    confidence_score: 0.87,
    confidence_tier: 'canonical' as const,
    conflict_with: [],
    mining_evidence: {
      sessions_observed: 12,
      pattern_count: 9,
      reject_count: 0,
      extraction_method: 'behavior-mining-v1',
    },
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    created_at: new Date().toISOString(),
  };

  log('Step 1 · Alice 自动推送一条 BestPractice (推送方完全隐形)', bp);

  const pushRes = await fetch(`${server.url}/v1/bp-push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bp, receivers: ['bob@team.com', 'charlie@team.com'] }),
  });
  const pushBody = await pushRes.json();
  log(`Step 2 · server response (HTTP ${pushRes.status})`, pushBody);

  // ─────────────────────────────── Bob 查 inbox ──
  const bobRes = await fetch(`${server.url}/v1/inbox?receiver=bob%40team.com`);
  const bobBody = await bobRes.json();
  log(`Step 3 · Bob 查 inbox (HTTP ${bobRes.status})`, bobBody);

  // ─────────────────────────────── Charlie 查 inbox ──
  const charlieRes = await fetch(`${server.url}/v1/inbox?receiver=charlie%40team.com`);
  const charlieBody = await charlieRes.json();
  log(`Step 4 · Charlie 查 inbox (HTTP ${charlieRes.status})`, charlieBody);

  // ─────────────────────────────── 检查 audit log ──
  const today = new Date().toISOString().slice(0, 10);
  const auditPath = join(outputDir, '_audit', `${today}.jsonl`);
  if (existsSync(auditPath)) {
    log('Step 5 · 审计日志 (PushEvent JSONL)', readFileSync(auditPath, 'utf8').trim());
  } else {
    log('Step 5 · 审计日志', `${YELLOW}NOT FOUND at ${auditPath}${RESET}`);
  }

  // ─────────────────────────────── 检查 _bp 存储 ──
  const bpDir = join(outputDir, '_bp');
  if (existsSync(bpDir)) {
    const files = readdirSync(bpDir);
    log('Step 6 · _bp 存储目录', `${files.length} 个文件: ${files.join(', ')}`);
  }

  // ─────────────────────────────── 410 error path 演示 ──
  const malformedRes = await fetch(`${server.url}/v1/bp-push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ receivers: ['bob@team.com'] }),
  });
  log(`Step 7 · malformed body → HTTP ${malformedRes.status}`, await malformedRes.json());

  console.log(`\n${GREEN}━━━ DEMO COMPLETE ━━━${RESET}`);
  console.log(`${DIM}Server stays up so you can hit /dashboard manually:${RESET}`);
  console.log(`  ${server.url}/`);
  console.log(`${DIM}Press Ctrl+C to stop, or auto-shutdown in 2s for CI.${RESET}`);

  // Auto-shutdown for non-interactive capture
  await new Promise((r) => setTimeout(r, 2000));
  await server.close();
  console.log(`${GREEN}server closed.${RESET}`);
}

main().catch((err) => {
  console.error('demo failed:', err);
  process.exit(1);
});
