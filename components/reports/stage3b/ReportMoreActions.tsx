import type { ReactNode } from 'react';
import { REPORT_FOCUS } from './ReportPrimitives';

export default function ReportMoreActions({ children }: { children: ReactNode }) {
  return <details className="relative" data-stage3b-actions>
    <summary className={`flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-ink ${REPORT_FOCUS}`}>More actions <span aria-hidden="true">⌄</span></summary>
    <div className="absolute right-0 z-20 mt-2 grid w-[min(18rem,calc(100vw-2rem))] gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl [&>*]:min-h-11 [&>*]:justify-center">{children}</div>
  </details>;
}
