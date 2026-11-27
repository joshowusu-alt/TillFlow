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
    { id: 'assets', name: 'What the business owns', totalLabel: 'Total assets', rows: sheet.assets, total: sheet.totalAssets },
    { id: 'liabilities', name: 'What the business owes', totalLabel: 'Total liabilities', rows: sheet.liabilities, total: sheet.totalLiabilities },
    { id: 'equity', name: 'Owner’s equity', totalLabel: 'Total equity', rows: sheet.equity, total: sheet.totalEquity },
  ];
  const labels: Record<string, string> = {
    '1000': 'Cash on hand', '1010': 'Bank & MoMo', '1100': 'Money customers owe us',
    '1150': 'MoMo awaiting confirmation', '1200': 'Stock value', '1300': 'VAT to recover',
    '2000': 'Money owed to suppliers and other creditors', '2100': 'VAT owed',
    '2200': 'Refunds owed to customers', '3000': 'Retained earnings',
    '3200': 'Opening balance equity', CURRENT_PROFIT: 'Recorded profit to date',
  };
  const accountName = (row: { accountCode: string; name: string; balancePence: number }) => {
    // Credit balances in asset accounts (or debit balances in liabilities)
    // retain their recorded sign and must not be described as money owed to us.
    if (row.balancePence < 0 && row.accountCode === '1100') return 'Customer balances (net credit)';
    if (row.balancePence < 0 && row.accountCode === '2000') return 'Supplier and other creditor balances (net credit to us)';
    return labels[row.accountCode] ?? row.name;
  };
  return <div className="space-y-6">
    <ReportsDestinationHead title="Balance sheet" scopeLabel="Whole business"
      periodLabel={'As at ' + dateLabel + (key === today ? ' · Today so far' : '')}
      actions={<DownloadLink className="btn-secondary" href={'/api/reports/financials?type=balance-sheet&from=' + key + '&to=' + key}>Export CSV</DownloadLink>} />
    <p className="text-sm text-ink/70">Your financial position from recorded opening balances and transactions. See what your business owns, what it owes and what remains for the owner.</p>
    {hasNotes ? <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm leading-relaxed text-amber-950" aria-label="Report notes">
      <h2 className="font-semibold">{missingStockCosts || diagnostic.profitIncomplete ? 'Figures may be incomplete' : 'Balances need attention'}</h2>
      {missingStockCosts ? <p>Some stock has no cost entry. Stock value and owner’s equity may be incomplete. <Link className="font-semibold underline" href="/products?issue=MISSING_COST">View missing product costs</Link></p> : null}
      {diagnostic.profitIncomplete ? <p>Some sales have no product cost recorded. Recorded profit and owner’s equity may be incomplete. <Link className="font-semibold underline" href="/products?issue=MISSING_COST">Review missing costs</Link></p> : null}
      {sheet.legacyCapitalPence !== 0 ? <p>Opening capital setting: {money(sheet.legacyCapitalPence)}. This undated setting is separate from the opening balance entries included below. <Link className="font-semibold underline" href="/settings">View opening balance settings</Link></p> : null}
      {diagnostic.equationDifferencePence !== 0 ? <p>Entry difference: {money(diagnostic.equationDifferencePence)}. Assets differ from liabilities and equity by this amount. <Link className="font-semibold underline" href={'/payments/reconciliation/balances?month=' + key.slice(0, 7)}>View account entries</Link></p> : null}
    </section> : null}
    <form className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/80 bg-white/70 p-4 print:hidden" method="GET">
      <label className="label w-full sm:w-auto">Statement date<input className="input mt-1 w-full sm:w-48" type="date" name="asOf" defaultValue={key} max={today} required /></label>
      <button className="btn-secondary" type="submit">Update report</button>
    </form>
    <dl className="grid gap-3 md:grid-cols-3" aria-label="Financial position">
      {groups.map(group => <div key={group.name} className="card min-w-0 border-t-2 border-t-accent/20 p-5 sm:p-6">
        <dt className="text-sm font-semibold text-ink/70">{group.name}</dt>
        <dd className="mt-2 break-words text-2xl font-semibold tabular-nums tracking-tight text-ink sm:text-3xl"><a className="block min-h-11 [overflow-wrap:anywhere] underline decoration-accent/30 underline-offset-4" href={'#' + group.id} aria-label={`View ${group.totalLabel.toLowerCase()} details: ${money(group.total)}`}>{money(group.total)}</a></dd>
      </div>)}
    </dl>
    <div className="card overflow-hidden border border-slate-200/80 shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6"><h2 className="text-base font-semibold">Financial position</h2><p className="mt-1 text-xs text-ink/60">{business.currency} · {dateLabel}</p></div>
      {groups.map(group => <section id={group.id} key={group.name} className="scroll-mt-20 border-b border-black/5 p-5 last:border-0 sm:px-6" aria-label={group.name}>
        <h3 className="mb-2 text-base font-semibold text-accent">{group.name}</h3>
        {group.id === 'equity' ? <p className="mb-4 text-sm text-ink/70">In a balanced report, this is what remains after deducting what the business owes from what it owns. This is not cash available to withdraw.</p> : null}
        {group.rows.length === 0 ? <p className="mb-3 text-sm text-ink/50">No entries for this date.</p> : <ul className="divide-y divide-slate-100">
          {[...group.rows].sort((a, b) => a.accountCode.localeCompare(b.accountCode)).map(row => <li key={row.accountCode}>
            <Link className="grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" href={entriesHref(row.accountCode)} aria-label={`View entries for ${accountName(row)}: ${money(row.balancePence)}`}>
              <span className="min-w-0 break-words font-medium text-accent underline underline-offset-4">{accountName(row)} →</span><span className="min-w-0 [overflow-wrap:anywhere] text-right font-medium tabular-nums text-ink">{money(row.balancePence)}</span>
            </Link>
          </li>)}
        </ul>}
        <p className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-200 pt-3 text-sm font-semibold"><span>{group.totalLabel}</span><span className="min-w-0 break-words tabular-nums">{money(group.total)}</span></p>
      </section>)}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-accent/10 bg-accentSoft px-5 py-5 text-sm font-semibold text-accent sm:px-6"><span>Total liabilities and equity</span><span className="min-w-0 [overflow-wrap:anywhere] tabular-nums">{money(sheet.totalLiabilities + sheet.totalEquity)}</span></div>
    </div>
    <details className="rounded-xl border border-slate-200/80 bg-white/60 px-5 py-2 text-sm text-ink/70"><summary className="min-h-11 cursor-pointer py-3 font-semibold text-accent">How to read this report</summary><div className="space-y-2 pb-3"><p>Tap any account or amount to see its supporting entries. Owner contributions appear in equity; repayable owner advances appear in liabilities. Cash held by staff remains a business asset. Recorded profit uses posted income and expense entries.</p><p>Negative balances are kept as recorded; they may reflect credits or amounts needing review. Stock-cost checks use current stock records, not a historical stock-cost snapshot.</p></div></details>
    <div className="border-t border-slate-200 pt-4 text-sm print:hidden"><Link className="font-semibold text-accent" href={'/payments/reconciliation/balances?month=' + key.slice(0, 7)}>Open monthly account review →</Link></div>
  </div>;
}
