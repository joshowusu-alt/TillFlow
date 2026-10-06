import Link from 'next/link';
import DownloadLink from '@/components/DownloadLink';
import ReportHeader from './ReportHeader';
import { ReportDisclosure, ReportMetric, ReportSection, ReportValueBars, REPORT_LINK } from './ReportPrimitives';
import BusinessMovementSummary from '@/components/reports/BusinessMovementSummary';
import BusinessMovementInsight from '@/components/reports/BusinessMovementInsight';
import BusinessMovementProductCards from '@/components/reports/BusinessMovementProductCards';
import FinancialAmount from '@/components/reports/FinancialAmount';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';
import { CONSOLIDATED_LABEL } from '@/lib/reports/scope-labels';
import { formatMoney } from '@/lib/format';
import { movementGapCopy, visibleMovementInsights } from '@/lib/reports/business-movement/presentation';
import { buildOwnerInsightSummary, buildOwnerSummaryStrip, ownerPeriodChrome, ownerProductMovers, singleBranchNote, singleCashierNote, OWNER_STOCK_DATA_NOTE, describeChangeVsComparison,
  type BusinessMovementWithMoneyResult, type ChangePair, type OwnerPeriodLabels } from '@/lib/reports/business-movement';

function changeHelper(pair: ChangePair, currency: string, labels: OwnerPeriodLabels, noun = 'activity'): string {
  const described = describeChangeVsComparison(pair, 'Change');
  const abs = formatMoney(Math.abs(pair.absoluteChange), currency);
  if (pair.comparison === 0 && pair.current > 0) {
    return `New in ${labels.currentFull} · ${abs}`;
  }
  if (pair.current === 0 && pair.comparison > 0) {
    return `No ${noun} in ${labels.currentFull} · was ${abs} in ${labels.comparisonFull}`;
  }
  const sign = pair.absoluteChange > 0 ? '+' : pair.absoluteChange < 0 ? '−' : '';
  if (described.usedPercentage && pair.percentageChange != null) {
    return `${sign}${abs} (${Math.abs(pair.percentageChange).toFixed(1)}%) vs ${labels.comparisonFull}`;
  }
  return `${sign}${abs} vs ${labels.comparisonFull}`;
}

export default function BusinessMovementReportView({ result, scopeLabel, readOnly = false, choices, offerAll, selectedStoreId, selectedPreset, currentFromValue, currentToValue, exportQuery, moneyQuery }: {
  result: BusinessMovementWithMoneyResult; scopeLabel: string; readOnly?: boolean;
  choices: { id: string; name: string }[]; offerAll: boolean; selectedStoreId: string;
  selectedPreset: string; currentFromValue: string; currentToValue: string; exportQuery: string; moneyQuery: string;
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
  return (
    <div className="space-y-4 sm:space-y-5 [&_tbody_td]:text-base [&_td_.financial-amount]:!text-base">
      {readOnly ? <ReportReadOnlyBanner /> : null}
      <ReportHeader
        title="Business movement"
        scopeLabel={scopeLabel}
        periodLabel={chrome.comparingLine}
        actions={
          <div className="grid gap-2">
            <Link
              href={`/reports/momo-confirmation?${momoQs.toString()}`}
              className="btn-secondary justify-center text-sm"
            >
              Review MoMo confirmations
            </Link>
            <Link
              href={`/reports/money-received?${moneyQs.toString()}`}
              className="btn-secondary justify-center text-sm"
            >
              Open money received
            </Link>
            <DownloadLink
              href={`/exports/business-movement?${exportQs.toString()}`}
              fallbackFilename={`business-movement-${p.currentFromKey}-${p.currentToKey}.csv`}
              className="btn-secondary justify-center text-sm"
              disabled={queryFailed}
            >
              Export CSV
            </DownloadLink>
          </div>
        }
      />
      {queryFailed ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Payment figures could not be loaded. Receipts, refunds, pending MoMo and the gap are unavailable. Sales figures remain separate.</p> : null}
      <BusinessMovementSummary result={result} labels={chrome} strip={strip} />

      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <ReportMetric currency={currency}
          label="Confirmed receipts"
          value="Could not load"
          pence={queryFailed ? null : result.money.moneyReceived.current}
          helper={
            queryFailed
              ? 'Confirmed receipts could not be loaded'
              : changeHelper(result.money.moneyReceived, currency, chrome)
          }

        />
        <ReportMetric currency={currency}
          label="Refunds"
          value="Could not load"
          pence={queryFailed ? null : result.money.refundOutflows.current}
          helper={queryFailed ? 'Refund figures could not be loaded' : changeHelper(result.money.refundOutflows, currency, chrome, 'refunds')}
          warning={result.money.refundOutflows.absoluteChange > 0}
        />
        <ReportMetric currency={currency}
          label="MoMo to confirm"
          value="Could not load"
          pence={queryFailed ? null : result.money.needsMomoConfirmation.current}
          helper={queryFailed ? 'Pending payments could not be loaded' : changeHelper(result.money.needsMomoConfirmation, currency, chrome, 'pending MoMo payments')}
          warning={result.money.needsMomoConfirmation.current > 0}
        />
        <ReportMetric currency={currency}
          label="Sales and receipts gap"
          value="Could not load"
          pence={queryFailed || gap == null ? null : Math.abs(gap)}
          helper={movementGapCopy(queryFailed ? null : gap, currency)}

        />
      </div>

      <p className="text-sm leading-6 text-slate-600">Refunds are shown separately here. Confirmed receipts are different from Today’s net money received.</p>

      <details className="rounded-xl border border-slate-200 bg-white px-3 py-1">
        <summary className="flex min-h-11 w-fit max-w-full cursor-pointer items-center rounded-lg px-1 text-sm font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Change period or branch</summary>
      <ReportFilterCard columnsClassName="md:grid-cols-2 xl:grid-cols-4">
        <div className="text-sm">
          <label htmlFor="movement-preset" className="mb-1 block text-slate-600">Period</label>
          <select className="input w-full" id="movement-preset" name="preset" defaultValue={selectedPreset}>
            <option value="last_full_calendar_month">Last full calendar month</option>
            <option value="equal_length_custom">Custom dates (same-length comparison)</option>
          </select>
        </div>
        <div className="text-sm">
          <label htmlFor="movement-currentFrom" className="mb-1 block text-slate-600">From</label>
          <input
            className="input w-full"
            type="date"
            id="movement-currentFrom" name="currentFrom"
            defaultValue={currentFromValue || p.currentFromKey}
          />
        </div>
        <div className="text-sm">
          <label htmlFor="movement-currentTo" className="mb-1 block text-slate-600">To</label>
          <input
            className="input w-full"
            type="date"
            id="movement-currentTo" name="currentTo"
            defaultValue={currentToValue || p.currentToKey}
          />
        </div>
        <div className="text-sm">
          <label htmlFor="movement-storeId" className="mb-1 block text-slate-600">Branch</label>
          <select className="input w-full" id="movement-storeId" name="storeId" defaultValue={selectedStoreId}>
            {offerAll ? <option value="ALL">{CONSOLIDATED_LABEL}</option> : null}
            {choices.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
      </ReportFilterCard>
      </details>


      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">What to look at</h2>
          <p className="text-sm text-slate-600">
            Recorded changes to review in {chrome.currentFull}.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {insights.slice(0, 3).map((insight) => (
            <BusinessMovementInsight key={insight.id} insight={insight} labels={chrome} currency={currency} />
          ))}
        </div>
        {insights.length === 0 ? <p className="text-sm text-slate-600">No material recorded changes for these periods.</p> : null}
        {insights.length > 3 ? <ReportDisclosure title={`More recorded changes (${insights.length - 3})`}><div className="grid gap-3 lg:grid-cols-2">{insights.slice(3).map(insight => <BusinessMovementInsight key={insight.id} insight={insight} labels={chrome} currency={currency} />)}</div></ReportDisclosure> : null}
      </section>

      <ReportSection title="Largest product changes" description="Recorded sales changes in the ranked product list. An increase or decrease does not establish its cause.">
        <ReportValueBars currency={currency} rows={productMovers.slice(0, 6).map(row => ({ label: row.productName, pence: row.changePence, helper: row.side === 'New product' ? 'No sales in the earlier period' : row.side, href: `/products/${encodeURIComponent(row.productId)}` }))} empty="No material product changes for these periods." />
      </ReportSection>
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
            <th className="text-right">{chrome.currentFull}</th>
            <th className="text-right">{chrome.comparisonFull}</th>
            <th className="text-right">Change</th>
            <th className="text-right">Quantity</th>
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
                <td className="text-right">{formatMoney(row.currentPence, currency)}</td>
                <td className="text-right">{formatMoney(row.comparisonPence, currency)}</td>
                <td className="text-right">{row.changePence > 0 ? '+' : null}<FinancialAmount pence={row.changePence} currency={currency} variant="compact" /></td>
                <td className="text-right">{row.qtyWording}</td>
              </tr>
            ))
          )}
        </tbody>
      </ReportTableCard>
      </div>
      </ReportDisclosure>

      {branchNote ? (
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
              <th className="text-right">{chrome.currentFull}</th>
              <th className="text-right">{chrome.comparisonFull}</th>
              <th className="text-right">Change</th>
              <th className="text-right">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {result.branches.map((row) => (
              <tr key={row.storeId}>
                <td>{row.storeName}</td>
                <td className="text-right">{formatMoney(row.salesValuePence.current, currency)}</td>
                <td className="text-right">
                  {formatMoney(row.salesValuePence.comparison, currency)}
                </td>
                <td className="text-right">{row.salesValuePence.absoluteChange > 0 ? '+' : null}<FinancialAmount pence={row.salesValuePence.absoluteChange} currency={currency} variant="compact" /></td>
                <td className="text-right">
                  {row.transactionCount.current} / {row.transactionCount.comparison}
                </td>
              </tr>
            ))}
          </tbody>
        </ReportTableCard>
          </div>
        </section>
      )}

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
              <th className="text-right">{chrome.currentFull}</th>
              <th className="text-right">{chrome.comparisonFull}</th>
              <th className="text-right">Change</th>
              <th className="text-right">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {result.cashiers.map((row) => (
              <tr key={row.cashierUserId}>
                <td>{row.cashierName}</td>
                <td className="text-right">{formatMoney(row.salesValuePence.current, currency)}</td>
                <td className="text-right">
                  {formatMoney(row.salesValuePence.comparison, currency)}
                </td>
                <td className="text-right">{row.salesValuePence.absoluteChange > 0 ? '+' : null}<FinancialAmount pence={row.salesValuePence.absoluteChange} currency={currency} variant="compact" /></td>
                <td className="text-right">
                  {row.transactionCount.current} / {row.transactionCount.comparison}
                </td>
              </tr>
            ))}
          </tbody>
        </ReportTableCard>
          </div>
        </section>
      )}

      <ReportDisclosure title="Data note and how to read this">
        <p>Sales, confirmed receipts, refunds and pending MoMo are operational figures. This is not an income statement and does not calculate purchases or expenses.</p>
        <p className="mt-1">{OWNER_STOCK_DATA_NOTE}</p>
        <p className="mt-1">
          Sales use the time the invoice was created. Money Received uses the time confirmed money
          came in. Different payment dates can cause a gap. This report does not reconcile individual sales and receipts, so the gap alone cannot confirm its cause.
        </p>
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
