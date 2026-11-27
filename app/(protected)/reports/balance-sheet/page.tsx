import Link from 'next/link';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { localDateInstant } from '@/lib/reports/reporting-clock';
import { getBalanceSheet } from '@/lib/reports/financials';
import { formatMoney } from '@/lib/format';
import DownloadLink from '@/components/DownloadLink';
import ReportSummaryCard from '@/components/reports/ReportSummaryCard';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import { addCalendarDays } from '@/lib/entitlements/range';

export default async function BalanceSheetPage(
  props: {
    searchParams?: Promise<{ asOf?: string; storeId?: string; businessId?: string; cutoff?: string; dateChip?: string }>;
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
  const lastMonthEnd = addCalendarDays(`${today.slice(0, 7)}-01`, -1);
  const dateOptions = [{ key: 'today', label: 'Today', date: today }, { key: 'last-month-end', label: 'Last month end', date: lastMonthEnd }, { key: 'custom', label: 'Custom', date: key }];
  const activeDate = searchParams?.dateChip === 'custom' ? 'custom' : key === today ? 'today' : key === lastMonthEnd ? 'last-month-end' : 'custom';
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
  return <div className="min-w-0 space-y-4">
    <ReportsDestinationHead title="Balance sheet" scopeLabel="Whole business"
      periodLabel={'As at ' + dateLabel + (key === today ? ' · Today so far' : '')}
      showRefresh={false} />
    <nav aria-label="Statement date" className="flex flex-wrap gap-2 print:hidden">
      {dateOptions.map(option => <Link key={option.key} href={'?' + new URLSearchParams({ asOf: option.date, dateChip: option.key })}
        aria-current={activeDate === option.key ? 'page' : undefined}
        className={`inline-flex min-h-[45px] items-center rounded-xl border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${activeDate === option.key ? 'border-accent bg-accent text-white' : 'border-slate-200 bg-white text-ink'}`}>
        {option.label}
      </Link>)}
    </nav>
    {activeDate === 'custom' ? <div className="print:hidden"><ReportFilterCard columnsClassName="sm:grid-cols-2" submitLabel="Apply" submitExtraClassName="min-h-11">
      <input type="hidden" name="dateChip" value="custom" />
      <div className="min-w-0"><label className="label" htmlFor="statement-date">Statement date</label><input id="statement-date" className="input min-h-11 w-full min-w-0 max-w-full" type="date" name="asOf" defaultValue={key} max={today} required /></div>
    </ReportFilterCard></div> : null}
    {hasNotes ? <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm leading-relaxed text-amber-950" aria-label="Report notes">
      <h2 className="font-semibold">{missingStockCosts || diagnostic.profitIncomplete ? 'Figures may be incomplete' : 'Balances need attention'}</h2>
      {missingStockCosts ? <p>Some stock has no cost entry. Stock value and owner’s equity may be incomplete. <Link className="font-semibold underline" href="/products?issue=MISSING_COST">View missing product costs</Link></p> : null}
      {diagnostic.profitIncomplete ? <p>Some sales have no product cost recorded. Recorded profit and owner’s equity may be incomplete. <Link className="font-semibold underline" href="/products?issue=MISSING_COST">Review missing costs</Link></p> : null}
      {sheet.legacyCapitalPence !== 0 ? <p>Opening capital setting: {money(sheet.legacyCapitalPence)}. This undated setting is separate from the opening balance entries included below. <Link className="font-semibold underline" href="/settings">View opening balance settings</Link></p> : null}
      {diagnostic.equationDifferencePence !== 0 ? <p>Entry difference: {money(diagnostic.equationDifferencePence)}. Assets differ from liabilities and equity by this amount. <Link className="font-semibold underline" href={'/payments/reconciliation/balances?month=' + key.slice(0, 7)}>View account entries</Link></p> : null}
    </section> : null}
    <ReportSummaryCard spacingClassName="min-w-0 space-y-3 !p-4 sm:!p-6">
      <section aria-label="Financial position" data-balance-sheet-statement className="space-y-3">
        {groups.map(group => <section id={group.id} key={group.id} className="min-w-0 space-y-1" aria-label={group.name}>
          <h2 className="text-sm font-semibold text-ink">{group.name}</h2>
          {group.rows.length === 0 ? <p className="py-1 text-sm text-ink/60">No entries for this date.</p> : <ul>
            {[...group.rows].sort((a, b) => a.accountCode.localeCompare(b.accountCode)).map(row => <li key={row.accountCode} className="grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <span className="min-w-0 break-words text-ink/70">{accountName(row)}</span>
              <Link href={entriesHref(row.accountCode)} aria-label={`View entries for ${accountName(row)}: ${money(row.balancePence)}`} className="flex min-h-[45px] min-w-11 max-w-full items-center justify-end rounded text-right font-semibold tabular-nums underline decoration-current/30 underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><span className="min-w-0 [overflow-wrap:anywhere]">{money(row.balancePence)}</span></Link>
            </li>)}
          </ul>}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-t border-black/10 pt-2 text-base font-semibold sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><span>{group.totalLabel}</span><span className="min-w-0 text-right tabular-nums [overflow-wrap:anywhere]">{money(group.total)}</span></div>
        </section>)}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-t border-black/10 pt-3 text-base font-semibold text-accent sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><span>Total liabilities and equity</span><span className="min-w-0 text-right tabular-nums [overflow-wrap:anywhere]">{money(sheet.totalLiabilities + sheet.totalEquity)}</span></div>
      </section>
    </ReportSummaryCard>
    <p className="text-sm text-ink/60">Your financial position from recorded opening balances and transactions. Tap an underlined amount to see the records behind it.</p>
    <p className="text-sm text-ink/60">In a balanced report, owner’s equity is what remains after deducting what the business owes from what it owns. This is not cash available to withdraw.</p>
    <details className="rounded-xl border border-slate-200/80 bg-white/60 px-4 py-1 text-sm text-ink/70"><summary className="min-h-11 cursor-pointer py-3 font-semibold text-accent">How to read this report</summary><div className="space-y-2 pb-3"><p>Owner contributions appear in equity; repayable owner advances appear in liabilities. Cash held by staff remains a business asset. Recorded profit uses posted income and expense entries.</p><p>Negative balances are kept as recorded; they may reflect credits or amounts needing review. Stock-cost checks use current stock records, not a historical stock-cost snapshot.</p></div></details>
    <div className="flex flex-wrap gap-x-4 text-sm print:hidden"><DownloadLink className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={'/api/reports/financials?type=balance-sheet&from=' + key + '&to=' + key}>Export CSV</DownloadLink><Link className="inline-flex min-h-11 items-center font-semibold text-accent underline" href={'/payments/reconciliation/balances?month=' + key.slice(0, 7)}>Open monthly account review →</Link></div>
  </div>;
}
