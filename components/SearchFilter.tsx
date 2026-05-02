'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function SearchFilter({ placeholder = 'Search…' }: { placeholder?: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const [value, setValue] = useState(searchParams?.get('q') ?? '');

  useEffect(() => {
    setValue(searchParams?.get('q') ?? '');
  }, [searchParams]);

  function handleChange(v: string) {
    setValue(v);
    clearTimeout(timerRef.current);
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

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-card">
      <svg className="h-4 w-4 flex-shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M16 10.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
      </svg>
      <input
        className="w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
      />
      {value ? (
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
    </div>
  );
}

