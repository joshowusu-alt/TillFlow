'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { REPORT_FOCUS } from './stage3b/ReportPrimitives';

/** Keep direct links to the hierarchy useful even when the overview is collapsed. */
export default function ClassificationDisclosure({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === '#classification-performance' && ref.current) ref.current.open = true;
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, []);
  return <details ref={ref} className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4" data-classification-disclosure>
    <summary className={`min-h-11 cursor-pointer py-3 font-semibold text-accent ${REPORT_FOCUS}`}>Classification performance — categories, divisions, groups and products</summary>
    <p className="pb-3 text-sm text-slate-600">Filter and compare net sales, recorded costs, gross profit and margins. Select a name to explore the next level.</p>
    <div className="pb-4">{children}</div>
  </details>;
}
