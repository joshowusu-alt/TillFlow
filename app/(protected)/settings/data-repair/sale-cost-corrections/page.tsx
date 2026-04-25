import PageHeader from '@/components/PageHeader';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportTableCard, { ReportTableEmptyRow } from '@/components/reports/ReportTableCard';
import StatCard from '@/components/StatCard';
import { requireBusiness } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import { resolveSelectableReportDateRange } from '@/lib/reports/date-parsing';
import { correctTargetedSaleCostsAction } from '@/app/actions/sale-cost-corrections';
import { buildHistoricalSaleLineCandidate } from '@/lib/services/targeted-sale-cost-corrections';

const periodOptions = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '365d', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom dates' },
] as const;

const statusOptions = [
  { value: 'below-cost', label: 'Selling below cost' },
  { value: 'all', label: 'All sales lines' },
] as const;

function resolveStatus(value: string | undefined) {
  return value === 'all' ? 'all' : 'below-cost';
}

export default async function SaleCostCorrectionsPage({
  searchParams,
}: {
  searchParams?: {
    q?: string;
    status?: string;
    period?: string;
    from?: string;
    to?: string;
    error?: string;
    updated?: string;
    invoices?: string;
  };
}) {
  const { business } = await requireBusiness(['OWNER']);
  if (!business) return <div className="card p-6">Business not found.</div>;

  const q = searchParams?.q?.trim() ?? '';
  const status = resolveStatus(searchParams?.status);
  const { start, end, fromInputValue, toInputValue, periodInputValue } = resolveSelectableReportDateRange(searchParams, '30d');
  const shouldLimitPreview = status === 'all';

  const rawLines = await prisma.salesInvoiceLine.findMany({
    where: {
      AND: [
        {
          salesInvoice: {
            businessId: business.id,
            createdAt: { gte: start, lte: end },
            paymentStatus: { notIn: ['RETURNED', 'VOID'] },
          },
        },
        ...(q
          ? [{
              OR: [
                { product: { name: { contains: q } } },
                { product: { sku: { contains: q } } },
                { salesInvoice: { transactionNumber: { contains: q } } },
                { salesInvoiceId: { contains: q } },
              ],
            }]
          : []),
      ],
    },
    select: {
      id: true,
      salesInvoiceId: true,
      qtyInUnit: true,
      qtyBase: true,
      unitPricePence: true,
      lineSubtotalPence: true,
      lineTotalPence: true,
      lineCostPence: true,
      productId: true,
      salesInvoice: {
        select: {
          createdAt: true,
          transactionNumber: true,
        },
      },
      product: {
        select: {
          name: true,
          sku: true,
          defaultCostBasePence: true,
          productUnits: {
            select: {
              isBaseUnit: true,
              conversionToBase: true,
              defaultCostPence: true,
            },
          },
        },
      },
      unit: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { salesInvoice: { createdAt: 'desc' } },
    ...(shouldLimitPreview ? { take: 150 } : {}),
  });

  // Fetch the SALE stock movement unit cost for every invoice+product pair in view.
  // This gives a stable correction reference: after a correction both lineCostPence and
  // the movement cost are aligned, so changing the product's defaultCostBasePence later will
  // not re-flag already-corrected lines (preventing cost drift).
  const invoiceIds = [...new Set(rawLines.map((l) => l.salesInvoiceId))];
  const productIds = [...new Set(rawLines.map((l) => l.productId))];
  const movementRows = invoiceIds.length > 0
    ? await prisma.stockMovement.findMany({
        where: {
          referenceType: 'SALES_INVOICE',
          referenceId: { in: invoiceIds },
          productId: { in: productIds },
          type: 'SALE',
          unitCostBasePence: { gt: 0 },
        },
        select: {
          referenceId: true,
          productId: true,
          unitCostBasePence: true,
        },
      })
    : [];

  // Map "invoiceId:productId" → unitCostBasePence (keep first found per pair)
  const movementCostMap = new Map<string, number>();
  for (const m of movementRows) {
    const cost = m.unitCostBasePence ?? 0;
    if (cost > 0) {
      const key = `${m.referenceId}:${m.productId}`;
      if (!movementCostMap.has(key)) {
        movementCostMap.set(key, cost);
      }
    }
  }

  const allCandidates = rawLines.map((line) =>
    buildHistoricalSaleLineCandidate({
      id: line.id,
      salesInvoiceId: line.salesInvoiceId,
      transactionNumber: line.salesInvoice.transactionNumber ?? null,
      createdAt: line.salesInvoice.createdAt,
      productId: line.productId,
      productName: line.product.name,
      sku: line.product.sku ?? null,
      unitName: line.unit.name,
      qtyInUnit: line.qtyInUnit,
      qtyBase: line.qtyBase,
      unitPricePence: line.unitPricePence,
      lineSubtotalPence: line.lineSubtotalPence,
      lineTotalPence: line.lineTotalPence,
      lineCostPence: line.lineCostPence,
      currentProductCostBasePence: line.product.defaultCostBasePence,
      movementUnitCostBasePence: movementCostMap.get(`${line.salesInvoiceId}:${line.productId}`) ?? null,
      productUnits: line.product.productUnits,
    }),
  );

  const candidates = status === 'below-cost'
    ? allCandidates.filter((line) => line.belowCostBefore)
    : allCandidates;

  const changedCandidateCount = candidates.filter((line) => line.needsCorrection).length;
  const belowCostCount = candidates.filter((line) => line.belowCostBefore).length;
  const wouldRecoverCount = candidates.filter((line) => line.belowCostBefore && !line.belowCostAfter && line.needsCorrection).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Targeted Sale Cost Corrections"
        subtitle="Correct only the affected historical sales lines after fixing the product setup — without rewriting every sale."
        description="Use this screen only when the customer receipt totals were correct and the problem was the historical cost setup behind the line. The correction applies the product's current base cost to the selected historical sale lines and recalculates invoice gross profit."
        secondaryCta={{ label: '← Data Repair', href: '/settings/data-repair' }}
      />

      {searchParams?.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {searchParams.error}
        </div>
      ) : null}

      {searchParams?.updated ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Corrected {searchParams.updated} sale line{searchParams.updated === '1' ? '' : 's'} across {searchParams.invoices ?? '0'} invoice{searchParams.invoices === '1' ? '' : 's'}. Refresh any open report tabs to see the updated margin history.
        </div>
      ) : null}

      <div className="rounded-2xl border border-amber-200 bg-[linear-gradient(180deg,rgba(251,191,36,0.12),rgba(255,255,255,1))] p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-black">Use this only for the truly affected sales</h2>
        <p className="mt-1 text-sm text-black/65">
          Good use case: the receipt total was right, but the historical line cost became misleading because of the old base cost setup. Do not use this to quietly rewrite genuine pricing mistakes — those should still be amended or voided properly.
        </p>
      </div>

      <ReportFilterCard
        columnsClassName="xl:grid-cols-7"
        submitLabel="Find affected lines"
        submitTone="primary"
        actions={<a className="btn-secondary" href="/settings/data-repair/sale-cost-corrections">Reset</a>}
      >
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-black/55">
          Search
          <input
            className="input mt-1.5"
            defaultValue={q}
            name="q"
            placeholder="Receipt number, invoice id, product, or SKU"
            type="search"
          />
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-black/55">
          View
          <select className="input mt-1.5" defaultValue={status} name="status">
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-black/55">
          Quick period
          <select className="input mt-1.5" defaultValue={periodInputValue} name="period">
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-black/55">
          From
          <input className="input mt-1.5" defaultValue={fromInputValue} name="from" type="date" />
        </label>

        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-black/55">
          To
          <input className="input mt-1.5" defaultValue={toInputValue} name="to" type="date" />
        </label>
      </ReportFilterCard>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Loaded lines" value={String(candidates.length)} tone="accent" helper="Filtered historical sale lines currently in view." />
        <StatCard label="Below cost now" value={String(belowCostCount)} tone={belowCostCount > 0 ? 'danger' : 'success'} helper="Lines currently reporting a negative gross profit." />
        <StatCard label="Would recover" value={String(wouldRecoverCount)} tone={wouldRecoverCount > 0 ? 'success' : 'default'} helper="Below-cost lines that would move out of loss if current setup cost is applied." />
      </div>

      <form action={correctTargetedSaleCostsAction} className="space-y-4">
        <input type="hidden" name="q" value={q} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="period" value={periodInputValue} />
        <input type="hidden" name="from" value={fromInputValue} />
        <input type="hidden" name="to" value={toInputValue} />

        <ReportTableCard title="Select the affected sale lines only">
          <thead>
            <tr>
              <th className="text-left">Pick</th>
              <th className="text-left">Sale line</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Sell / base</th>
              <th className="text-right">Stored cost / base</th>
              <th className="text-right">Correction cost / base</th>
              <th className="text-right">Profit now</th>
              <th className="text-right">Profit if corrected</th>
              <th className="text-right">Impact</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((line) => {
              const sourceLabel = line.correctionCostSource === 'package-cost-repair'
                ? 'Pack cost stored as base'
                : line.correctionCostSource === 'sale-movement'
                  ? 'From sale movement'
                  : 'From product default';
              const impactTone = !line.needsCorrection
                ? 'bg-slate-100 text-slate-600'
                : line.belowCostBefore && !line.belowCostAfter
                  ? 'bg-emerald-100 text-emerald-700'
                  : line.profitDeltaPence > 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700';
              const impactLabel = !line.needsCorrection
                ? 'No change'
                : line.belowCostBefore && !line.belowCostAfter
                  ? 'Recovers'
                  : line.profitDeltaPence > 0
                    ? 'Improves'
                    : 'Review';

              return (
                <tr key={line.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 align-top">
                    <input
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent disabled:opacity-40"
                      disabled={!line.needsCorrection}
                      name="lineIds"
                      type="checkbox"
                      value={line.id}
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="space-y-1">
                      <div className="font-semibold text-ink">{line.productName}</div>
                      <div className="text-xs text-black/55">
                        {line.transactionNumber ?? line.salesInvoiceId.slice(0, 8)} · {formatDate(line.createdAt)}
                      </div>
                      <div className="text-xs text-black/45">
                        {line.sku ? `${line.sku} · ` : ''}{line.unitName}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-sm">{line.qtyInUnit}</td>
                  <td className="px-3 py-3 text-right text-sm">{formatMoney(line.unitPricePence, business.currency)}</td>
                  <td className="px-3 py-3 text-right text-sm">{formatMoney(line.storedUnitCostBasePence, business.currency)}</td>
                  <td className="px-3 py-3 text-right text-sm">
                    <div className="font-semibold text-accent">{formatMoney(line.correctedUnitCostBasePence, business.currency)}</div>
                    <div className="mt-1 text-[11px] font-medium text-black/45">{sourceLabel}</div>
                  </td>
                  <td className={`px-3 py-3 text-right text-sm font-semibold ${line.profitBeforePence < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {formatMoney(line.profitBeforePence, business.currency)}
                  </td>
                  <td className={`px-3 py-3 text-right text-sm font-semibold ${line.profitAfterPence < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {formatMoney(line.profitAfterPence, business.currency)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${impactTone}`}>{impactLabel}</span>
                  </td>
                </tr>
              );
            })}
            {candidates.length === 0 ? (
              <ReportTableEmptyRow colSpan={9} message="No sales lines matched these filters. Try a wider period, a different receipt number, or switch to All sales lines." />
            ) : null}
          </tbody>
        </ReportTableCard>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-black">Apply current product cost to the selected lines</h2>
            <p className="mt-1 text-sm text-black/60">
              This updates only the checked sale lines, refreshes the matching invoice gross profit, and keeps the original receipt selling price untouched.
            </p>
          </div>

          <div>
            <label className="label">Correction reason</label>
            <textarea
              className="input min-h-[110px]"
              name="reason"
              placeholder="Example: Product base cost was configured wrongly for these sales, but the receipt totals charged to customers were correct."
              required
            />
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <input className="mt-1 h-4 w-4 rounded border-amber-300 text-accent focus:ring-accent" name="confirmCorrection" type="checkbox" />
            <span>
              I confirm these selected lines are the affected ones, the customer-facing receipt totals were correct, and I only want to repair the historical cost/margin trail.
            </span>
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-black/50">
              Tip: keep your selection narrow — one product, one receipt batch, or one verified date window at a time.
            </p>
            <button className="btn-primary justify-center" type="submit">
              Correct selected sale lines
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
