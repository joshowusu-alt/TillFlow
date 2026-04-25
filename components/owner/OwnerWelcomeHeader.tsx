'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type OwnerWelcomeHeaderProps = {
  firstName: string;
  businessName: string;
  healthScore: number;
  healthGrade: 'GREEN' | 'AMBER' | 'RED';
  attentionCount: number;
  /** Optional one-line nudge shown to returning owners (e.g. Monday digest reminder). */
  nudge?: { label: string; href: string; tone?: 'info' | 'warning' | 'critical' } | null;
  /** True for brand-new businesses with no sales yet — swaps in onboarding copy. */
  coldStart?: boolean;
  userKey: string;
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

export default function OwnerWelcomeHeader({
  firstName,
  businessName,
  healthScore,
  healthGrade,
  attentionCount,
  nudge,
  coldStart,
  userKey,
  actions,
}: OwnerWelcomeHeaderProps) {
  // Render a neutral greeting on the server to avoid hydration mismatch,
  // then upgrade to time-of-day after mount.
  const [greeting, setGreeting] = useState<string>('Welcome back');
  const [firstVisitToday, setFirstVisitToday] = useState<boolean>(true);

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));

    const storageKey = `tillflow:last-welcome:${userKey}`;
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
      // localStorage unavailable (private mode, etc.) — treat every visit as first.
      setFirstVisitToday(true);
    }
  }, [userKey]);

  const gradeTone =
    healthGrade === 'GREEN'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : healthGrade === 'AMBER'
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-red-700 bg-red-50 border-red-200';

  const attentionLabel =
    attentionCount === 0
      ? 'All clear — no issues need attention'
      : `${attentionCount} item${attentionCount === 1 ? '' : 's'} need${attentionCount === 1 ? 's' : ''} attention`;

  const nudgeToneClass =
    nudge?.tone === 'critical'
      ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
      : nudge?.tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
      : 'border-blue-100 bg-blue-50 text-accent hover:bg-blue-100';

  return (
    <div className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200/80 bg-white/80 px-4 py-4 shadow-card backdrop-blur-xl sm:rounded-[1.75rem] sm:px-5 sm:py-4 md:flex-row md:items-start md:justify-between md:px-6 md:py-5">
      <div className="min-w-0">
        {coldStart ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
              {businessName}
            </p>
            <h1 className="mt-1.5 text-[1.6rem] font-display font-bold leading-tight text-ink sm:text-2xl md:text-[1.85rem]">
              Welcome to TillFlow, {firstName}
            </h1>
            <p className="mt-1.5 text-sm font-medium text-slate-500">
              You&apos;re set up. Ring your first sale to start seeing real numbers in this brief — your health score, cash pulse, and stock pressure all populate from live trading.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="/onboarding"
                className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-accent/90"
              >
                Continue setup
                <span aria-hidden="true">→</span>
              </a>
              <a
                href="/pos"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition-colors hover:bg-slate-50"
              >
                Open POS
              </a>
            </div>
          </>
        ) : firstVisitToday ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
              {businessName}
            </p>
            <h1 className="mt-1.5 text-[1.6rem] font-display font-bold leading-tight text-ink sm:text-2xl md:text-[1.85rem]">
              {greeting}, {firstName}
            </h1>
            <p className="mt-1.5 text-sm font-medium text-slate-500">
              Here is your operating brief — stock pressure, cash position, and control signals all in one view.
            </p>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              <span>Welcome back, {firstName}</span>
            </div>
            <h1 className="mt-2 text-[1.45rem] font-display font-bold leading-tight text-ink sm:text-[1.65rem] md:text-[1.75rem]">
              {businessName} — today&apos;s brief
            </h1>
          </>
        )}

        {!coldStart && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${gradeTone}`}>
              Health {healthScore}/100
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                attentionCount === 0
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : attentionCount > 3
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}
            >
              {attentionLabel}
            </span>
          </div>
        )}

        {nudge && !coldStart ? (
          <a
            href={nudge.href}
            className={`mt-3 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${nudgeToneClass}`}
          >
            <span className="truncate">{nudge.label}</span>
            <span aria-hidden="true">→</span>
          </a>
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
