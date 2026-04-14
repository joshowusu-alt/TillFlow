'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export type SearchBusiness = {
  id: string;
  name: string;
  ownerName: string;
  ownerPhone: string;
  plan: string;
  state: string;
};

export default function GlobalSearch({
  businesses,
  variant = 'dark',
}: {
  businesses: SearchBusiness[];
  variant?: 'dark' | 'light';
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const results =
    query.trim().length < 2
      ? []
      : businesses
          .filter((b) => {
            const q = query.toLowerCase();
            const phone = b.ownerPhone.replace(/\s/g, '');
            return (
              b.name.toLowerCase().includes(q) ||
              b.ownerName.toLowerCase().includes(q) ||
              phone.includes(q.replace(/\s/g, '')) ||
              b.ownerPhone.includes(q)
            );
          })
          .slice(0, 7);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      router.push(`/businesses/${results[activeIndex].id}`);
      setQuery('');
      setOpen(false);
    } else if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const isDark = variant === 'dark';
  const inputClass = isDark
    ? 'w-full rounded-[16px] border border-white/12 bg-white/8 py-2.5 pl-9 pr-8 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/30 focus:bg-white/14'
    : 'w-full rounded-[16px] border border-black/10 bg-black/[0.03] py-2.5 pl-9 pr-8 text-sm text-control-ink placeholder-black/38 outline-none transition focus:border-[#1f8a82] focus:bg-white';
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
          type="text"
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
            onClick={() => { setQuery(''); setOpen(false); }}
            className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-white/40 hover:text-white/70' : 'text-black/36 hover:text-black/60'} transition`}
            aria-label="Clear search"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </div>

      {open && results.length > 0 ? (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-[18px] border border-black/10 bg-white shadow-xl">
          {results.map((biz, index) => (
            <li key={biz.id}>
              <Link
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
         <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-[18px] border border-black/10 bg-white px-3.5 py-3 text-sm text-black/50 shadow-xl">
          No match for &ldquo;{query}&rdquo;
        </div>
      ) : null}
    </div>
  );
}
