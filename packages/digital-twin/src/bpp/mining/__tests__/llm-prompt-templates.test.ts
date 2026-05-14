// Prompt template tests — verify each template emits a non-empty string that
// instructs the model to return JSON-only output per spec §3.5.
import { describe, it, expect } from 'vitest';
import {
  promptForRule,
  promptForHabit,
  promptForContextMgmt,
  type SessionExcerpt,
} from '../llm-prompt-templates.js';

const sessions: SessionExcerpt[] = [
  { user_id: 'alice@team', transcript_excerpt: 'use rg instead of grep next time' },
  { user_id: 'bob@team', transcript_excerpt: 'do not commit .env files' },
];

describe('llm-prompt-templates', () => {
  it('promptForRule returns a non-empty string that contains the JSON-only contract', () => {
    const p = promptForRule(sessions);
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(100);
    expect(p).toMatch(/JSON/);
    expect(p).toMatch(/candidates/);
    expect(p).toMatch(/no prose/i);
    // user excerpts must be embedded so the model can see them
    expect(p).toContain('alice@team');
    expect(p).toContain('use rg instead of grep');
  });

  it('promptForHabit returns a non-empty string with the JSON contract and habit framing', () => {
    const p = promptForHabit(sessions);
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(100);
    expect(p).toMatch(/JSON/);
    expect(p).toMatch(/habit/i);
    expect(p).toMatch(/before.*always/i);
    expect(p).toContain('bob@team');
  });

  it('promptForContextMgmt returns a non-empty string with the JSON contract and context framing', () => {
    const p = promptForContextMgmt(sessions);
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(100);
    expect(p).toMatch(/JSON/);
    expect(p).toMatch(/context/i);
    expect(p).toMatch(/candidates/);
  });

  it('all three templates tolerate an empty session list and still demand JSON-only', () => {
    for (const fn of [promptForRule, promptForHabit, promptForContextMgmt]) {
      const p = fn([]);
      expect(p.length).toBeGreaterThan(50);
      expect(p).toMatch(/JSON/);
      // empty-list branch is the docstring "no sessions provided"
      expect(p).toMatch(/no sessions provided/);
    }
  });

  it('templates are pure functions: same input → same output', () => {
    expect(promptForRule(sessions)).toBe(promptForRule(sessions));
    expect(promptForHabit(sessions)).toBe(promptForHabit(sessions));
    expect(promptForContextMgmt(sessions)).toBe(promptForContextMgmt(sessions));
  });
});
