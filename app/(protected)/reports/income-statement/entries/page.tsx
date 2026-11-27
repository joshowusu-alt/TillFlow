import Link from 'next/link';
import { notFound } from 'next/navigation';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { formatMoney } from '@/lib/format';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { businessMonthWindow, requireReportTimeZone } from '@/lib/reports/reporting-clock';
import { getIncomeStatementBreakdown } from '@/lib/reports/financials';
import { INCOME_STATEMENT_METRICS, incomeStatementEntriesHref, incomeStatementExpenseCategories, isIncomeStatementMetric, selectIncomeStatementEntries } from '@/lib/reports/income-statement-breakdown';
import { costReviewHref, groupAffectedSales } from '@/lib/reports/cost-review-navigation';
import { readableReportPeriod } from '@/components/reports/PeriodChips';

export default async function IncomeStatementEntriesPage(
  props: {
    searchParams?: Promise<{ from?: string; to?: string; metric?: string; issues?: string; page?: string; expenseCategory?: string; businessId?: string; storeId?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
  const issuesOnly = searchParams?.issues === '1' && (metric === 'cogs' || metric === 'grossProfit' || metric === 'netProfit');
  const category = searchParams?.expenseCategory;
  const selectedCategory = category !== undefined && metric === 'otherExpenses'
    ? incomeStatementExpenseCategories(statement.entries).find(row => row.label === category)
    : undefined;
  if (category !== undefined && !selectedCategory) notFound();
  const allEntries = selectIncomeStatementEntries(statement.entries, metric);
  const entries = issuesOnly ? allEntries.filter(entry => entry.kind === 'sale' && entry.contributionPence === null)
    : selectedCategory ? allEntries.filter(entry => entry.label === selectedCategory.label) : allEntries;
  const total = selectedCategory ? selectedCategory.amountPence : statement[metric];
  const groups = issuesOnly ? groupAffectedSales(entries) : [];
  const size = issuesOnly ? 25 : 100, pages = Math.max(1, Math.ceil((issuesOnly ? groups.length : entries.length) / size));
  const productCount = groups.filter(group => group.productId).length;
  const page = Math.min(pages, Math.max(1, Number.parseInt(searchParams?.page ?? '1', 10) || 1));
  const metadata = INCOME_STATEMENT_METRICS[metric], money = (n: number) => formatMoney(n, business.currency);
  const backHref = `/reports/income-statement?${new URLSearchParams({ from, to })}`;
  const href = (next: number) => `${incomeStatementEntriesHref(metric, from, to, selectedCategory?.label)}${issuesOnly ? '&issues=1' : ''}&page=${next}`;
  const date = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: zone }).format(new Date(value));
  return <div className="space-y-5">
    {opened.readOnly ? <ReportReadOnlyBanner /> : null}
    <Link className="text-sm font-semibold text-accent underline" href={backHref}>← Income Statement</Link>
    <section className="card space-y-3 p-5">
      <p className="text-xs text-ink/60">Whole business · {readableReportPeriod(from, to)}</p>
      <h1 className="text-xl font-semibold">{issuesOnly ? 'Sales requiring cost review' : `${selectedCategory?.label ?? metadata.label} — supporting records`}</h1>
      <p className="break-words text-3xl font-semibold tabular-nums">{total === null ? 'Costs incomplete' : money(total)}</p>
      <p className="text-sm text-ink/60">{metadata.explanation}</p>
      {selectedCategory ? <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={incomeStatementEntriesHref('otherExpenses', from, to)}>View all expenses →</Link> : null}
      {total === null || issuesOnly ? <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={incomeStatementEntriesHref(metric, from, to) + (issuesOnly ? '' : '&issues=1')}>{issuesOnly ? 'Show all supporting records' : 'Show affected sales only'}</Link> : null}
      {issuesOnly ? <p className="text-sm font-semibold">{productCount} {productCount === 1 ? 'product' : 'products'} · {entries.length} affected {entries.length === 1 ? 'receipt' : 'receipts'}. Check the purchase records for each product.</p> : null}
      {total === null ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Profit remains incomplete until earlier sale costs or return records are confirmed. Today&apos;s product cost is not proof of an earlier cost.</p> : null}
    </section>
    {issuesOnly ? <section className="space-y-3" aria-label="Affected sales">
      {groups.slice((page - 1) * size, page * size).map(group => <article className="card space-y-2 p-4" key={group.key}>
        <h2 className="font-semibold break-words">{group.name}</h2>
        <p className="text-sm">{group.receiptCount} affected {group.receiptCount === 1 ? 'receipt' : 'receipts'}</p>
        {group.productId ? <p className="text-sm text-ink/60">Net sales affected: {money(group.items.reduce((sum, item) => sum + (item.line?.revenuePence ?? 0), 0))} (not the missing cost)</p> : null}
        {group.productId ? <Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={costReviewHref(group.productId, { from, to, metric })}>Check purchase and sale costs →</Link> : <p className="text-sm text-amber-900">Check the original receipt or return. No automatic product correction is offered for this record.</p>}
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">View affected receipts</summary>
          {group.items.map(({ receipt, line, index }) => <div key={receipt.id + ':' + index} className="border-t border-slate-100 py-3 text-sm">
            <p className="text-ink/60">{date(receipt.date)}</p>
            {receipt.href ? <Link className="inline-flex min-h-11 items-center break-all font-semibold text-accent underline" href={receipt.href}>{receipt.label}</Link> : <p className="font-semibold">{receipt.label}</p>}
            {line ? <><p>{line.name ?? 'Product'} · Quantity {line.qtyBase} (stock units)</p><p>Net sale {money(line.revenuePence)} — not the missing cost</p><p>{line.reason === 'UNSUPPORTED_RETURN' ? 'Return evidence requires review.' : 'Historical cost not confirmed.'}</p></> : <p>Return evidence requires review.</p>}
          </div>)}
        </details>
      </article>)}
      {!entries.length ? <p className="card p-4">No affected sales in this period.</p> : null}
      <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Affected sales pages">
        {page > 1 ? <Link className="inline-flex min-h-11 items-center underline" href={href(page - 1)}>← Previous</Link> : <span />}
        <span>Page {page} of {pages} · {entries.length} affected receipts</span>
        {page < pages ? <Link className="inline-flex min-h-11 items-center underline" href={href(page + 1)}>Next →</Link> : <span />}
      </nav>
    </section> : <section className="card overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="bg-slate-50"><tr><th scope="col" className="p-3">Date</th><th scope="col" className="p-3">Source / description</th><th scope="col" className="p-3 text-right">{metric === 'netProfit' ? 'Effect on profit' : 'Amount'}</th></tr></thead>
        <tbody>{entries.slice((page - 1) * size, page * size).map(entry => <tr className="border-t" key={entry.id}>
          <td className="whitespace-nowrap p-3 align-top">{date(entry.date)}</td>
          <td className="min-w-[12rem] p-3">{entry.href ? <Link className="font-semibold text-accent underline" href={entry.href}>{entry.label}</Link> : <span className="font-semibold">{entry.label}</span>}
            <p className="mt-1 text-xs text-ink/60">{entry.description}</p>
            {entry.kind === 'sale' && (metric === 'grossProfit' || metric === 'netProfit') ? <p className="mt-1 text-xs text-ink/60">Sales {money(entry.revenuePence)} · Recorded cost {entry.costPence === null ? 'incomplete' : money(entry.costPence)}</p> : null}
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
    </section>}
  </div>;
}
