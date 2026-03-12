import { describe, expect, it } from 'vitest';

import { resolveStoreSelection } from './stores';

const stores = [
  { id: 'store-1', name: 'Main Store' },
  { id: 'store-2', name: 'Annex' },
];

describe('resolveStoreSelection', () => {
  it('returns the selected store when it exists', () => {
    expect(resolveStoreSelection(stores, 'store-2', 'ALL')).toBe('store-2');
  });

  it('falls back when the selected store is invalid', () => {
    expect(resolveStoreSelection(stores, 'missing', 'ALL')).toBe('ALL');
  });

  it('falls back when no selected store is provided', () => {
    expect(resolveStoreSelection(stores, undefined, null)).toBeNull();
  });
});