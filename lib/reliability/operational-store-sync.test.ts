import { describe, expect, it } from 'vitest';
import { isStaleOperationalStore, parseOperationalStoreSignal } from './operational-store-sync';

describe('operational store multi-tab signal', () => {
  it('treats a different broadcast store as stale', () => {
    expect(
      isStaleOperationalStore('store-a', { id: 'store-b', name: 'Walkthrough Store B', ts: 1 }),
    ).toBe(true);
  });

  it('keeps a matching tab live', () => {
    expect(
      isStaleOperationalStore('store-b', { id: 'store-b', name: 'Walkthrough Store B', ts: 1 }),
    ).toBe(false);
  });

  it('parses a stored signal and ignores junk', () => {
    expect(parseOperationalStoreSignal('{"id":"store-b","name":"Store B","ts":9}')).toEqual({
      id: 'store-b',
      name: 'Store B',
      ts: 9,
    });
    expect(parseOperationalStoreSignal('not-json')).toBeNull();
  });
});
