import { describe, it, expect } from 'vitest';
import {
  readConfigAsync,
  writeConfigAsync,
  fetchUserAsync,
  batchInsertAsync,
  streamLinesAsync,
} from './starter/modern';

describe('Promise wrappers', () => {
  it('readConfigAsync rejects on missing', async () => {
    await expect(readConfigAsync('/none')).rejects.toThrow(/config not found/);
  });

  it('writeConfigAsync + readConfigAsync roundtrip', async () => {
    await writeConfigAsync('/a', { key: 'a', value: 1 });
    const v = await readConfigAsync('/a');
    expect(v).toEqual({ key: 'a', value: 1 });
  });

  it('fetchUserAsync resolves known user', async () => {
    const u = await fetchUserAsync(1);
    expect(u.name).toBe('alice');
  });

  it('fetchUserAsync rejects unknown user', async () => {
    await expect(fetchUserAsync(999)).rejects.toThrow(/user 999 not found/);
  });

  it('batchInsertAsync resolves count', async () => {
    const c = await batchInsertAsync([1, 2, 3]);
    expect(c).toBe(3);
  });

  it('batchInsertAsync rejects on negative', async () => {
    await expect(batchInsertAsync([1, -2])).rejects.toThrow();
  });

  it('Promise.all concurrent fetches', async () => {
    const all = await Promise.all([fetchUserAsync(1), fetchUserAsync(2)]);
    expect(all.map((u) => u.name)).toEqual(['alice', 'bob']);
  });

  it('streamLinesAsync yields each line', async () => {
    const lines: string[] = [];
    for await (const l of streamLinesAsync('one\ntwo\nthree')) lines.push(l);
    expect(lines).toEqual(['one', 'two', 'three']);
  });

  it('streamLinesAsync throws on empty', async () => {
    await expect((async () => {
      for await (const _ of streamLinesAsync('')) void _;
    })()).rejects.toThrow();
  });
});
