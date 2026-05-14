// BPP compile-to-skill — render a BestPractice as a Claude Code Skill SKILL.md.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §4.6.
// Design notes:
//   - The output shape mirrors `formatAsAgentSkill` (frontmatter `name` +
//     `description` block, then markdown body), but we render from a
//     BestPractice rather than a KnowledgeEntry. They are different schemas, so
//     we don't try to share a function.
//   - `userHome` is REQUIRED — no `os.homedir()` default. This forces tests to
//     pass a tmpdir and prevents accidental writes to a real $HOME.
//   - The bp_id is validated with the same ID regex used by `store.ts` so we
//     never write `~/.claude/skills/teamagent/../etc/passwd/SKILL.md`.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import type { BestPractice } from './types.js';

const ID_RE = /^[a-zA-Z0-9._-]+$/;

function assertSafeId(id: string): void {
  if (!ID_RE.test(id) || id.includes('..')) {
    throw new Error(`invalid bp id: ${id}`);
  }
}

const MAX_DESCRIPTION_LENGTH = 400;

function renderSkillMd(bp: BestPractice): string {
  const summary = bp.title.length > MAX_DESCRIPTION_LENGTH
    ? bp.title.slice(0, MAX_DESCRIPTION_LENGTH - 1) + '…'
    : bp.title;

  const frontmatter = [
    '---',
    `name: ${bp.id}`,
    'description: >',
    `  ${summary}`,
    `  使用场景：${bp.topic}`,
    `  推送方：${bp.pushed_by_display}`,
    '---',
  ].join('\n');

  const lines: string[] = [
    `# ${bp.title}`,
    '',
    '## 背景',
    '',
    bp.body,
    '',
    '## 示例',
    '',
    bp.example,
    '',
    '## 元信息',
    '',
    `- BP ID: ${bp.id}`,
    `- Type: ${bp.type}`,
    `- Topic: ${bp.topic}`,
    `- Tier: ${bp.confidence_tier}`,
    `- Confidence: ${bp.confidence_score.toFixed(2)}`,
    `- Pushed by: ${bp.pushed_by_display} <${bp.pushed_by}>`,
    `- Created: ${bp.created_at}`,
  ];

  return frontmatter + '\n\n' + lines.join('\n') + '\n';
}

export interface CompileBpToSkillResult {
  path: string;
  bytes_written: number;
}

/**
 * Render a BestPractice as Skill markdown and write it to
 * `<userHome>/.claude/skills/teamagent/<bp_id>/SKILL.md`. Idempotent: second
 * call rewrites in place with identical bytes.
 *
 * Returns the absolute path written and the byte length of the file content.
 */
export function compileBpToSkill(bp: BestPractice, userHome: string): CompileBpToSkillResult {
  assertSafeId(bp.id);

  const baseDir = resolvePath(userHome, '.claude', 'skills', 'teamagent');
  const targetDir = join(baseDir, bp.id);
  const target = join(targetDir, 'SKILL.md');

  // Defence in depth: even after assertSafeId, double-check we never escape
  // baseDir via some odd character set.
  if (!targetDir.startsWith(baseDir)) {
    throw new Error('path traversal');
  }

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const content = renderSkillMd(bp);
  writeFileSync(target, content, 'utf8');

  return { path: target, bytes_written: Buffer.byteLength(content, 'utf8') };
}
