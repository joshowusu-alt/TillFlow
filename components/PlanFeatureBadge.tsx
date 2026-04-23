'use client';

import { useState, useRef, useEffect } from 'react';
import type { BusinessPlan } from '@/lib/features';

const PLAN_STYLES: Record<BusinessPlan, string> = {
  STARTER: 'border-slate-200 bg-slate-50 text-slate-700',
  GROWTH: 'border-blue-200 bg-blue-50 text-blue-700',
  PRO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const PLAN_MESSAGES: Record<BusinessPlan, string> = {
  STARTER: '',
  GROWTH: 'Growth plan feature — upgrade to unlock this.',
  PRO: 'Pro plan feature — our highest tier. Upgrade to unlock.',
};

export default function PlanFeatureBadge({
  plan,
  label,
}: {
  plan: BusinessPlan;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  const message = PLAN_MESSAGES[plan];

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${PLAN_STYLES[plan]}`}
        onClick={() => setOpen((v) => !v)}
      >
        {label ?? `${plan} feature`}
        {message ? (
          <svg className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
        ) : null}
      </span>
      {open && message ? (
        <span
          className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-black/10 bg-white p-3 shadow-lg"
        >
          <span className="block text-xs font-normal normal-case tracking-normal text-black/70">{message}</span>
          <a href="/settings/billing" className="mt-2 block text-xs font-medium text-blue-600 underline">
            View plans →
          </a>
        </span>
      ) : null}
    </span>
  );
}
