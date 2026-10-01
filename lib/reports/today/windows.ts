import { formatBusinessLocalDateKey, parseBusinessLocalDateKey } from '@/lib/notifications/utils';
import {
  addLocalDays,
  businessLocalDateWindow,
  type HalfOpenWindow,
} from '@/lib/reports/reporting-clock';

export type TodayPlan = 'STARTER' | 'GROWTH' | 'PRO';

export type TodayWindows = {
  todayKey: string;
  yesterdayKey: string;
  today: HalfOpenWindow;
  yesterday: HalfOpenWindow;
  days: Array<{ key: string; label: string; window: HalfOpenWindow }>;
  comparison: { last30: HalfOpenWindow; previous30: HalfOpenWindow } | null;
  authorised: HalfOpenWindow;
};

export function shiftLocalDateKey(key: string, days: number): string {
  const parts = parseBusinessLocalDateKey(key);
  if (!parts) throw new Error('Invalid local date');
  const next = addLocalDays(parts, days);
  return [
    next.year,
    String(next.month).padStart(2, '0'),
    String(next.day).padStart(2, '0'),
  ].join('-');
}

export function windowInside(inner: HalfOpenWindow, outer: HalfOpenWindow): boolean {
  return inner.startInclusive.getTime() >= outer.startInclusive.getTime()
    && inner.endExclusive.getTime() <= outer.endExclusive.getTime();
}

function requireWindow(fromKey: string, toKey: string, timeZone: string): HalfOpenWindow {
  const window = businessLocalDateWindow(fromKey, toKey, timeZone);
  if (!window) throw new Error('Invalid local date window');
  return window;
}

/**
 * Tenant-local windows for Today. `now` and `timeZone` are the only clock inputs.
 * Starter never receives a 30-day comparison, even when a 30-date window would be lawful.
 * Comparison windows that start before the decision's applied range are omitted.
 */
export function buildTodayWindows(input: {
  now: Date;
  timeZone: string;
  plan: TodayPlan;
  authorisedFrom: string;
  authorisedTo: string;
}): TodayWindows {
  const todayKey = formatBusinessLocalDateKey(input.now, input.timeZone);
  const today = requireWindow(todayKey, todayKey, input.timeZone);
  const yesterdayKey = shiftLocalDateKey(todayKey, -1);
  const yesterday = requireWindow(yesterdayKey, yesterdayKey, input.timeZone);
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const key = shiftLocalDateKey(todayKey, -offset);
    const window = requireWindow(key, key, input.timeZone);
    const label = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      timeZone: input.timeZone,
    }).format(window.startInclusive);
    days.push({ key, label, window });
  }

  const authorised = requireWindow(input.authorisedFrom, input.authorisedTo, input.timeZone);
  for (const window of [today, yesterday, ...days.map((day) => day.window)]) {
    if (!windowInside(window, authorised)) {
      throw new Error('Today window is outside the authorised range');
    }
  }

  let comparison: TodayWindows['comparison'] = null;
  if (input.plan !== 'STARTER') {
    const last30 = requireWindow(shiftLocalDateKey(todayKey, -29), todayKey, input.timeZone);
    const previous30 = requireWindow(
      shiftLocalDateKey(todayKey, -59),
      shiftLocalDateKey(todayKey, -30),
      input.timeZone,
    );
    if (windowInside(last30, authorised) && windowInside(previous30, authorised)) {
      comparison = { last30, previous30 };
    }
  }

  return { todayKey, yesterdayKey, today, yesterday, days, comparison, authorised };
}
