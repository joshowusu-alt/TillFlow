import { PeriodComparisonChart } from '@/components/reports/charts/ReportVisuals';
import Link from 'next/link';
import DownloadLink from '@/components/DownloadLink';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import ReportKeyboardFocus from './ReportKeyboardFocus';
import ReportMoreActions from './ReportMoreActions';
import { ReportDisclosure, ReportMetric, ReportSection, ReportValueBars, REPORT_LINK, REPORT_FOCUS } from './ReportPrimitives';
import BusinessMovementSummary from '@/components/reports/BusinessMovementSummary';
import BusinessMovementInsight from '@/components/reports/BusinessMovementInsight';
import BusinessMovementProductCards from '@/components/reports/BusinessMovementProductCards';
import FinancialAmount from '@/components/reports/FinancialAmount';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import PeriodChips, { readableReportPeriod } from '@/components/reports/PeriodChips';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { CONSOLIDATED_LABEL } from '@/lib/reports/scope-labels';
import { formatMoney } from '@/lib/format';
import { visibleMovementInsights } from '@/lib/reports/business-movement/presentation';
import { buildOwnerInsightSummary, buildOwnerSummaryStrip, ownerPeriodChrome, ownerProductMovers, singleBranchNote, singleCashierNote, describeChangeVsComparison,
  type BusinessMovementWithMoneyResult, type ChangePair } from '@/lib/reports/business-movement';

function changeHelper(pair: ChangePair, currency: string, noun = 'activity'): string {
  const described = describeChangeVsComparison(pair, 'Change');
  const abs = formatMoney(Math.abs(pair.absoluteChange), currency);
  if (pair.comparison === 0 && pair.current > 0) {
    return `+${abs} · No earlier ${noun}`;
  }
  if (pair.current === 0 && pair.comparison > 0) {
    return `−${abs} · No current ${noun}`;
  }
  const sign = pair.absoluteChange > 0 ? '+' : pair.absoluteChange < 0 ? '−' : '';
  if (described.usedPercentage && pair.percentageChange != null) {
    return `${sign}${abs} (${Math.abs(pair.percentageChange).toFixed(1)}%)`;
  }
  return `${sign}${abs}`;
}

function MovementMoneyRow({ label, pair, currency, unavailable, href, earlierHref, helper }: { label: string; pair: ChangePair; currency: string; unavailable: boolean; href?: string; earlierHref?: string; helper: string }) {
  const amount = (pence: number, period: string, link?: string) => link ? <Link href={link} className={`inline-flex min-h-[45px] max-w-full items-center underline decoration-current/30 underline-offset-4 ${REPORT_FOCUS}`} aria-label={`${label}, ${period}: ${formatMoney(pence, currency)}`}><FinancialAmount pence={pence} currency={currency} variant="compact" className="!text-base" /></Link> : <FinancialAmount pence={pence} currency={currency} variant="compact" className="!text-base" />;
  return <dl data-stage3b-metric className="min-w-0 space-y-1 border-t border-black/10 pt-2"><dt className="font-semibold text-ink">{label}</dt>{unavailable ? <dd className="text-sm text-slate-600">Could not load</dd> : <><dd className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] items-center gap-2 tabular-nums"><span className="financial-fit"><span className="block text-xs text-slate-600">Current</span>{amount(pair.current, 'Current', href)}</span><span className="financial-fit"><span className="block text-xs text-slate-600">Earlier</span>{amount(pair.comparison, 'Earlier', earlierHref)}</span></dd><dd className="text-xs text-slate-600">{helper}</dd></>}</dl>;
}

export default function BusinessMovementReportView({ result, scopeLabel, readOnly = false, choices, offerAll, selectedStoreId, selectedPreset, currentFromValue, currentToValue, exportQuery, moneyQuery, selectedPeriod }: {
  result: BusinessMovementWithMoneyResult; scopeLabel: string; readOnly?: boolean;
  choices: { id: string; name: string }[]; offerAll: boolean; selectedStoreId: string;
  selectedPreset: string; currentFromValue: string; currentToValue: string; exportQuery: string; moneyQuery: string;
  selectedPeriod?: string;
}) {
  const summary = buildOwnerInsightSummary(result);
  const strip = buildOwnerSummaryStrip(result, summary.insights);
  const chrome = ownerPeriodChrome(result.scope.periods);
  const currency = result.scope.currency;
  const p = result.scope.periods;
  const gap = result.leakage.salesMinusMoneyReceivedCurrentPence;
  const queryFailed = result.moneyQueryFailed;
  const productMovers = ownerProductMovers(result);
  const branchNote = singleBranchNote(result.branches);
  const cashierNote = singleCashierNote(result.cashiers);
  const insights = visibleMovementInsights(summary.insights, result);
  const exportQs = new URLSearchParams(exportQuery);
  const moneyQs = new URLSearchParams(moneyQuery);
  const momoQs = new URLSearchParams(moneyQuery);
  const earlierMoneyQs = new URLSearchParams(moneyQuery);
  earlierMoneyQs.set('from', p.comparisonFromKey); earlierMoneyQs.set('to', p.comparisonToKey);
  return (
    <div className="space-y-4 sm:space-y-5 [&_tbody_td]:text-base [&_td_.financial-amount]:!text-base">
      {readOnly ? <ReportReadOnlyBanner /> : null}
      <ReportsDestinationHead
        title="Business movement"
        scopeLabel={choices.length > 1 ? scopeLabel : undefined}
        periodLabel={`${readableReportPeriod(p.currentFromKey, p.currentToKey)} compared with ${readableReportPeriod(p.comparisonFromKey, p.comparisonToKey)}`}
        showRefresh={false}
        actions={
          <>
            <ReportKeyboardFocus />
            <Link
              href={`/reports/money-received?${moneyQs.toString()}`}
              className="btn-primary min-h-11 justify-center text-sm"
            >
              Money received
            </Link>
            <ReportMoreActions>
            <Link href={`/reports/momo-confirmation?${momoQs.toString()}`} className="btn-secondary text-sm">Review MoMo confirmations</Link>
            <DownloadLink
              href={`/exports/business-movement?${exportQs.toString()}`}
              fallbackFilename={`business-movement-${p.currentFromKey}-${p.currentToKey}.csv`}
              className="btn-secondary justify-center text-sm"
              disabled={queryFailed}
            >
              Export CSV
            </DownloadLink>
            </ReportMoreActions>
          </>
        }
      />
      <PeriodChips from={p.currentFromKey} to={p.currentToKey} timeZone={p.timeZone}
        now={result.scope.asOf} selected={selectedPeriod} movement storeId={selectedStoreId}
        branchControl={choices.length > 1 ? <ReportFilterCard columnsClassName="sm:grid-cols-2" submitLabel="Apply branch">
        <input type="hidden" name="preset" value={selectedPreset} />
        <input type="hidden" name="currentFrom" value={currentFromValue || p.currentFromKey} />
        <input type="hidden" name="currentTo" value={currentToValue || p.currentToKey} />
        {selectedPeriod ? <input type="hidden" name="periodChip" value={selectedPeriod} /> : null}
        <div className="text-sm">
          <label htmlFor="movement-storeId" className="mb-1 block text-slate-600">Branch</label>
          <select className="input min-h-11 w-full" id="movement-storeId" name="storeId" defaultValue={selectedStoreId}>
            {offerAll ? <option value="ALL">{CONSOLIDATED_LABEL}</option> : null}
            {choices.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
      </ReportFilterCard> : undefined} />
      {queryFailed ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Payment figures could not be loaded. Receipts, refunds, pending MoMo and the gap are unavailable. Sales figures remain separate.</p> : null}
      <BusinessMovementSummary result={result} labels={chrome} strip={strip}>
        <MovementMoneyRow currency={currency} label="Money received" pair={result.money.moneyReceived} unavailable={queryFailed} helper={changeHelper(result.money.moneyReceived, currency, 'receipts')} href={`/reports/money-received?${moneyQs}`} earlierHref={`/reports/money-received?${earlierMoneyQs}`} />
        <MovementMoneyRow currency={currency} label="Refunds" pair={result.money.refundOutflows} unavailable={queryFailed} helper={changeHelper(result.money.refundOutflows, currency, 'refunds')} />
        <MovementMoneyRow currency={currency} label="MoMo waiting to be confirmed" pair={result.money.needsMomoConfirmation} unavailable={queryFailed} helper={changeHelper(result.money.needsMomoConfirmation, currency, 'pending MoMo payments')} href={`/reports/momo-confirmation?${momoQs}`} earlierHref={`/reports/momo-confirmation?${earlierMoneyQs}`} />
      </BusinessMovementSummary>

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">What to look at</h2>
          <p className="text-sm text-slate-600">
            Recorded changes to review in {chrome.currentFull}.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {insights.slice(0, 2).map((insight) => (
            <BusinessMovementInsight key={insight.id} insight={insight} labels={chrome} currency={currency} />
          ))}
        </div>
        {insights.length === 0 ? <p className="text-sm text-slate-600">No material recorded changes for these periods.</p> : null}

      </section>
      <ReportSection title="Biggest product changes" description="Recorded sales changes, not proven causes.">
        <ReportValueBars compact dense diverging currency={currency} rows={productMovers.slice(0, 6).map(row => ({ label: row.productName, pence: row.changePence, helper: row.side === 'New product' ? 'No sales in the earlier period' : row.side, href: `/products/${encodeURIComponent(row.productId)}` }))} empty="No material product changes for these periods." />
      </ReportSection>
        {insights.length > 2 ? <ReportDisclosure title={`More recorded changes (${insights.length - 2})`}><div className="grid gap-3 lg:grid-cols-2">{insights.slice(2).map(insight => <BusinessMovementInsight key={insight.id} insight={insight} labels={chrome} currency={currency} />)}</div></ReportDisclosure> : null}
      <ReportDisclosure title="Sales and money compared">
        <ReportMetric currency={currency} label={gap != null && gap < 0 ? 'Money received above sales' : 'Sales not yet received'}
          value="Could not load" pence={queryFailed || gap == null ? null : Math.abs(gap)}
          helper={queryFailed || gap == null ? 'Money received could not be loaded.' : gap === 0 ? 'Sales and money received have the same total.' : 'Difference between sales and money received; the totals alone do not explain it.'} />
      <div className="min-w-0" data-movement-charts>
      <ReportSection title="Current and earlier period" description="The same dates and branch selection as the figures above.">
        <PeriodComparisonChart columns currency={currency} currentLabel={chrome.currentFull} previousLabel={chrome.comparisonFull} rows={[
          { name: 'Sales', current: result.headline.salesValuePence.current, previous: result.headline.salesValuePence.comparison },
          ...(!queryFailed ? [
            { name: 'Money received', current: result.money.moneyReceived.current, previous: result.money.moneyReceived.comparison },
            { name: 'Refunds', current: result.money.refundOutflows.current, previous: result.money.refundOutflows.comparison },
          ] : []),
        ]} />
      </ReportSection>
      </div>
      </ReportDisclosure>
      <ReportDisclosure title="All product figures">
      <BusinessMovementProductCards rows={productMovers} labels={chrome} currency={currency} />
      <div className="hidden lg:block">
      <ReportTableCard title="Product movers">
        <caption className="mb-2 caption-top text-left text-sm text-slate-600">
          Products that grew, dropped, appeared, or had no sales in {chrome.currentFull}.
        </caption>
        <thead>
          <tr>
            <th className="text-left">Product</th>
            <th className="text-left">What happened</th>
            <th className="!text-right">{chrome.currentFull}</th>
            <th className="!text-right">{chrome.comparisonFull}</th>
            <th className="!text-right">Change</th>
            <th className="!text-right">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {productMovers.length === 0 ? (
            <ReportTableEmptyRow
              colSpan={6}
              message={`No material product movers for ${chrome.currentFull} vs ${chrome.comparisonFull}.`}
            />
          ) : (
            productMovers.map((row) => (
              <tr key={`${row.side}-${row.productId}`}>
                <td><Link href={`/products/${encodeURIComponent(row.productId)}`} className={REPORT_LINK}>{row.productName}</Link></td>
                <td>{row.side === 'New product' ? 'No sales in the earlier period' : row.side}</td>
                <td className="!text-right">{formatMoney(row.currentPence, currency)}</td>
                <td className="!text-right">{formatMoney(row.comparisonPence, currency)}</td>
                <td className="!text-right">{row.changePence > 0 ? '+' : null}<FinancialAmount pence={row.changePence} currency={currency} variant="compact" /></td>
                <td className="!text-right">{row.qtyWording}</td>
              </tr>
            ))
          )}
        </tbody>
      </ReportTableCard>
      </div>
      </ReportDisclosure>

      <ReportDisclosure title="Branches">{branchNote ? (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <h2 className="text-base font-semibold text-slate-900">Branches</h2>
          <p className="mt-1">{branchNote}</p>
        </section>
      ) : (
        <section className="min-w-0">
          <div className="space-y-3 lg:hidden"><h2 className="font-display text-lg font-semibold text-ink">Branch movement</h2>{result.branches.map(row => <article key={row.storeId} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-semibold text-ink">{row.storeName}</h3><dl className="mt-3 space-y-3">{([[chrome.currentFull, row.salesValuePence.current], [chrome.comparisonFull, row.salesValuePence.comparison], ['Change', row.salesValuePence.absoluteChange]] as const).map(([label, pence]) => <div key={label}><dt className="text-xs text-slate-600">{label}</dt><dd className="financial-fit mt-1"><FinancialAmount pence={pence} currency={currency} /></dd></div>)}</dl><p className="mt-2 text-xs text-slate-600">{row.transactionCount.current} sales vs {row.transactionCount.comparison}</p></article>)}</div>
          <div className="hidden lg:block">
        <ReportTableCard title="Branch movement">
          <caption className="mb-2 caption-top text-left text-sm text-slate-600">
            How each branch’s sales moved compared with {chrome.comparisonFull}.
          </caption>
          <thead>
            <tr>
              <th className="text-left">Branch</th>
              <th className="!text-right">{chrome.currentFull}</th>
              <th className="!text-right">{chrome.comparisonFull}</th>
              <th className="!text-right">Change</th>
              <th className="!text-right">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {result.branches.map((row) => (
              <tr key={row.storeId}>
                <td>{row.storeName}</td>
                <td className="!text-right">{formatMoney(row.salesValuePence.current, currency)}</td>
                <td className="!text-right">
                  {formatMoney(row.salesValuePence.comparison, currency)}
                </td>
                <td className="!text-right">{row.salesValuePence.absoluteChange > 0 ? '+' : null}<FinancialAmount pence={row.salesValuePence.absoluteChange} currency={currency} variant="compact" /></td>
                <td className="!text-right">
                  {row.transactionCount.current} / {row.transactionCount.comparison}
                </td>
              </tr>
            ))}
          </tbody>
        </ReportTableCard>
          </div>
        </section>
      )}</ReportDisclosure>

      <ReportDisclosure title="Cashier sales and details">
        <p className="text-xs text-slate-600">Recorded sales attributed to each cashier in {chrome.currentFull}. This is not a measure of individual productivity.</p>
        <ReportValueBars compact dense currency={currency} rows={result.cashiers.slice(0, 5).map(row => ({ label: row.cashierName, pence: row.salesValuePence.current }))} empty="No cashier-attributed sales in this period." />
        <p className="text-xs text-slate-600">Up to five cashiers shown. Complete current and earlier figures remain below.</p>
        {cashierNote ? (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <h2 className="text-base font-semibold text-slate-900">Cashiers</h2>
          <p className="mt-1">{cashierNote}</p>
        </section>
      ) : (
        <section className="min-w-0">
          <div className="space-y-3 lg:hidden"><h2 className="font-display text-lg font-semibold text-ink">Cashier movement</h2>{result.cashiers.map(row => <article key={row.cashierUserId} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-semibold text-ink">{row.cashierName}</h3><dl className="mt-3 space-y-3">{([[chrome.currentFull, row.salesValuePence.current], [chrome.comparisonFull, row.salesValuePence.comparison], ['Change', row.salesValuePence.absoluteChange]] as const).map(([label, pence]) => <div key={label}><dt className="text-xs text-slate-600">{label}</dt><dd className="financial-fit mt-1"><FinancialAmount pence={pence} currency={currency} /></dd></div>)}</dl><p className="mt-2 text-xs text-slate-600">{row.transactionCount.current} sales vs {row.transactionCount.comparison}</p></article>)}</div>
          <div className="hidden lg:block">
        <ReportTableCard title="Cashier movement">
          <caption className="mb-2 caption-top text-left text-sm text-slate-600">
            How cashier-attributed sales moved compared with {chrome.comparisonFull}.
          </caption>
          <thead>
            <tr>
              <th className="text-left">Cashier</th>
              <th className="!text-right">{chrome.currentFull}</th>
              <th className="!text-right">{chrome.comparisonFull}</th>
              <th className="!text-right">Change</th>
              <th className="!text-right">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {result.cashiers.map((row) => (
              <tr key={row.cashierUserId}>
                <td>{row.cashierName}</td>
                <td className="!text-right">{formatMoney(row.salesValuePence.current, currency)}</td>
                <td className="!text-right">
                  {formatMoney(row.salesValuePence.comparison, currency)}
                </td>
                <td className="!text-right">{row.salesValuePence.absoluteChange > 0 ? '+' : null}<FinancialAmount pence={row.salesValuePence.absoluteChange} currency={currency} variant="compact" /></td>
                <td className="!text-right">
                  {row.transactionCount.current} / {row.transactionCount.comparison}
                </td>
              </tr>
            ))}
          </tbody>
        </ReportTableCard>
          </div>
        </section>
      )}</ReportDisclosure>

      <ReportDisclosure title="Data note">
        <p>Sales are counted by the time of the sale. Money received is counted by the time the money came in, so the two can differ.</p>
        {queryFailed ? (
          <p className="mt-2 text-amber-800">
            Money Received could not be loaded
            {result.moneyQueryError ? `: ${result.moneyQueryError}` : '.'} Sales figures above may
            still be usable.
          </p>
        ) : null}
      </ReportDisclosure>
    </div>
  );
}
