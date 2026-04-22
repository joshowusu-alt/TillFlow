import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import DownloadLink from '@/components/DownloadLink';
import StatCard from '@/components/StatCard';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportSectionHeader from '@/components/reports/ReportSectionHeader';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { formatMoney } from '@/lib/format';
import { resolveSelectableReportDateRange } from '@/lib/reports/date-parsing';
import { getMarginAnalysisSnapshot, type MarginAnalysisRow } from '@/lib/reports/margin-analysis';

const periodOptions = [
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '365d', label: '1 year' },
  { value: 'mtd', label: 'Month to date' },
  { value: 'custom', label: 'Custom dates' },
] as const;

const viewOptions = [
  { value: 'all', label: 'All sold products' },
  { value: 'below-cost', label: 'Selling below cost' },
  { value: 'below-target', label: 'Below target margin' },
] as const;

function buildMarginsHref(
  view: 'all' | 'below-cost' | 'below-target',
  query: { period: string; from: string; to: string },
) {
  const params = new URLSearchParams({
    view,
    period: query.period,
    from: query.from,
    to: query.to,
  });

  return `/reports/margins?${params.toString()}`;
}

function formatMarginPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function resolveMarginsView(view: string | undefined) {
  if (view === 'below-cost' || view === 'below-target') return view;
  return 'all';
}

function marginBadgeClass(row: MarginAnalysisRow) {
  if (row.belowCost) return 'bg-rose-100 text-rose-700';
  if (row.belowTargetMargin) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

function sortRowsForView(rows: MarginAnalysisRow[], view: 'all' | 'below-cost' | 'below-target') {
  if (view === 'below-cost') {
    return [...rows].sort((a, b) => a.profitPence - b.profitPence || a.marginPercent - b.marginPercent);
  }

  if (view === 'below-target') {
    return [...rows].sort((a, b) => a.marginDeltaPercent - b.marginDeltaPercent || a.profitPence - b.profitPence);
  }

  return [...rows].sort((a, b) => b.profitPence - a.profitPence);
}

export default async function MarginsPage({
  searchParams,
}: {
  searchParams?: { period?: string; from?: string; to?: string; view?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Business not found.</div>;
  const features = getFeatures((business as any).plan ?? (business.mode as any), (business as any).storeMode as any);
  if (!features.advancedReports) {
    return (
      <AdvancedModeNotice
        title="Profit Margins is available on Growth and Pro"
        description="Margin analysis, below-cost checks, and target tracking are unlocked on businesses provisioned for Growth or Pro."
        featureName="Profit Margins"
        minimumPlan="GROWTH"
      />
    );
  }

  const { start, end, fromInputValue, toInputValue, periodInputValue } = resolveSelectableReportDateRange(searchParams, '30d');
  const currentView = resolveMarginsView(searchParams?.view);
  const snapshot = await getMarginAnalysisSnapshot({ businessId: business.id, start, end });
  const products = snapshot.rows;

  const totalRevenue = products.reduce((sum, row) => sum + row.revenuePence, 0);
  const totalCost = products.reduce((sum, row) => sum + row.costPence, 0);
  const totalProfit = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const filteredRows = sortRowsForView(
    currentView === 'below-cost'
      ? products.filter((row) => row.belowCost)
      : currentView === 'below-target'
        ? products.filter((row) => row.belowTargetMargin)
        : products,
    currentView,
  );

  const topPerformers = [...products]
    .sort((a, b) => b.profitPence - a.profitPence)
    .slice(0, 5);

  const lowMarginProducts = [...products]
    .sort((a, b) => a.marginPercent - b.marginPercent || a.profitPence - b.profitPence)
    .slice(0, 5);

  const viewLabel = viewOptions.find((option) => option.value === currentView)?.label ?? 'All sold products';
  const marginQuery = {
    period: periodInputValue,
    from: fromInputValue,
    to: toInputValue,
  };
  const exportHrefBase = `/exports/margins?period=${encodeURIComponent(periodInputValue)}&from=${encodeURIComponent(fromInputValue)}&to=${encodeURIComponent(toInputValue)}&view=${encodeURIComponent(currentView)}`;
  const quickViews = [
    { value: 'all' as const, label: 'All sold products', count: snapshot.totalProducts, tone: 'border-slate-200 bg-white text-slate-700' },
    { value: 'below-cost' as const, label: 'Selling below cost', count: snapshot.belowCostCount, tone: 'border-rose-200 bg-rose-50 text-rose-700' },
    { value: 'below-target' as const, label: 'Below target margin', count: snapshot.belowTargetMarginCount, tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  ];
  const filterSummary = currentView === 'all'
    ? `Showing all ${products.length} sold product${products.length === 1 ? '' : 's'} in this period.`
    : `Showing ${filteredRows.length} product${filteredRows.length === 1 ? '' : 's'} flagged for ${viewLabel.toLowerCase()} in this period.`;

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
      <PageHeader
        title="Profit Margins"
        subtitle="Spot below-cost lines and products falling short of your target margin."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DownloadLink
              href={`${exportHrefBase}&format=xlsx`}
              className="btn-secondary text-xs"
              fallbackFilename="margins.xlsx"
            >
              Excel
            </DownloadLink>
            <a
              href={`${exportHrefBase}&format=pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs"
            >
              Print / PDF
            </a>
          </div>
        }
      />

      <details className="details-mobile" open>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
            </svg>
            Filters
          </span>
          <span className="flex items-center gap-2">
            <span className="hidden rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent sm:inline-block">
              {periodOptions.find(o => o.value === periodInputValue)?.label ?? periodInputValue} &middot; {viewLabel}
            </span>
            <svg className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </span>
        </summary>
        <div className="mt-2">
          <ReportFilterCard
            columnsClassName="lg:grid-cols-6"
            submitLabel="Apply filters"
            submitTone="primary"
            actions={
              <a href="/reports/margins?period=30d&view=all" className="btn-secondary w-full justify-center text-sm sm:w-auto">
                Reset
              </a>
            }
          >
            <div>
              <label className="label">View</label>
              <select className="input" name="view" defaultValue={currentView}>
                {viewOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Quick period</label>
              <select className="input" name="period" defaultValue={periodInputValue}>
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">From</label>
              <input className="input" type="date" name="from" defaultValue={fromInputValue} />
            </div>
            <div>
              <label className="label">To</label>
              <input className="input" type="date" name="to" defaultValue={toInputValue} />
            </div>
          </ReportFilterCard>
        </div>
      </details>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-black">Exception views</h2>
            <p className="text-xs text-black/55">Open the exact items behind each margin count in one tap.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickViews.map((view) => {
              const isActive = currentView === view.value;

              return (
                <Link
                  key={view.value}
                  href={buildMarginsHref(view.value, marginQuery)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${view.tone} ${isActive ? 'ring-2 ring-offset-2 ring-accent/40' : 'hover:-translate-y-0.5'}`}
                >
                  <span>{view.label}</span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold">{view.count}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        {filterSummary}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue in period" value={formatMoney(totalRevenue, business.currency)} tone="accent" />
        <StatCard label="Cost in period" value={formatMoney(totalCost, business.currency)} />
        <StatCard label="Gross profit" value={formatMoney(totalProfit, business.currency)} tone={totalProfit >= 0 ? 'success' : 'danger'} />
        <StatCard label="Overall margin" value={formatMarginPercent(overallMargin)} tone={overallMargin >= snapshot.businessDefaultThresholdBps / 100 ? 'success' : 'warn'} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Products in scope" value={String(snapshot.totalProducts)} />
        <StatCard label="Below cost" value={String(snapshot.belowCostCount)} tone={snapshot.belowCostCount > 0 ? 'danger' : 'success'} />
        <StatCard label="Below target margin" value={String(snapshot.belowTargetMarginCount)} tone={snapshot.belowTargetMarginCount > 0 ? 'warn' : 'success'} />
        <StatCard label="Healthy products" value={String(snapshot.healthyCount)} tone="success" />
      </div>

      <ReportTableCard
        title={currentView === 'all' ? 'All sold products' : viewLabel}
        tableClassName="table mt-3 w-full min-w-[72rem] border-separate border-spacing-y-2"
      >
        <thead>
          <tr>
            <th className="text-left">Product</th>
            <th className="text-right">Qty Sold</th>
            <th className="text-right">Avg Sell / Base</th>
            <th className="text-right">Avg Cost / Base</th>
            <th className="text-right">Revenue</th>
            <th className="text-right">Cost</th>
            <th className="text-right">Profit</th>
            <th className="text-right">Margin %</th>
            <th className="text-right">Target %</th>
            <th className="text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map((row) => (
            <tr key={row.productId} className="rounded-xl bg-white">
              <td className="px-3 py-3">
                <div className="flex flex-col gap-1">
                  <Link href={`/products/${row.productId}`} className="font-semibold text-ink hover:text-primary hover:underline">
                    {row.name}
                  </Link>
                  <span className="text-xs text-black/45">
                    Last sold {row.lastSoldAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              </td>
              <td className="px-3 py-3 text-right text-sm">{row.qtySold}</td>
              <td className="px-3 py-3 text-right text-sm">{formatMoney(row.averageSellPricePence, business.currency)}</td>
              <td className="px-3 py-3 text-right text-sm">{formatMoney(row.averageCostPricePence, business.currency)}</td>
              <td className="px-3 py-3 text-right text-sm">{formatMoney(row.revenuePence, business.currency)}</td>
              <td className="px-3 py-3 text-right text-sm">{formatMoney(row.costPence, business.currency)}</td>
              <td className={`px-3 py-3 text-right text-sm font-semibold ${row.profitPence < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {formatMoney(row.profitPence, business.currency)}
              </td>
              <td className={`px-3 py-3 text-right text-sm font-semibold ${row.belowTargetMargin ? 'text-amber-700' : 'text-emerald-700'}`}>
                {formatMarginPercent(row.marginPercent)}
              </td>
              <td className="px-3 py-3 text-right text-sm">{formatMarginPercent(row.effectiveThresholdPercent)}</td>
              <td className="px-3 py-3 text-right text-sm">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${marginBadgeClass(row)}`}>
                  {row.belowCost ? 'Below cost' : row.belowTargetMargin ? 'Below target' : 'Healthy'}
                </span>
              </td>
            </tr>
          ))}
          {filteredRows.length === 0 ? (
            <ReportTableEmptyRow
              colSpan={10}
              message={currentView === 'all' ? 'No sold products found for this date range.' : `No products found for ${viewLabel.toLowerCase()} in this date range.`}
            />
          ) : null}
        </tbody>
      </ReportTableCard>

      {currentView === 'all' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card p-4">
            <ReportSectionHeader
              title="Top Profit Contributors"
              subtitle="Products generating the most profit"
              titleClassName="text-emerald-700"
            />
            <div className="mt-4 space-y-3">
              {topPerformers.map((product) => (
                <div key={product.productId} className="flex items-center justify-between rounded-xl bg-emerald-50 p-3">
                  <div>
                    <div className="font-semibold">{product.name}</div>
                    <div className="text-xs text-black/50">
                      {product.qtySold} sold · {formatMoney(product.revenuePence, business.currency)} revenue
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-700">{formatMoney(product.profitPence, business.currency)}</div>
                    <div className="text-xs text-emerald-600">{formatMarginPercent(product.marginPercent)} margin</div>
                  </div>
                </div>
              ))}
              {topPerformers.length === 0 ? <div className="py-4 text-center text-sm text-black/50">No sales data yet</div> : null}
            </div>
          </div>

          <div className="card p-4">
            <ReportSectionHeader
              title="Lowest Margin Products"
              subtitle="These items need the fastest pricing or buying review"
              titleClassName="text-amber-700"
            />
            <div className="mt-4 space-y-3">
              {lowMarginProducts.map((product) => (
                <div key={product.productId} className="flex items-center justify-between rounded-xl bg-amber-50 p-3">
                  <div>
                    <div className="font-semibold">{product.name}</div>
                    <div className="text-xs text-black/50">
                      {product.qtySold} sold · {formatMoney(product.revenuePence, business.currency)} revenue
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${product.profitPence < 0 ? 'text-rose-700' : 'text-amber-700'}`}>
                      {formatMoney(product.profitPence, business.currency)}
                    </div>
                    <div className={`text-xs ${product.belowCost ? 'text-rose-600' : 'text-amber-600'}`}>
                      {formatMarginPercent(product.marginPercent)} margin vs {formatMarginPercent(product.effectiveThresholdPercent)} target
                    </div>
                  </div>
                </div>
              ))}
              {lowMarginProducts.length === 0 ? <div className="py-4 text-center text-sm text-black/50">No sales data yet</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
