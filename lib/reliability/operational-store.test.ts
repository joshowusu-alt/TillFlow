import { describe, expect, it } from 'vitest';
import {
  ALL_BRANCHES_NOT_OPERATIONAL_MSG,
  FOREIGN_OPERATIONAL_STORE_MSG,
  INACTIVE_OPERATIONAL_STORE_MSG,
  MISSING_OPERATIONAL_STORE_MSG,
  MULTI_TAB_OPERATIONAL_STORE_CONTRACT,
  isOperationalRoute,
  resolveOperationalStore,
  withOperationalStoreQuery,
} from './operational-store';

const storeA = { id: 'store-a', name: 'Walkthrough Store A' };
const storeB = { id: 'store-b', name: 'Walkthrough Store B' };
const authorised = [storeA, storeB];

describe('resolveOperationalStore', () => {
  it('never falls back to the first store among many', () => {
    const result = resolveOperationalStore({ stores: authorised });
    expect(result.store).toBeNull();
    expect(result.reason).toBe('unselected');
    expect(result.error).toBe(MISSING_OPERATIONAL_STORE_MSG);
  });

  it('uses the cookie store and ignores created order', () => {
    const result = resolveOperationalStore({
      stores: authorised,
      cookieStoreId: 'store-b',
    });
    expect(result.store?.id).toBe('store-b');
    expect(result.reason).toBe('cookie');
    expect(result.error).toBeNull();
  });

  it('accepts a URL storeId only when it matches the cookie', () => {
    const match = resolveOperationalStore({
      stores: authorised,
      cookieStoreId: 'store-b',
      urlStoreId: 'store-b',
    });
    expect(match.store?.id).toBe('store-b');
    expect(match.reason).toBe('url-match');
    expect(match.conflict).toBeNull();

    const conflict = resolveOperationalStore({
      stores: authorised,
      cookieStoreId: 'store-a',
      urlStoreId: 'store-b',
    });
    expect(conflict.store?.id).toBe('store-a');
    expect(conflict.conflict).toEqual({
      urlStoreId: 'store-b',
      operationalStoreId: 'store-a',
      urlStoreName: 'Walkthrough Store B',
    });
  });

  it('rejects a foreign storeId without substituting Store A', () => {
    const result = resolveOperationalStore({
      stores: authorised,
      cookieStoreId: 'store-a',
      urlStoreId: 'store-foreign',
    });
    expect(result.store).toBeNull();
    expect(result.reason).toBe('foreign-rejected');
    expect(result.error).toBe(FOREIGN_OPERATIONAL_STORE_MSG);
  });

  it('clears an inactive saved store and does not pick the first remaining store', () => {
    const result = resolveOperationalStore({
      stores: [
        { ...storeA, active: true },
        { ...storeB, active: false },
        { id: 'store-c', name: 'Walkthrough Store C', active: true },
      ],
      cookieStoreId: 'store-b',
    });
    expect(result.store).toBeNull();
    expect(result.reason).toBe('inactive-cleared');
    expect(result.shouldClearCookie).toBe(true);
    expect(result.error).toBe(INACTIVE_OPERATIONAL_STORE_MSG);
  });

  it('uses the sole remaining active store when the saved store is gone', () => {
    const result = resolveOperationalStore({
      stores: [{ ...storeB, active: true }],
      cookieStoreId: 'store-a',
    });
    expect(result.store?.id).toBe('store-b');
    expect(result.reason).toBe('sole');
    expect(result.shouldClearCookie).toBe(true);
  });

  it('selects a sole store without a cookie', () => {
    expect(resolveOperationalStore({ stores: [storeB] }).store?.id).toBe('store-b');
  });

  it('does not treat ALL as an operational store', () => {
    const result = resolveOperationalStore({
      stores: authorised,
      urlStoreId: 'ALL',
    });
    expect(result.store).toBeNull();
    expect(result.reason).toBe('unselected');
  });
});

describe('operational route helpers', () => {
  it('marks mutation pages as operational and leaves reports alone', () => {
    expect(isOperationalRoute('/shifts')).toBe(true);
    expect(isOperationalRoute('/pos')).toBe(true);
    expect(isOperationalRoute('/payments/supplier-payments')).toBe(true);
    expect(isOperationalRoute('/reports/dashboard')).toBe(false);
    expect(isOperationalRoute('/onboarding')).toBe(false);
  });

  it('appends storeId only on operational routes', () => {
    expect(withOperationalStoreQuery('/shifts', 'store-b')).toBe('/shifts?storeId=store-b');
    expect(withOperationalStoreQuery('/reports/dashboard', 'store-b')).toBe('/reports/dashboard');
  });

  it('documents multi-tab cookie behaviour', () => {
    expect(MULTI_TAB_OPERATIONAL_STORE_CONTRACT).toContain('last-write-wins');
    expect(ALL_BRANCHES_NOT_OPERATIONAL_MSG).toMatch(/All branches/i);
  });
});
