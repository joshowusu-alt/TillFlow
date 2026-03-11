import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
}

export default function Pagination({ currentPage, totalPages, basePath, searchParams = {} }: PaginationProps) {
  if (totalPages <= 1) return null;

  function buildHref(page: number) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'page') params.set(k, v);
    }
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm shadow-card">
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
  );
}

