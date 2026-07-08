'use client';

import { useState } from 'react';
import { RETAIL_REALITY_BELT } from '@/lib/marketing/welcome-content';

export default function RetailRealityBelt() {
  const items = [...RETAIL_REALITY_BELT, ...RETAIL_REALITY_BELT];
  const [isPaused, setIsPaused] = useState(false);

  return (
    <section
      aria-label="Ghana retail operations"
      className="border-y border-slate-200/80 bg-white/80 py-3"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      <div className="overflow-hidden">
        <div className={`welcome-marquee-track flex w-max items-center gap-3 px-4 ${isPaused ? 'is-paused' : ''}`}>
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink/60 shadow-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
