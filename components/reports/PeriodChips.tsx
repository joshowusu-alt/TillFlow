import Link from 'next/link';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { addCalendarDays } from '@/lib/entitlements/range';
import { requireReportTimeZone } from '@/lib/reports/reporting-clock';
import ReportFilterCard from './ReportFilterCard';
import type { ReactNode } from 'react';

export function reportPeriodOptions(now: Date, timeZone: string) {
  const today = formatBusinessLocalDateKey(now, requireReportTimeZone(timeZone));
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addCalendarDays(monthStart, -1);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return [
    { key: 'today', label: 'Today', from: today, to: today },
    { key: 'week', label: 'This week', from: addCalendarDays(today, -((weekday + 6) % 7)), to: today },
    { key: 'month', label: 'This month', from: monthStart, to: today },
    { key: 'last-month', label: 'Last month', from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd },
  ];
}

export function activeReportPeriod(options: ReturnType<typeof reportPeriodOptions>, from: string, to: string, selected?: string) {
  if (selected === 'custom') return 'custom';
  const matches = options.filter(option => option.from === from && option.to === to);
  return matches.find(option => option.key === selected)?.key
    ?? matches.find(option => option.key === 'month')?.key ?? matches[0]?.key ?? 'custom';
}

export function readableReportPeriod(from: string, to: string) {
  const format = (key: string) => new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', ...(from.slice(0, 4) !== to.slice(0, 4) ? { year: 'numeric' } : {}), timeZone: 'UTC',
  }).format(new Date(`${key}T00:00:00Z`));
  return from === to ? format(from) : `${format(from)} to ${format(to)}`;
}

/** Both current and earlier dates must fit Starter's existing 30-day horizon. */
export function defaultMovementPeriod(now: Date, timeZone: string, plan: string) {
  const month = reportPeriodOptions(now, timeZone).find(option => option.key === 'month')!;
  const earliestCurrent = addCalendarDays(month.to, -14);
  return { preset: 'equal_length_custom' as const,
    currentFromKey: plan === 'STARTER' && month.from < earliestCurrent ? earliestCurrent : month.from,
    currentToKey: month.to };
}

export default function PeriodChips({ from, to, timeZone, now = new Date(), selected, movement = false, storeId, branchControl }: {
  from: string; to: string; timeZone: string; now?: Date; selected?: string;
  movement?: boolean; storeId?: string; branchControl?: ReactNode;
}) {
  const options = reportPeriodOptions(now, timeZone);
  const active = activeReportPeriod(options, from, to, selected);
  const fromName = movement ? 'currentFrom' : 'from';
  const toName = movement ? 'currentTo' : 'to';
  const href = (key: string, start: string, end: string) => '?' + new URLSearchParams({
    ...(movement ? { preset: 'equal_length_custom', storeId: storeId ?? '' } : {}),
    [fromName]: start, [toName]: end, periodChip: key,
  });
  return <div className="min-w-0 space-y-2">
    <nav aria-label="Report period" className="flex flex-wrap gap-2" data-report-period-chips>
      {[...options, { key: 'custom', label: 'Custom', from, to }].map(option =>
        <Link key={option.key} href={href(option.key, option.from, option.to)}
          aria-current={active === option.key ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active === option.key ? 'border-accent bg-accent text-white' : 'border-slate-200 bg-white text-ink'}`}>
          {option.label}
        </Link>)}
    </nav>
    {active === 'custom' ? <ReportFilterCard columnsClassName="md:grid-cols-3" submitLabel="Apply">
      {movement ? <><input type="hidden" name="preset" value="equal_length_custom" /><input type="hidden" name="storeId" value={storeId} /></> : null}
      <input type="hidden" name="periodChip" value="custom" />
      <div><label className="label" htmlFor="period-from">From</label><input id="period-from" className="input min-h-11 w-full" type="date" name={fromName} defaultValue={from} required /></div>
      <div><label className="label" htmlFor="period-to">To</label><input id="period-to" className="input min-h-11 w-full" type="date" name={toName} defaultValue={to} required /></div>
    </ReportFilterCard> : null}
    {branchControl}
  </div>;
}
