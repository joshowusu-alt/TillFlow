import Link from 'next/link';
import { notFound } from 'next/navigation';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { formatMoney } from '@/lib/format';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { businessMonthWindow, requireReportTimeZone } from '@/lib/reports/reporting-clock';
import { getIncomeStatementBreakdown } from '@/lib/reports/financials';
import { INCOME_STATEMENT_METRICS, incomeStatementEntriesHref, isIncomeStatementMetric, selectIncomeStatementEntries } from '@/lib/reports/income-statement-breakdown';

export default async function IncomeStatementEntriesPage({ searchParams }: {
  searchParams?: { from?: string; to?: string; metric?: string; page?: string; businessId?: string; storeId?: string };
}) {
  const opened = await openLiveReport({ surfaceId: 'income_statement', search: searchParams,
    range: ({ timezone, now }) => {
      if (searchParams?.from && searchParams?.to) return { fromLocalDate: searchParams.from, toLocalDate: searchParams.to, preset: 'CUSTOM' };
      const today = formatBusinessLocalDateKey(now, timezone);
      return { fromLocalDate: `${today.slice(0, 7)}-01`, toLocalDate: today, preset: 'MONTH_TO_DATE' };
    },
  });
  if (!opened.ok) return opened.denial;
  const metric = searchParams?.metric ?? 'revenue';
  if (!isIncomeStatementMetric(metric)) notFound();
  const { business } = opened;
  const now = new Date(), zone = requireReportTimeZone(business.timezone), month = businessMonthWindow(now, zone);
  const applied = opened.decision.appliedRange;
  const { start, end, fromInputValue: from, toInputValue: to } = resolveReportDateRange(
    applied ? { from: applied.fromLocalDate, to: applied.toLocalDate } : searchParams, month.startInclusive, now, zone,
  );
  const statement = await getIncomeStatementBreakdown(business.id, start, end);
  const entries = selectIncomeStatementEntries(statement.entries, metric);
  const total = statement[metric];
  const size = 100, pages = Math.max(1, Math.ceil(entries.length / size));
  const page = Math.min(pages, Math.max(1, Number.parseInt(searchParams?.page ?? '1', 10) || 1));
  const metadata = INCOME_STATEMENT_METRICS[metric], money = (n: number) => formatMoney(n, business.currency);
  const backHref = `/reports/income-statement?${new URLSearchParams({ from, to })}`;
  const href = (next: number) => `${incomeStatementEntriesHref(metric, from, to)}&page=${next}`;
  const date = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: zone }).format(new Date(value));
  return <div className="space-y-5">
    {opened.readOnly ? <ReportReadOnlyBanner /> : null}
    <Link className="text-sm font-semibold text-accent underline" href={backHref}>← Income Statement</Link>
    <section className="card space-y-3 p-5">
      <p className="text-xs text-ink/60">Whole business · {from} to {to}</p>
      <h1 className="text-xl font-semibold">{metadata.label} — supporting records</h1>
      <p className="break-words text-3xl font-semibold tabular-nums">{total === null ? 'Costs incomplete' : money(total)}</p>
      <p className="text-sm text-ink/60">{metadata.explanation}</p>
      {total === null ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Some sales have incomplete costs or unsupported return records. Their contribution stays incomplete until the source records are resolved.</p> : null}
    </section>
    <section className="card overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="bg-slate-50"><tr><th scope="col" className="p-3">Date</th><th scope="col" className="p-3">Source / description</th><th scope="col" className="p-3 text-right">{metric === 'netProfit' ? 'Effect on profit' : 'Amount'}</th></tr></thead>
        <tbody>{entries.slice((page - 1) * size, page * size).map(entry => <tr className="border-t" key={entry.id}>
          <td className="whitespace-nowrap p-3 align-top">{date(entry.date)}</td>
          <td className="min-w-[12rem] p-3">{entry.href ? <Link className="font-semibold text-accent underline" href={entry.href}>{entry.label}</Link> : <span className="font-semibold">{entry.label}</span>}
            <p className="mt-1 text-xs text-ink/60">{entry.description}</p>
            {entry.kind === 'sale' && (metric === 'grossProfit' || metric === 'netProfit') ? <p className="mt-1 text-xs text-ink/60">Revenue {money(entry.revenuePence)} · Recorded cost {entry.costPence === null ? 'incomplete' : money(entry.costPence)}</p> : null}
          </td>
          <td className="whitespace-nowrap p-3 text-right align-top tabular-nums">{entry.contributionPence === null ? 'Costs incomplete' : money(entry.contributionPence)}</td>
        </tr>)}</tbody>
      </table></div>
      {entries.length === 0 ? <p className="p-5 text-sm text-ink/60">No contributing records in this period.</p> : null}
      <div className="flex items-center justify-between gap-3 border-t p-4 text-sm">
        {page > 1 ? <Link className="text-accent underline" href={href(page - 1)}>← Previous</Link> : <span />}
        <span>Page {page} of {pages} · {entries.length} records</span>
        {page < pages ? <Link className="text-accent underline" href={href(page + 1)}>Next →</Link> : <span />}
      </div>
      <p className="flex flex-wrap justify-between gap-3 border-t p-5 font-semibold"><span>Total across all pages</span><span className="tabular-nums">{total === null ? 'Costs incomplete' : money(total)}</span></p>
    </section>
  </div>;
}
