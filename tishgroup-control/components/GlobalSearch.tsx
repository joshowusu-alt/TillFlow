'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export type SearchBusiness = {
  id: string;
  name: string;
  ownerName: string;
  ownerPhone: string;
  plan: string;
  state: string;
};

/**
 * Server-side search via /api/search. The whole portfolio is no longer
 * shipped to every page — the input fetches matches on each keystroke
 * (debounced) for queries with at least 2 characters. At small
 * portfolio sizes this is essentially free; the API route can swap to
 * Postgres FTS when the list crosses a few hundred records without any
 * client-side change.
 */
export default function GlobalSearch({
  variant = 'dark',
}: {
  /** Legacy prop kept for backwards compatibility — server pages used to pass the full list. Ignored now. */
  businesses?: SearchBusiness[];
  variant?: 'dark' | 'light';
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchBusiness[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const resultsId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Debounced fetch from /api/search; aborts on input change so we don't race.
  useEffect(() => {
    const trimmed = query.trim();
    setError(false);
    setResults([]);
    setActiveIndex(0);
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = (await res.json()) as { ok: boolean; results?: SearchBusiness[] };
        if (data.ok && data.results) {
          setResults(data.results);
        } else {
          setError(true);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function handleClick(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' && results.length > 0) {
      setOpen(true);
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp' && results.length > 0) {
      setOpen(true);
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && results[activeIndex]) {
      e.preventDefault();
      router.push(`/businesses/${results[activeIndex].id}`);
      setQuery('');
      setOpen(false);
    } else if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
      inputRef.current?.focus();
    }
  }

  const isDark = variant === 'dark';
  const inputClass = isDark
    ? 'w-full rounded-[16px] border border-white/12 bg-white/8 min-h-11 py-2.5 pl-9 pr-11 text-base sm:text-sm text-white placeholder-white/40 outline-none transition focus:border-white/30 focus:bg-white/14'
    : 'w-full rounded-[16px] border border-black/10 bg-black/[0.03] min-h-11 py-2.5 pl-9 pr-11 text-base sm:text-sm text-control-ink placeholder-black/38 outline-none transition focus:border-control-teal focus:bg-white';
  const iconClass = isDark ? 'text-white/40' : 'text-black/36';

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <svg
          className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${iconClass}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search businesses"
          aria-autocomplete="list"
          aria-expanded={open && query.trim().length >= 2}
          aria-controls={open && results.length > 0 ? resultsId : undefined}
          aria-activedescendant={open && results[activeIndex] ? `${resultsId}-${activeIndex}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search business or owner…"
          className={inputClass}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query.length > 0 ? (
          <button
            type="button"
            onClick={() => { setQuery(''); setOpen(false); inputRef.current?.focus(); }}
            className={`absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center ${isDark ? 'text-white/40 hover:text-white/70' : 'text-black/36 hover:text-black/60'} transition`}
            aria-label="Clear search"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </div>

      {open && results.length > 0 ? (
        <ul id={resultsId} role="listbox" aria-label="Business matches" className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[min(50dvh,24rem)] overflow-y-auto overscroll-contain rounded-[18px] border border-black/10 bg-white shadow-xl">
          {results.map((biz, index) => (
            <li key={biz.id} role="presentation">
              <Link
                id={`${resultsId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                href={`/businesses/${biz.id}`}
                onClick={() => {
                  setQuery('');
                  setOpen(false);
                }}
                 className={`flex items-center justify-between gap-3 px-3.5 py-3 text-sm transition ${
                  index === activeIndex ? 'bg-black/[0.04]' : 'hover:bg-black/[0.03]'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-control-ink">{biz.name}</div>
                  <div className="mt-0.5 truncate text-xs text-black/50">
                    {biz.ownerName} · {biz.ownerPhone}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-black/8 bg-black/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/52">
                  {biz.plan}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : open && query.trim().length >= 2 ? (
         <div role="status" aria-live="polite" className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-[18px] border border-black/10 bg-white px-3.5 py-3 text-sm text-black/50 shadow-xl">
          {loading ? 'Searching…' : error ? 'Search is unavailable. Try again or open Businesses.' : `No match for "${query}"`}
        </div>
      ) : null}
    </div>
  );
}
