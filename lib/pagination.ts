/**
 * Page window for a skip/take list.
 * A page past the end always goes back to page 1, including when later pages
 * still have rows. An empty list is also page 1.
 */
export function listPageWindow(requestedPage: number, totalCount: number, pageSize: number) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 1;
  const total = Number.isInteger(totalCount) && totalCount > 0 ? totalCount : 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const requested = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const page = requested > totalPages ? 1 : requested;
  return { page, totalPages, skip: (page - 1) * size, take: size };
}

/**
 * Keep the rows already loaded when the requested page exists.
 * When it does not, load page 1 instead of returning an empty slice.
 */
export async function rowsForListPage<T>(
  requestedPage: number,
  totalCount: number,
  pageSize: number,
  fetchedRows: T[],
  loadPage: (page: number) => Promise<T[]>,
): Promise<{ page: number; totalPages: number; rows: T[] }> {
  const window = listPageWindow(requestedPage, totalCount, pageSize);
  if (totalCount === 0 || window.page === requestedPage) {
    return { page: window.page, totalPages: window.totalPages, rows: fetchedRows };
  }
  return {
    page: window.page,
    totalPages: window.totalPages,
    rows: await loadPage(window.page),
  };
}
