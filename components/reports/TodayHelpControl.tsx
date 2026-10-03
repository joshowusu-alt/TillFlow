'use client';

import { useId, useState } from 'react';

const FOCUS =
  'rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export default function TodayHelpControl({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="min-w-0">
      <button
        type="button"
        className={`inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent hover:bg-accentSoft ${FOCUS}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        How Today is calculated
      </button>
      {open ? (
        <div id={panelId} className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-muted">
          {children}
        </div>
      ) : null}
    </div>
  );
}
