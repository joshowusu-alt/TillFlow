import { describe, expect, it, vi } from 'vitest';
import { coalesceInFlightRead } from './in-flight-read';

describe('overlapping database read coalescing', () => {
  it('shares overlap only, then reads fresh after completion', async () => {
    let resolve!: (value: number) => void;
    const read = vi.fn(() => new Promise<number>(r => { resolve = r; }));
    const first = coalesceInFlightRead('same', read);
    const second = coalesceInFlightRead('same', read);
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    resolve(1);
    expect(await Promise.all([first, second])).toEqual([1, 1]);
    const fresh = vi.fn(async () => 2);
    expect(await coalesceInFlightRead('same', fresh)).toBe(2);
    expect(fresh).toHaveBeenCalledTimes(1);
  });
  it('never shares different tenant/store keys', async () => {
    expect(await Promise.all([
      coalesceInFlightRead('tenant-a/store-a', async () => 'a'),
      coalesceInFlightRead('tenant-b/store-a', async () => 'b'),
    ])).toEqual(['a', 'b']);
  });
  it('fans out a rejection and allows a later successful retry', async () => {
    const fail = vi.fn(async () => { throw new Error('temporary database failure'); });
    const results = await Promise.allSettled([
      coalesceInFlightRead('retry', fail), coalesceInFlightRead('retry', fail),
    ]);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(results.map(r => r.status)).toEqual(['rejected', 'rejected']);
    expect(await coalesceInFlightRead('retry', async () => 3)).toBe(3);
  });
});
