import Link from 'next/link';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { localDateInstant } from '@/lib/reports/reporting-clock';
import { getBalanceSheet } from '@/lib/reports/financials';
import { formatMoney } from '@/lib/format';
import DownloadLink from '@/components/DownloadLink';

export default async function BalanceSheetPage(
  props: {
    searchParams?: Promise<{ asOf?: string; storeId?: string; businessId?: string; cutoff?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const now = new Date();
  const opened = await openLiveReport({ surfaceId: 'balance_sheet', search: searchParams,
    range: ({ timezone }) => {
      const key = searchParams?.asOf?.trim() || formatBusinessLocalDateKey(now, timezone);
      return { fromLocalDate: key, toLocalDate: key, preset: 'CUSTOM' };
    },
  });
  if (!opened.ok) return opened.denial;
  const { business } = opened;
  const zone = business.timezone!;
  const key = opened.decision.appliedRange?.toLocalDate || searchParams?.asOf?.trim() || formatBusinessLocalDateKey(now, zone);
  const end = localDateInstant(key, 'endExclusive', zone);
  if (!end || key > formatBusinessLocalDateKey(now, zone)) return <div className="card p-5">Choose a valid statement date that is not in the future.</div>;
  const requestedCutoff = searchParams?.cutoff ? new Date(searchParams.cutoff) : null;
  const cutoff = requestedCutoff && Number.isFinite(requestedCutoff.getTime()) && formatBusinessLocalDateKey(new Date(requestedCutoff.getTime()-1),zone) === key ? new Date(Math.min(requestedCutoff.getTime(),end.getTime(),now.getTime())) : new Date(Math.min(end.getTime(),now.getTime()));
  const sheet = await getBalanceSheet(business.id, cutoff);
  const entriesHref = (code: string) => '/reports/balance-sheet/entries?' + new URLSearchParams({account:code,asOf:key,cutoff:cutoff.toISOString()});
  const money = (amount: number) => formatMoney(amount === 0 ? 0 : amount, business.currency);
  const diagnostic = sheet.reconciliation;
  const today = formatBusinessLocalDateKey(now, zone);
  const dateLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(key + 'T12:00:00Z'));
  const missingStockCosts = key === today && diagnostic.stockValueIncomplete;
  const hasNotes = missingStockCosts || diagnostic.profitIncomplete || sheet.legacyCapitalPence !== 0 || diagnostic.equationDifferencePence !== 0;
  const groups = [
    { name: 'Assets', rows: sheet.assets, total: sheet.totalAssets },
    { name: 'Liabilities', rows: sheet.liabilities, total: sheet.totalLiabilities },
    { name: 'Equity', rows: sheet.equity, total: sheet.totalEquity },
  ];
  const accountName = (row: { accountCode: string; name: string }) => row.accountCode === 'CURRENT_PROFIT' ? 'Profit to date' : row.accountCode === '1010' ? 'Bank & MoMo' : row.name;
  return <div className="space-y-6">
    <ReportsDestinationHead title="Balance sheet" scopeLabel="Whole business"
      periodLabel={'As at ' + dateLabel + (key === today ? ' · Today so far' : '')}
      actions={<DownloadLink className="btn-secondary" href={'/api/reports/financials?type=balance-sheet&from=' + key + '&to=' + key}>Export CSV</DownloadLink>} />
    <p className="text-sm text-ink/70">Your financial position from recorded opening balances and transactions. Tap any account below to see what makes up its balance. Owner contributions appear in equity; repayable owner advances appear in liabilities. Cash held by staff remains a business asset.</p>
    <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/80 bg-white/70 p-4 print:hidden" method="GET">
      <label className="label w-full sm:w-auto">Statement date<input className="input mt-1 w-full sm:w-48" type="date" name="asOf" defaultValue={key} max={today} required /></label>
      <button className="btn-secondary" type="submit">Update report</button>
    </form>
    <dl className="grid gap-3 sm:grid-cols-3" aria-label="Financial position">
      {groups.map(group => <div key={group.name} className="card min-w-0 border-t-2 border-t-accent/20 p-5 sm:p-6">
        <dt className="text-xs font-semibold uppercase tracking-wide text-ink/60">Total {group.name.toLowerCase()}</dt>
        <dd className="mt-3 break-words text-2xl font-semibold tabular-nums tracking-tight text-ink sm:text-3xl">{money(group.total)}</dd>
      </div>)}
    </dl>
    <div className="card overflow-hidden border border-slate-200/80 shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6"><h2 className="text-base font-semibold">Financial position</h2><p className="mt-1 text-xs text-ink/60">{business.currency} · {dateLabel}</p></div>
      {groups.map(group => <section key={group.name} className="border-b border-black/5 p-5 last:border-0 sm:px-6" aria-label={group.name}>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-accent">{group.name}</h3>
        {group.rows.length === 0 ? <p className="mb-3 text-sm text-ink/50">No entries for this date.</p> : <dl className="space-y-3.5">
          {[...group.rows].sort((a, b) => a.accountCode.localeCompare(b.accountCode)).map(row => <div className="flex items-baseline justify-between gap-4 text-sm" key={row.accountCode}>
            <dt className="min-w-0 break-words"><Link className="font-medium text-accent underline underline-offset-4" href={entriesHref(row.accountCode)}>{accountName(row)} →</Link></dt><dd className="shrink-0 text-right font-medium tabular-nums text-ink"><Link href={entriesHref(row.accountCode)} aria-label={`View entries for ${accountName(row)}`}>{money(row.balancePence)}</Link></dd>
          </div>)}
        </dl>}
        <p className="mt-4 flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3 text-sm font-semibold"><span>Total {group.name.toLowerCase()}</span><span className="shrink-0 tabular-nums">{money(group.total)}</span></p>
      </section>)}
      <div className="flex items-baseline justify-between gap-4 border-t border-accent/10 bg-accentSoft px-5 py-5 text-sm font-semibold text-accent sm:px-6"><span>Total liabilities and equity</span><span className="shrink-0 tabular-nums">{money(sheet.totalLiabilities + sheet.totalEquity)}</span></div>
    </div>
    {hasNotes ? <section className="space-y-2 rounded-xl border border-slate-200/80 bg-white/60 px-5 py-4 text-sm leading-relaxed text-ink/70" aria-label="Report notes">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/70">Report notes</h2>
      {missingStockCosts ? <p>Some stock has no cost entry. <Link className="font-semibold text-accent underline" href="/products?issue=MISSING_COST">View missing product costs</Link></p> : null}
      {diagnostic.profitIncomplete ? <p>Some sales have no product cost recorded. Profit to date above uses the posted income and expense entries.</p> : null}
      {sheet.legacyCapitalPence !== 0 ? <p>Opening capital setting: {money(sheet.legacyCapitalPence)}. This undated setting is separate from the opening balance entries included above. <Link className="font-semibold text-accent underline" href="/settings">View opening balance settings</Link></p> : null}
      {diagnostic.equationDifferencePence !== 0 ? <p>Entry difference: {money(diagnostic.equationDifferencePence)}. Assets differ from liabilities and equity by this amount. <Link className="font-semibold text-accent underline" href={'/payments/reconciliation/balances?month=' + key.slice(0, 7)}>View account entries</Link></p> : null}
    </section> : null}
    <div className="border-t border-slate-200 pt-4 text-sm print:hidden"><Link className="font-semibold text-accent" href={'/payments/reconciliation/balances?month=' + key.slice(0, 7)}>Open monthly account review →</Link></div>
  </div>;
}
