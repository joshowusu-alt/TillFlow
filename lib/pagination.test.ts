import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PAGE_SIZE } from '@/lib/format';
import { listPageWindow, rowsForListPage } from './pagination';

describe('listPageWindow', () => {
  it('sends a page past the end back to page 1, even when a later page still has rows', () => {
    expect(listPageWindow(2, 24, DEFAULT_PAGE_SIZE)).toEqual({
      page: 1,
      totalPages: 1,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
    expect(listPageWindow(9, 50, 25)).toEqual({
      page: 1,
      totalPages: 2,
      skip: 0,
      take: 25,
    });
  });

  it('keeps an in-range page and treats an empty list as page 1', () => {
    expect(listPageWindow(2, 40, 25)).toMatchObject({ page: 2, totalPages: 2, skip: 25 });
    expect(listPageWindow(4, 0, 25)).toEqual({ page: 1, totalPages: 1, skip: 0, take: 25 });
    expect(listPageWindow(Number.NaN, 10, 25).page).toBe(1);
  });
});

describe('rowsForListPage', () => {
  it('reloads page 1 when the requested page is past the end', async () => {
    const loadPage = vi.fn(async (page: number) => [`page-${page}`]);
    const listed = await rowsForListPage(9, 50, 25, [], loadPage);
    expect(listed).toEqual({ page: 1, totalPages: 2, rows: ['page-1'] });
    expect(loadPage).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('does not reload when the list is empty or the page exists', async () => {
    const loadPage = vi.fn(async () => ['extra']);
    expect(await rowsForListPage(2, 0, 25, [], loadPage)).toEqual({ page: 1, totalPages: 1, rows: [] });
    expect(await rowsForListPage(1, 24, 25, ['kept'], loadPage)).toEqual({ page: 1, totalPages: 1, rows: ['kept'] });
    expect(loadPage).not.toHaveBeenCalled();
  });
});
