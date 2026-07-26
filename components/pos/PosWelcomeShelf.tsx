'use client';

import { useEffect, useState } from 'react';

type PosWelcomeShelfProps = {
  firstName: string;
  storeName: string;
  hasOpenShift: boolean;
  openTillName: string | null;
  userKey: string;
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

export default function PosWelcomeShelf({ firstName, storeName, hasOpenShift, openTillName, userKey }: PosWelcomeShelfProps) {
  const [visible, setVisible] = useState<boolean>(false);
  const [greeting, setGreeting] = useState<string>('Welcome back');

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
    const storageKey = `tillflow:pos-welcome:${userKey}`;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored !== todayKey()) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, [userKey]);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(`tillflow:pos-welcome:${userKey}`, todayKey());
    } catch {
      // localStorage unavailable; banner just won't persist its dismissal.
    }
  };

  if (!visible) return null;

  return (
    <div
      className="mb-2 flex items-center gap-2 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-white px-3 py-2 shadow-card sm:mb-3 sm:items-center sm:gap-3 sm:rounded-2xl sm:px-5 sm:py-3.5"
      data-pos-welcome-shelf="true"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-accent sm:text-[11px] sm:tracking-[0.22em]">
          {storeName}
        </p>
        <p className="mt-0.5 text-sm font-display font-bold text-ink sm:mt-1 sm:text-lg">
          {greeting}, {firstName}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-600 sm:text-sm sm:leading-relaxed">
          {hasOpenShift
            ? openTillName
              ? `Your shift is open at ${openTillName}. Ready when you are.`
              : 'A shift is open at this store. You can start ringing sales.'
            : 'No shift is open yet — open a till from the shift menu before your first sale.'}
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="flex-shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        Got it
      </button>
    </div>
  );
}
