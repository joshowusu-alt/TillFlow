'use client';

import { useEffect, useState } from 'react';

type ControlGreetingProps = {
  firstName: string;
  roleLabel: string;
  staffKey: string;
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

export default function ControlGreeting({ firstName, roleLabel, staffKey }: ControlGreetingProps) {
  // Server renders neutral copy; client upgrades to time-of-day after mount.
  const [greeting, setGreeting] = useState<string>('Welcome back');
  const [firstVisitToday, setFirstVisitToday] = useState<boolean>(true);

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
    const storageKey = `tillflow:control-welcome:${staffKey}`;
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
  }, [staffKey]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {firstVisitToday ? (
        <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 font-semibold tracking-tight text-control-ink shadow-sm backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          {greeting}, {firstName}
        </span>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 font-semibold tracking-tight text-control-ink shadow-sm backdrop-blur-sm">
          Welcome back, {firstName}
        </span>
      )}
      <span className="text-xs uppercase tracking-[0.18em] text-black/45">{roleLabel}</span>
    </div>
  );
}
