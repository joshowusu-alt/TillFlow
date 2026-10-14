import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import DownloadLink from '@/components/DownloadLink';
import Link from 'next/link';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { businessMonthWindow, localDateInstant, requireReportTimeZone } from '@/lib/reports/reporting-clock';
import { getCashflow } from '@/lib/reports/financials';
import { cashflowStatementRows } from '@/lib/reports/cashflow-statement';
import { formatMoney } from '@/lib/format';

export default async function CashflowPage({ searchParams }: {
  searchParams?: { from?: string; to?: string; storeId?: string; businessId?: string };
}) {
  const now = new Date();
  const opened = await openLiveReport({ surfaceId: 'cash_flow_statement', search: searchParams,
    range: ({ timezone }) => {
      const today = formatBusinessLocalDateKey(now, timezone);
      const monthStart = formatBusinessLocalDateKey(businessMonthWindow(now, requireReportTimeZone(timezone)).startInclusive, timezone);
      return { fromLocalDate: searchParams?.from ?? monthStart, toLocalDate: searchParams?.to ?? today, preset: searchParams?.from || searchParams?.to ? 'CUSTOM' : 'MONTH_TO_DATE' };
    },
  });
  if (!opened.ok) return opened.denial;
  const { business } = opened;
  const today = formatBusinessLocalDateKey(now, business.timezone!);
  const monthStart = formatBusinessLocalDateKey(businessMonthWindow(now, business.timezone!).startInclusive, business.timezone!);
  const from = opened.decision.appliedRange?.fromLocalDate ?? searchParams?.from ?? monthStart;
  const to = opened.decision.appliedRange?.toLocalDate ?? searchParams?.to ?? today;
  const start = localDateInstant(from, 'start', business.timezone!);
  const end = localDateInstant(to, 'endExclusive', business.timezone!);
  if (!start || !end || start >= end || to > today) return <div className="card p-5">Choose a valid period ending today or earlier.</div>;
  const data = await getCashflow(business.id, start, new Date(Math.min(end.getTime(), now.getTime())));
  const money = (amount: number) => formatMoney(amount, business.currency);
  const exportHref = '/api/reports/financials?type=cashflow&from=' + from + '&to=' + to;
  const renderRows = (direct: boolean) => <dl className="divide-y divide-slate-100">{cashflowStatementRows(data, direct).map(row =>
    <div key={row.key} className={'flex items-baseline justify-between gap-4 py-3 text-sm ' + (['operating', 'investing', 'financing', 'change', 'closing'].includes(row.key) ? 'font-semibold' : '')}>
      <dt className="min-w-0 break-words">{row.label}</dt><dd className="shrink-0 text-right tabular-nums">{money(row.amountPence)}</dd>
    </div>)}</dl>;
  const difference = data.operatingDifferencePence !== 0 || data.movementDifferencePence !== 0;
  return <div className="space-y-6">
    <ReportsDestinationHead title="Cash flow" scopeLabel="Whole business" periodLabel={from + ' to ' + to + (to === today ? ' · Today so far' : '')}
      actions={<DownloadLink className="btn-secondary" href={exportHref}>Export statement CSV</DownloadLink>} />
    <p className="text-sm text-ink/70">How recorded profit turns into cash, bank and MoMo movements.</p>
    <form method="GET" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white/70 p-4 print:hidden">
      <label className="label">From<input className="input mt-1" type="date" name="from" defaultValue={from} max={today} required /></label>
      <label className="label">To<input className="input mt-1" type="date" name="to" defaultValue={to} max={today} required /></label>
      <button className="btn-secondary" type="submit">Update report</button>
    </form>
    <dl className="grid gap-3 sm:grid-cols-3" aria-label="Cash movement summary">
      {[['Opening balance', data.beginningCash], ['Net movement', data.money.netMovementPence], ['Closing balance', data.endingCash]].map(([label, value]) => <div className="card min-w-0 border-t-2 border-t-accent/20 p-5" key={label}>
        <dt className="text-xs font-semibold uppercase tracking-wide text-ink/60">{label}</dt><dd className="mt-3 break-words text-2xl font-semibold tabular-nums">{money(Number(value))}</dd>
      </div>)}
    </dl>
    <section className="card p-5 sm:p-6" aria-label="Indirect cash-flow statement">
      <h2 className="text-base font-semibold">Cash-flow statement</h2><p className="mb-3 mt-1 text-xs text-ink/60">Indirect method · {business.currency}</p>
      {renderRows(false)}
    </section>
    <details className="card p-5 sm:p-6">
      <summary className="cursor-pointer text-base font-semibold">Money received and paid</summary>
      <p className="mb-3 mt-3 text-sm text-ink/70">Receipts and payments from recorded cash, bank and MoMo entries. Transfers between these accounts are excluded.</p>
      <div className="mb-3 print:hidden"><DownloadLink className="font-semibold text-accent" href={exportHref + '&view=direct'}>Export receipts and payments CSV</DownloadLink></div>
      {renderRows(true)}
    </details>
    {(data.missingSaleCostCount > 0 || data.otherEntryCount > 0 || data.openingEntriesPence !== 0 || difference) ? <section className="space-y-2 rounded-xl border border-slate-200 bg-white/60 p-5 text-sm text-ink/70" aria-label="Report notes">
      <h2 className="text-xs font-semibold uppercase tracking-wide">Report notes</h2>
      {data.missingSaleCostCount > 0 ? <p>Some sales have no product cost entry. Profit above uses posted income and expenses; receipts, payments and closing money include their recorded amounts. <Link className="font-semibold text-accent underline" href="/products?issue=MISSING_COST">View missing product costs</Link></p> : null}
      {data.openingEntriesPence !== 0 ? <p>Opening balance entries added during this period are shown separately from business receipts and payments.</p> : null}
      {data.otherEntryCount > 0 ? <p>{data.otherEntryCount} money {data.otherEntryCount === 1 ? 'entry is' : 'entries are'} shown under other movements because their recorded source does not identify an operating, investing or financing activity.</p> : null}
      {difference ? <p>Entry difference: operating calculation {money(data.operatingDifferencePence)}; money movement {money(data.movementDifferencePence)}. Closing balances above follow the posted money accounts. <Link className="font-semibold text-accent underline" href={'/payments/reconciliation/balances?month=' + to.slice(0, 7)}>View account entries</Link></p> : null}
    </section> : null}
    <div className="border-t border-slate-200 pt-4 text-sm print:hidden"><Link className="font-semibold text-accent" href={'/reports/balance-sheet?asOf=' + to}>View closing balance sheet →</Link></div>
  </div>;
}
