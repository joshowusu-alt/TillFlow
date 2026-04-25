'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type DashboardWelcomeHeaderProps = {
  firstName: string;
  businessName: string;
  /** Short caption shown below the greeting (e.g. date range or "Live snapshot") */
  caption?: string;
  /** Optional pulse chips — short labels with optional tone */
  pulse?: Array<{ label: string; tone?: 'neutral' | 'positive' | 'warning' | 'danger' }>;
  userKey: string;
  storageNamespace?: string;
  actions?: ReactNode;
};

function greetingFor(hour: number): string {
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Working late';
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TONE_CLASS: Record<NonNullable<NonNullable<DashboardWelcomeHeaderProps['pulse']>[number]['tone']>, string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
};

export default function DashboardWelcomeHeader({
  firstName,
  businessName,
  caption,
  pulse,
  userKey,
  storageNamespace = 'dashboard',
  actions,
}: DashboardWelcomeHeaderProps) {
  const [greeting, setGreeting] = useState<string>('Welcome back');
  const [firstVisitToday, setFirstVisitToday] = useState<boolean>(true);

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
    const storageKey = `tillflow:last-welcome-${storageNamespace}:${userKey}`;
    try {
      const stored = window.localStorage.getItem(storageKey);
      const today = todayKey();
      if (stored === today) {
        setFirstVisitToday(false);
      } else {
        window.localStorage.setItem(storageKey, today);
        setFirstVisitToday(true);
      }
    } catch {
      setFirstVisitToday(true);
    }
  }, [userKey, storageNamespace]);

  return (
    <div className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200/80 bg-white/80 px-4 py-4 shadow-card backdrop-blur-xl sm:rounded-[1.75rem] sm:px-5 sm:py-4 md:flex-row md:items-start md:justify-between md:px-6 md:py-5">
      <div className="min-w-0">
        {firstVisitToday ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">{businessName}</p>
            <h1 className="mt-1.5 text-[1.6rem] font-display font-bold leading-tight text-ink sm:text-2xl md:text-[1.85rem]">
              {greeting}, {firstName}
            </h1>
            {caption ? <p className="mt-1.5 text-sm font-medium text-slate-500">{caption}</p> : null}
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              Welcome back, {firstName}
            </div>
            <h1 className="mt-2 text-[1.45rem] font-display font-bold leading-tight text-ink sm:text-[1.65rem] md:text-[1.75rem]">
              {businessName}
            </h1>
            {caption ? <p className="mt-1 text-sm font-medium text-slate-500">{caption}</p> : null}
          </>
        )}

        {pulse && pulse.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
            {pulse.map((chip, idx) => (
              <span
                key={`${chip.label}-${idx}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${TONE_CLASS[chip.tone ?? 'neutral']}`}
              >
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {actions ? (
        <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center md:w-auto md:max-w-[45%] md:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
