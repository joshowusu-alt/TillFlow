import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
  pageSize?: number;
  pageSizeOptions?: number[];
}

export default function Pagination({
  currentPage,
  totalPages,
  basePath,
  searchParams = {},
  pageSize,
  pageSizeOptions = [10, 20, 50],
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const hasPageSize = typeof pageSize === 'number';
  const normalizedPageSizeOptions = Array.from(new Set(pageSizeOptions)).filter((option) => option > 0).sort((a, b) => a - b);

  function buildHref(page: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'page') params.set(k, v);
    }
    if (page > 1) params.set('page', String(page));
    if (hasPageSize) params.set('pageSize', String(pageSize));
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="mt-5 space-y-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm shadow-card">
      <div className="flex items-center justify-between">
        {currentPage > 1 ? (
          <Link className="btn-ghost text-xs" href={buildHref(currentPage - 1)}>← Prev</Link>
        ) : (
          <span className="w-[76px]" />
        )}
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Page {currentPage} of {totalPages}
        </span>
        {currentPage < totalPages ? (
          <Link className="btn-ghost text-xs" href={buildHref(currentPage + 1)}>Next →</Link>
        ) : (
          <span className="w-[76px]" />
        )}
      </div>

      {hasPageSize ? (
        <form method="get" action={basePath} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {Object.entries(searchParams).map(([key, value]) => {
            if (!value || key === 'page' || key === 'pageSize') return null;
            return <input key={key} type="hidden" name={key} value={value} />;
          })}
          <label htmlFor="pageSize" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            Rows
          </label>
          <select id="pageSize" name="pageSize" defaultValue={String(pageSize)} className="input h-9 w-full sm:w-28">
            {normalizedPageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option} / page
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary h-9 px-3 text-xs">
            Apply
          </button>
        </form>
      ) : null}
    </div>
  );
}

