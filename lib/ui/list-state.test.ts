import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildListHref,
  clearListState,
  isBareListState,
  listStateKey,
  readListState,
  restoreListScroll,
  writeListState,
} from './list-state';

describe('list-state', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('restores scroll once the document is tall enough, not on the first short frame', async () => {
    writeListState('/products', { q: 'walk', scrollY: 420 });
    let scrollHeight = 600; // shorter than viewport + 420 at first (rows still streaming)
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    let currentY = 0;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => currentY });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((opts: any) => {
      currentY = typeof opts === 'object' ? opts.top : opts;
    });
    let frames = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      frames += 1;
      if (frames === 3) scrollHeight = 2000; // list rows landed
      queueMicrotask(() => cb(performance.now()));
      return frames;
    });

    await expect(restoreListScroll('/products')).resolves.toBe(420);
    expect(scrollTo).toHaveBeenCalledWith({ top: 420, left: 0, behavior: 'auto' });
    expect(frames).toBeGreaterThanOrEqual(3);
    expect(currentY).toBe(420);
  });

  it('resolves null when nothing is stored', async () => {
    await expect(restoreListScroll('/nothing')).resolves.toBeNull();
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
