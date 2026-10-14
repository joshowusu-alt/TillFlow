import Link from 'next/link';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { localDateInstant } from '@/lib/reports/reporting-clock';
import { getBalanceSheet } from '@/lib/reports/financials';
import { formatMoney } from '@/lib/format';
import DownloadLink from '@/components/DownloadLink';

export default async function BalanceSheetPage({ searchParams }: {
  searchParams?: { asOf?: string; storeId?: string; businessId?: string };
}) {
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
  const sheet = await getBalanceSheet(business.id, new Date(Math.min(end.getTime(), now.getTime())));
  const money = (amount: number) => formatMoney(amount === 0 ? 0 : amount, business.currency);
  const diagnostic = sheet.reconciliation;
  return <div className="space-y-5">
    {opened.readOnly ? <ReportReadOnlyBanner /> : null}
    <ReportsDestinationHead title="Balance sheet" scopeLabel={opened.branch.kind === 'label' ? opened.branch.label : undefined}
      periodLabel={key + ' · ' + zone + (key === formatBusinessLocalDateKey(now, zone) ? ' · through now' : ' · end of day')}
      actions={<DownloadLink className="btn-secondary" href={'/api/reports/financials?type=balance-sheet&from=' + key + '&to=' + key}>Export CSV</DownloadLink>} />
    <form className="card flex flex-wrap items-end gap-3 p-5" method="GET">
      <label className="label">Statement date<input className="input" type="date" name="asOf" defaultValue={key} max={formatBusinessLocalDateKey(now, zone)} required /></label>
      <button className="btn-secondary" type="submit">Review date</button>
    </form>
    <section className="card space-y-2 p-5" aria-label="Statement basis">
      <h2 className="font-semibold">Based on your recorded entries</h2>
      <p>No external balances have been verified by TillFlow. Your business is responsible for confirming opening balances and checking its records. The statement does not make corrections or certify reconciliation.</p>
      <p>Assets, liabilities and equity retain their recorded signs. Profit in equity comes from the ledger. Differences are shown below and are never added to inventory.</p>
      <p>The Bank account currently combines electronic money; it does not establish a separate balance for each bank account or MoMo wallet.</p>
    </section>
    {diagnostic.stockValueIncomplete || diagnostic.profitIncomplete ? <section className="card p-5" aria-label="Cost completeness">
      <h2 className="font-semibold">Cost information needs review</h2>
      {diagnostic.stockValueIncomplete ? <p>Current stock includes quantities without confirmed costs. Recorded inventory below may be incomplete; it is not a reconstructed physical stock valuation for this date.</p> : null}
      {diagnostic.profitIncomplete ? <p>Some sales through this date lack confirmed costs. Recorded ledger profit is shown, while operational profit cannot be confirmed.</p> : null}
    </section> : null}
    {sheet.legacyCapitalPence !== 0 ? <section className="card p-5" aria-label="Legacy opening capital">
      <h2 className="font-semibold">Undated opening capital: {money(sheet.legacyCapitalPence)}</h2>
      <p>This older setting is disclosed separately. It is not added to cash or equity because it has no dated ledger entry. Check opening records before making any correction.</p>
    </section> : null}
    {[{ name: 'Assets', rows: sheet.assets, total: sheet.totalAssets }, { name: 'Liabilities', rows: sheet.liabilities, total: sheet.totalLiabilities }, { name: 'Equity', rows: sheet.equity, total: sheet.totalEquity }].map(group => <section key={group.name} className="card space-y-3 p-5">
      <h2 className="text-lg font-semibold">{group.name}</h2>
      {group.rows.length === 0 ? <p>No recorded balances.</p> : <dl className="space-y-2">{group.rows.map(row => <div className="flex justify-between gap-4" key={row.accountCode}><dt>{row.name} ({row.accountCode})</dt><dd className="text-right tabular-nums">{money(row.balancePence)}</dd></div>)}</dl>}
      <p className="flex justify-between gap-4 border-t pt-3 font-semibold"><span>Total {group.name.toLowerCase()}</span><span>{money(group.total)}</span></p>
    </section>)}
    <section className="card space-y-2 p-5" aria-label="Statement differences">
      <h2 className="font-semibold">Differences to review</h2>
      <p>Assets minus liabilities and equity: {money(diagnostic.equationDifferencePence)}</p>
      <p>Ledger profit: {money(diagnostic.journalProfitPence)}</p>
      <p>Operational profit: {diagnostic.operationalProfitPence == null ? 'Costs incomplete' : money(diagnostic.operationalProfitPence)}</p>
      <p>Operational less ledger profit: {diagnostic.profitDifferencePence == null ? 'Costs incomplete' : money(diagnostic.profitDifferencePence)}</p>
      <p>A zero difference means the recorded calculations agree. It does not confirm that every transaction was recorded or checked against statements.</p>
      <Link className="btn-secondary inline-block" href={'/payments/reconciliation/balances?month=' + key.slice(0, 7)}>Open monthly balance review</Link>
    </section>
  </div>;
}
