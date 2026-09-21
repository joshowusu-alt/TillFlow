import { beforeEach, describe, expect, it } from 'vitest';
import {
  OPERATIONAL_STORE_SIGNAL_KEY,
  OPERATIONAL_STORE_TAB_KEY,
  getOperationalStoreTabId,
  isStaleOperationalStore,
  parseOperationalStoreSignal,
  publishOperationalStoreSignal,
  revertOperationalStoreSignal,
  signalFromBroadcast,
} from './operational-store-sync';

describe('operational store multi-tab signal', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('never treats a tab\'s own pending switch as another tab', () => {
    expect(
      isStaleOperationalStore('store-a', { id: 'store-b', name: 'Store B', ts: 5, tabId: 'tab-1' }, 1, 'tab-1'),
    ).toBe(false);
    expect(
      isStaleOperationalStore('store-a', { id: 'store-b', name: 'Store B', ts: 5, tabId: 'tab-1' }, 1, 'tab-2'),
    ).toBe(true);
    // Untagged legacy signals still count.
    expect(isStaleOperationalStore('store-a', { id: 'store-b', name: 'Store B', ts: 5 }, 1, 'tab-1')).toBe(true);
  });

  it('tags published signals with a stable per-tab id', () => {
    const tabId = getOperationalStoreTabId();
    expect(tabId).toBeTruthy();
    expect(window.sessionStorage.getItem(OPERATIONAL_STORE_TAB_KEY)).toBe(tabId);
    publishOperationalStoreSignal({ id: 'store-b', name: 'Store B' });
    const stored = parseOperationalStoreSignal(window.localStorage.getItem(OPERATIONAL_STORE_SIGNAL_KEY));
    expect(stored).toMatchObject({ id: 'store-b', name: 'Store B', tabId });
  });

  it('reverts to the previous authoritative branch after a failed switch', () => {
    publishOperationalStoreSignal({ id: 'store-b', name: 'Store B' });
    revertOperationalStoreSignal({ id: 'store-a', name: 'Store A' });
    const stored = parseOperationalStoreSignal(window.localStorage.getItem(OPERATIONAL_STORE_SIGNAL_KEY));
    expect(stored).toMatchObject({ id: 'store-a', name: 'Store A' });
    // A Store A tab elsewhere is live again; a Store B tab is now the stale one.
    expect(isStaleOperationalStore('store-a', stored, 0, 'other-tab')).toBe(false);
    expect(isStaleOperationalStore('store-b', stored, 0, 'other-tab')).toBe(true);
  });

  it('clears the signal when a first-ever switch fails (no previous branch)', () => {
    publishOperationalStoreSignal({ id: 'store-b', name: 'Store B' });
    revertOperationalStoreSignal(null);
    expect(window.localStorage.getItem(OPERATIONAL_STORE_SIGNAL_KEY)).toBeNull();
    expect(signalFromBroadcast({ id: '', name: '', ts: 1, cleared: true })).toBeNull();
    expect(signalFromBroadcast({ id: 'store-b', name: 'Store B', ts: 1, tabId: 't' })).toEqual({
      id: 'store-b',
      name: 'Store B',
      ts: 1,
      tabId: 't',
    });
  });

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

  it('treats an empty-cookie tab as stale once another tab switches after it loaded', () => {
    const loadedAt = 1_000;
    expect(
      isStaleOperationalStore(null, { id: 'store-b', name: 'Walkthrough Store B', ts: 1_500 }, loadedAt),
    ).toBe(true);
    expect(
      isStaleOperationalStore('', { id: 'store-b', name: 'Walkthrough Store B', ts: 1_500 }, loadedAt),
    ).toBe(true);
  });

  it('does not trap an empty-cookie tab on a leftover signal older than the tab', () => {
    expect(
      isStaleOperationalStore(null, { id: 'store-b', name: 'Walkthrough Store B', ts: 500 }, 1_000),
    ).toBe(false);
    expect(isStaleOperationalStore(null, { id: 'store-b', name: 'Store B', ts: 500 })).toBe(false);
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
