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
    <div className="mt-4 flex items-center justify-between text-sm">
      {currentPage > 1 ? (
        <Link className="btn-ghost text-xs" href={buildHref(currentPage - 1)}>← Prev</Link>
      ) : (
        <span />
      )}
      <span className="text-black/50">Page {currentPage} of {totalPages}</span>
      {currentPage < totalPages ? (
        <Link className="btn-ghost text-xs" href={buildHref(currentPage + 1)}>Next →</Link>
      ) : (
        <span />
      )}
    </div>
  );
}

