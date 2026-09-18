import { describe, expect, it, vi } from 'vitest';
import {
  INVALID_STORE_CONTEXT_MSG,
  MISSING_STORE_CONTEXT_MSG,
  STORE_MISMATCH_MSG,
  assertRequestedStoreMatchesSource,
  assertSelectedStoreForBusiness,
  requireExplicitStoreId,
  resolveSoleOrSelectedStoreId,
  resolveStoreFromTill,
  withStoreQuery,
} from './selected-store';

describe('selected store enforcement', () => {
  it('uses the only store and never auto-selects the first of many', () => {
    expect(resolveSoleOrSelectedStoreId([{ id: 'store-only' }])).toBe('store-only');
    expect(
      resolveSoleOrSelectedStoreId([{ id: 'store-a' }, { id: 'store-b' }]),
    ).toBeNull();
    expect(
      resolveSoleOrSelectedStoreId([{ id: 'store-a' }, { id: 'store-b' }], 'store-b'),
    ).toBe('store-b');
    expect(
      resolveSoleOrSelectedStoreId([{ id: 'store-a' }, { id: 'store-b' }], 'store-other'),
    ).toBeNull();
  });

  it('fails closed when storeId is missing or blank', () => {
    expect(() => requireExplicitStoreId(undefined)).toThrow(MISSING_STORE_CONTEXT_MSG);
    expect(() => requireExplicitStoreId('')).toThrow(MISSING_STORE_CONTEXT_MSG);
    expect(() => requireExplicitStoreId('   ')).toThrow(MISSING_STORE_CONTEXT_MSG);
  });

  it('never substitutes the first store when the requested id is foreign', async () => {
    const db = {
      store: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    await expect(assertSelectedStoreForBusiness('biz-a', 'store-other', db)).rejects.toThrow(
      INVALID_STORE_CONTEXT_MSG,
    );
    expect(db.store.findFirst).toHaveBeenCalledWith({
      where: { id: 'store-other', businessId: 'biz-a' },
      select: { id: true },
    });
  });

  it('accepts an explicit store that belongs to the business', async () => {
    const db = {
      store: {
        findFirst: vi.fn().mockResolvedValue({ id: 'store-b' }),
      },
    };
    await expect(assertSelectedStoreForBusiness('biz-a', 'store-b', db)).resolves.toEqual({
      id: 'store-b',
    });
  });

  it('rejects a requested store that does not match the source record', () => {
    expect(() => assertRequestedStoreMatchesSource('store-a', 'store-b')).toThrow(STORE_MISMATCH_MSG);
    expect(assertRequestedStoreMatchesSource(undefined, 'store-b')).toBe('store-b');
    expect(assertRequestedStoreMatchesSource('store-b', 'store-b')).toBe('store-b');
  });

  it('preserves storeId on shift navigation and refresh paths', () => {
    expect(withStoreQuery('/shifts', 'store-b')).toBe('/shifts?storeId=store-b');
    expect(withStoreQuery('/shifts/drawer?type=CASH_SALE', 'store-b')).toBe(
      '/shifts/drawer?type=CASH_SALE&storeId=store-b',
    );
    expect(withStoreQuery('/shifts', null)).toBe('/shifts');
    expect(withStoreQuery('/shifts', '   ')).toBe('/shifts');
  });

  it('derives store from an explicit till and rejects a mismatched selected store', async () => {
    const db = {
      till: {
        findFirst: vi.fn().mockResolvedValue({ id: 'till-b', storeId: 'store-b' }),
      },
    };
    await expect(resolveStoreFromTill('biz-a', 'till-b', 'store-b', db)).resolves.toEqual({
      tillId: 'till-b',
      storeId: 'store-b',
    });
    await expect(resolveStoreFromTill('biz-a', 'till-b', 'store-a', db)).rejects.toThrow(
      STORE_MISMATCH_MSG,
    );
  });
});
