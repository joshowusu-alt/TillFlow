import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('./list-navigation', () => ({ replaceListDocument: navigation.replace }));

import { readListState, writeListState } from './list-state';
import { isOnListRoute, leavesListRoute, useListState } from './use-list-state';

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
}

async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
  });
}

describe('useListState scroll persistence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    navigation.replace.mockClear();
    window.history.replaceState(null, '', '/products?q=Rice');
    setScrollY(0);
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 3000 });
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('isOnListRoute compares the pathname only', () => {
    expect(isOnListRoute('/products')).toBe(true);
    window.history.replaceState(null, '', '/products/labels');
    expect(isOnListRoute('/products')).toBe(false);
  });

  it('honours explicit GET navigation instead of restoring a stale query', () => {
    writeListState('/products', { q: 'Old query', page: 2 });
    window.history.replaceState(null, '', '/products?resetList=1');
    renderHook(() => useListState('/products', { q: '', page: 1, restoreOnBareRoute: true }));
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('still restores the last query on an ordinary bare-route revisit', () => {
    writeListState('/products', { q: 'Old query', page: 2 });
    window.history.replaceState(null, '', '/products');
    renderHook(() => useListState('/products', { q: '', page: 1, restoreOnBareRoute: true }));
    expect(navigation.replace).toHaveBeenCalledWith('/products?q=Old+query&page=2');
    expect(readListState('/products')?.q).toBe('Old query');
  });

  it('retains changed filters when a later scroll persists the same search/page', async () => {
    const { rerender } = renderHook(({ category }) => useListState('/products', { q: 'Rice', page: 1, filters: { category } }), { initialProps: { category: 'old' } });
    await flushFrames();
    rerender({ category: 'new' });
    setScrollY(300);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    await flushFrames();
    expect(readListState('/products')?.filters?.category).toBe('new');
  });

  it('keeps the list offset when the window scrolls to the top of a record page', async () => {
    writeListState('/products', { q: 'Rice', page: 1, scrollY: 0 });
    renderHook(() => useListState('/products', { q: 'Rice', page: 1 }));
    await flushFrames(); // initial restore settles and unlocks persistence

    setScrollY(420);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    await flushFrames();
    expect(readListState('/products')?.scrollY).toBe(420);

    // Navigate to a record: URL changes first, then the framework scrolls to top.
    window.history.pushState(null, '', '/products/abc123');
    setScrollY(0);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    await flushFrames();
    expect(readListState('/products')?.scrollY).toBe(420);
  });

  it('ignores the clamp-to-top caused by a loading skeleton while the URL still says the list', async () => {
    writeListState('/products', { q: 'Rice', page: 1, scrollY: 0 });
    renderHook(() => useListState('/products', { q: 'Rice', page: 1 }));
    await flushFrames();
    setScrollY(420);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    await flushFrames();
    expect(readListState('/products')?.scrollY).toBe(420);

    // Content swapped for a short skeleton: document can no longer hold 420, browser clamps to 0.
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 300 });
    setScrollY(0);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    await flushFrames();
    expect(readListState('/products')?.scrollY).toBe(420);

    // A genuine scroll to the top of a tall list is still persisted.
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 3000 });
    act(() => { window.dispatchEvent(new Event('scroll')); });
    await flushFrames();
    expect(readListState('/products')?.scrollY).toBe(0);
  });

  it('snapshots the offset when a record link is clicked and pauses persistence', async () => {
    writeListState('/products', { q: 'Rice', page: 1, scrollY: 0 });
    renderHook(() => useListState('/products', { q: 'Rice', page: 1 }));
    await flushFrames();
    const link = document.createElement('a');
    link.setAttribute('href', '/products/abc123');
    link.addEventListener('click', (event) => event.preventDefault()); // jsdom cannot navigate
    document.body.appendChild(link);

    setScrollY(640);
    act(() => { link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(readListState('/products')?.scrollY).toBe(640);

    setScrollY(0);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    await flushFrames();
    expect(readListState('/products')?.scrollY).toBe(640);
    link.remove();
  });

  it('does not treat a same-list link (pagination, tab) as leaving', () => {
    expect(leavesListRoute('/products', '/products?page=2')).toBe(false);
    expect(leavesListRoute('/products', '/products/abc123')).toBe(true);
    expect(leavesListRoute('/suppliers', '/suppliers/orphans')).toBe(true);
    expect(leavesListRoute('/products', 'https://example.com/x')).toBe(true);
  });
});
