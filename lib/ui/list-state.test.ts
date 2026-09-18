import { afterEach, describe, expect, it } from 'vitest';
import {
  buildListHref,
  clearListState,
  isBareListState,
  listStateKey,
  readListState,
  writeListState,
} from './list-state';

describe('list-state', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('persists search, filters, page, tab, and scroll by route', () => {
    writeListState('/products', {
      q: 'milo',
      page: 2,
      tab: 'products',
      filters: { issue: 'MISSING_COST' },
      scrollY: 180,
    });

    expect(listStateKey('/products')).toBe('tillflow:list-state:/products');
    expect(readListState('/products')).toEqual({
      q: 'milo',
      page: 2,
      tab: 'products',
      filters: { issue: 'MISSING_COST' },
      scrollY: 180,
    });
    expect(buildListHref('/products', readListState('/products')!)).toBe(
      '/products?q=milo&tab=products&page=2&issue=MISSING_COST',
    );
  });

  it('treats the default catalogue view as a bare route', () => {
    expect(isBareListState({ q: '', page: 1, tab: 'products' }, { tab: 'products' })).toBe(true);
    expect(isBareListState({ q: 'rice', page: 1, tab: 'products' }, { tab: 'products' })).toBe(false);
    expect(isBareListState({ q: '', page: 3, tab: 'products' }, { tab: 'products' })).toBe(false);
  });

  it('clears a route without touching another list', () => {
    writeListState('/products', { q: 'a' });
    writeListState('/products/labels', { q: 'b' });
    clearListState('/products');
    expect(readListState('/products')).toBeNull();
    expect(readListState('/products/labels')?.q).toBe('b');
  });
});
