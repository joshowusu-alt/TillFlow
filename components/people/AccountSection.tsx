'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Native disclosure keeps its keyboard behavior; direct links also reveal it. */
export default function AccountSection({ id, title, description, defaultOpen = false, children }: {
  id: string; title: string; description?: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === `#${id}` && ref.current) ref.current.open = true;
    };
    const followAnchor = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (anchor?.hash === `#${id}` && anchor.pathname === window.location.pathname && ref.current) ref.current.open = true;
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    document.addEventListener('click', followAnchor);
    return () => {
      window.removeEventListener('hashchange', reveal);
      document.removeEventListener('click', followAnchor);
    };
  }, [id]);
  return <details ref={ref} id={id} open={defaultOpen} className="group min-w-0 rounded-2xl border border-slate-200 bg-white shadow-card scroll-mt-24">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:px-6 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0"><span className="block font-display text-lg font-semibold text-ink">{title}</span>{description ? <span className="mt-1 block text-sm text-slate-600">{description}</span> : null}</span>
      <span aria-hidden="true" className="shrink-0 text-accent transition-transform group-open:rotate-180">⌄</span>
    </summary>
    <div className="min-w-0 border-t border-slate-100 px-4 py-4 sm:px-6 sm:py-5">{children}</div>
  </details>;
}
