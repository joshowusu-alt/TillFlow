'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function SearchFilter({ placeholder = 'Search…', documentNavigation = true }: { placeholder?: string; documentNavigation?: boolean }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const query = searchParams?.get('q') ?? '';
  const [value, setValue] = useState(query);

  useEffect(() => {
    setValue(query);
  }, [query]);

  function handleChange(v: string) {
    setValue(v);
    clearTimeout(timerRef.current);
    if (documentNavigation) return;
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (v) {
        params.set('q', v);
      } else {
        params.delete('q');
      }
      params.delete('page');
      const qs = params.toString();
      router.replace(`${pathname ?? ''}${qs ? `?${qs}` : ''}`, { scroll: false });
    }, 300);
  }

  function clearSearch() {
    handleChange('');
  }

  const content = (
    <div className="flex min-w-0 w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-card">
      <svg className="h-4 w-4 flex-shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M16 10.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
      </svg>
      <input
        key={documentNavigation ? query : 'router-search'}
        className="min-w-0 w-full flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        type="search"
        name="q"
        placeholder={placeholder}
        // Native GET reads the DOM value, including text entered before hydration.
        // A new search-params object with the same query must not erase typing.
        {...(documentNavigation ? { defaultValue: query } : { value })}
        onChange={(e) => handleChange(e.target.value)}
      />
      {value && documentNavigation ? (
        // A real GET also clears the stored-list restore intent, so clearing
        // the last query cannot silently restore the old search on remount.
        <a aria-label="Clear search" className="text-sm font-semibold text-accent"
          href={(() => { const params = new URLSearchParams(searchParams?.toString()); params.delete('q'); params.delete('page'); params.set('resetList', '1'); return `${pathname}?${params}`; })()}>Clear</a>
      ) : value ? (
        <button
          type="button"
          onClick={clearSearch}
          className="rounded-full p-1 text-muted transition hover:bg-slate-100 hover:text-ink"
          aria-label="Clear search"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}
      {documentNavigation ? <button type="submit" className="btn-secondary shrink-0 px-3 py-1 text-sm">Search</button> : null}
    </div>
  );
  if (!documentNavigation) return content;
  return <form method="get" action={pathname ?? ''} role="search">
    {[...(searchParams?.entries() ?? [])].filter(([key]) => !['q', 'page', 'success', 'error', 'resetClassification', 'resetList'].includes(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
    <input type="hidden" name="resetList" value="1" />
    {content}
  </form>;
}

