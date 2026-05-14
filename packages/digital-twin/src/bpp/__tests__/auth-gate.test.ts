// Phase 5 P5.3 — Auth gate for BPP /api/* endpoints.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6.3
// (server-side bearer-token gate; HTTPS hardening is caller's responsibility).

import { describe, it, expect } from 'vitest';
import type { IncomingHttpHeaders } from 'node:http';
import { requireBearerToken } from '../auth-gate.js';

describe('requireBearerToken', () => {
  it('returns ok=true when Authorization header matches Bearer <token>', () => {
    const headers: IncomingHttpHeaders = { authorization: 'Bearer secret-abc123' };
    const result = requireBearerToken(headers, 'secret-abc123');
    expect(result).toEqual({ ok: true });
  });

  it('returns ok=false unauthorized when header is missing', () => {
    const headers: IncomingHttpHeaders = {};
    const result = requireBearerToken(headers, 'secret-abc123');
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('returns ok=false unauthorized when token does not match', () => {
    const headers: IncomingHttpHeaders = { authorization: 'Bearer wrong-token' };
    const result = requireBearerToken(headers, 'secret-abc123');
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('returns ok=false unauthorized when scheme is not Bearer', () => {
    const headers: IncomingHttpHeaders = { authorization: 'Basic secret-abc123' };
    const result = requireBearerToken(headers, 'secret-abc123');
    expect(result).toEqual({ ok: false, error: 'unauthorized' });
  });
});
