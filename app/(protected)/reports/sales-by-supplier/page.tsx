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
import { getSupplierSalesReport } from '@/lib/reports/supplier-sales';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'This week' },
  { value: 'mtd', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'ytd', label: 'This year' },
  { value: 'custom', label: 'Custom' },
] as const;

function buildHref(params: { period?: string; from?: string; to?: string; supplierId?: string }) {
  const p = new URLSearchParams();
  if (params.period) p.set('period', params.period);
  if (params.from) p.set('from', params.from);
  if (params.to) p.set('to', params.to);
  if (params.supplierId) p.set('supplierId', params.supplierId);
  const qs = p.toString();
  return `/reports/sales-by-supplier${qs ? `?${qs}` : ''}`;
}

function ReportSetupEmptyState({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions: Array<{ label: string; href: string; primary?: boolean }>;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-white px-5 py-5">
      <div className="max-w-3xl">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-black/55">{body}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Link
            key={`${action.href}-${action.label}`}
            href={action.href}
            className={`${action.primary ? 'btn-primary' : 'btn-secondary'} text-sm`}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function SalesBySupplierPage({
  searchParams,
}: {
  searchParams?: { period?: string; from?: string; to?: string; supplierId?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business) return <div className="card p-6">Business not found.</div>;

  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
  );

  if (!features.advancedReports) {
    return (
      <AdvancedModeNotice
        title="Sales by Linked Supplier is available on Growth and Pro"
        description="Supplier-linked product sales reporting is unlocked on businesses provisioned for Growth or Pro."
        featureName="Sales by Linked Supplier"
        minimumPlan="GROWTH"
      />
    );
  }

  const { start, end, fromInputValue, toInputValue, periodInputValue, isCustomRange } =
    resolveSelectableReportDateRange(searchParams, 'mtd');

  const supplierId = searchParams?.supplierId?.trim() || undefined;

  // When drilling into a supplier, also fetch its name for the header
  const [report, drilledSupplier] = await Promise.all([
    getSupplierSalesReport(business.id, { start, end, supplierId }),
    supplierId
      ? prisma.supplier.findFirst({
          where: { id: supplierId, businessId: business.id },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);

  const exportHref = buildHref({ period: periodInputValue, from: fromInputValue, to: toInputValue, supplierId })
    .replace('/reports/sales-by-supplier', '/reports/sales-by-supplier/export');

  const isDrillDown = Boolean(supplierId && drilledSupplier);
  const drilledRow = isDrillDown ? report.rows.find((r) => r.supplierId === supplierId) : null;
  const hasSupplierLinks = report.rows.length > 0;
  const hasLinkedProductsWithoutSales = hasSupplierLinks && report.totalRevenuePence === 0;
  const drilledHasNoLinkedProducts = isDrillDown && (!drilledRow || drilledRow.linkedProductCount === 0);
  const drilledHasLinkedProductsWithoutSales =
    isDrillDown && Boolean(drilledRow && drilledRow.linkedProductCount > 0 && drilledRow.products.length === 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales by Linked Supplier"
        subtitle={
          isDrillDown
            ? `Product sales under the preferred supplier link for ${drilledSupplier!.name}.`
            : 'Understand sales performance by the preferred supplier linked to each product.'
        }
        secondaryCta={
          isDrillDown
            ? {
                label: '← All suppliers',
                href: buildHref({ period: periodInputValue, from: fromInputValue, to: toInputValue }),
              }
            : undefined
        }
      />

      <section className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-4 text-sm leading-relaxed text-blue-900 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="font-semibold">Based on preferred supplier links on products.</p>
            <p className="mt-1">
              This is a sales performance view, not supplier debt. It does not prove which supplier supplied the exact
              item sold, and it does not track exact stock batch origin.
            </p>
            <p className="mt-1">
              Returned and void sales are excluded. Supplier sales performance is separate from supplier purchases,
              balances, and payments.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link href="/payments/supplier-aging" className="btn-secondary text-xs">
              View supplier payables
            </Link>
            <Link href="/payments/supplier-payments" className="btn-ghost text-xs">
              Supplier payments
            </Link>
          </div>
        </div>
      </section>

      {/* Filter card */}
      <ReportFilterCard
        columnsClassName={`grid gap-3 sm:grid-cols-${isCustomRange ? '5' : '3'}`}
        actions={
          <DownloadLink
            href={exportHref}
            fallbackFilename={`supplier-sales-${fromInputValue}-to-${toInputValue}.csv`}
            className="btn-secondary text-sm"
          >
            Download CSV
          </DownloadLink>
        }
      >
        <div>
          <label className="label">Period</label>
          <select className="input" name="period" defaultValue={periodInputValue}>
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {isCustomRange ? (
          <>
            <div>
              <label className="label">From</label>
              <input className="input" type="date" name="from" defaultValue={fromInputValue} />
            </div>
            <div>
              <label className="label">To</label>
              <input className="input" type="date" name="to" defaultValue={toInputValue} />
            </div>
          </>
        ) : null}
        {supplierId ? <input type="hidden" name="supplierId" value={supplierId} /> : null}
      </ReportFilterCard>

      {/* Summary cards — not shown in drill-down mode */}
      {!isDrillDown ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Supplier-linked sales value"
            value={formatMoney(report.totalRevenuePence, business.currency)}
            tone="accent"
            helper="From products linked to any supplier"
          />
          <StatCard
            label="Quantity sold"
            value={report.totalQtyBase.toLocaleString()}
            helper="Sum of all base-unit quantities"
          />
          <StatCard
            label="Suppliers with sales"
            value={report.suppliersWithSalesCount.toLocaleString()}
            helper="Suppliers with revenue in this period"
          />
          <StatCard
            label="Top supplier"
            value={report.topSupplierName ?? '—'}
            tone={report.topSupplierName ? 'success' : 'default'}
            helper="By revenue in this period"
          />
        </div>
      ) : null}

      {/* Drill-down: product breakdown for a specific supplier */}
      {isDrillDown ? (
        <div className="space-y-4">
          {/* Supplier summary */}
          <div className="card grid gap-4 p-5 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-black/40">Revenue</div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatMoney(drilledRow?.totalRevenuePence ?? 0, business.currency)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-black/40">Quantity sold</div>
              <div className="text-2xl font-semibold tabular-nums">
                {(drilledRow?.totalQtyBase ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-black/40">Sales</div>
              <div className="text-2xl font-semibold tabular-nums">
                {(drilledRow?.totalSalesCount ?? 0).toLocaleString()}
              </div>
            </div>
          </div>

          {drilledHasNoLinkedProducts ? (
            <ReportSetupEmptyState
              title={`No products linked to ${drilledSupplier!.name}`}
              body={`To use this report, link products to ${drilledSupplier!.name} as their preferred supplier. TillFlow will group sales by those product links; this does not create supplier debt or track exact stock batches.`}
              actions={[
                { label: 'Manage products', href: '/products', primary: true },
                { label: 'View supplier profile', href: `/suppliers/${supplierId}` },
              ]}
            />
          ) : null}

          {drilledHasLinkedProductsWithoutSales ? (
            <ReportSetupEmptyState
              title="No sales for linked products in this period"
              body={`Products are linked to ${drilledSupplier!.name}, but none were sold in the selected date range. This report only shows sales performance for linked products, not purchases or supplier balances.`}
              actions={[
                { label: 'Change period', href: buildHref({ period: 'mtd', supplierId }) },
                { label: 'View linked products', href: `/suppliers/${supplierId}#products-supplied`, primary: true },
              ]}
            />
          ) : null}

          {/* Product table */}
          <ReportTableCard title="Linked products sold">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Quantity sold</th>
                <th>Sales value</th>
                <th>Sales count</th>
              </tr>
            </thead>
            <tbody>
              {drilledRow && drilledRow.products.length > 0 ? (
                drilledRow.products.map((p) => (
                  <tr key={p.productId} className="rounded-xl bg-white">
                    <td className="px-3 py-3 text-sm font-semibold">
                      <Link href={`/products/${p.productId}`} className="hover:underline">
                        {p.productName}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-sm text-black/60">{p.sku ?? '—'}</td>
                    <td className="px-3 py-3 text-sm tabular-nums">{p.qtyBase.toLocaleString()}</td>
                    <td className="px-3 py-3 text-sm font-semibold tabular-nums">
                      {formatMoney(p.revenuePence, business.currency)}
                    </td>
                    <td className="px-3 py-3 text-sm tabular-nums">{p.salesCount.toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <ReportTableEmptyRow
                  colSpan={5}
                  message={
                    drilledRow && drilledRow.linkedProductCount > 0
                      ? `No sales for linked products in this period.`
                      : `No products are linked to ${drilledSupplier?.name}.`
                  }
                />
              )}
            </tbody>
          </ReportTableCard>

          <Link
            href={`/suppliers/${supplierId}`}
            className="btn-ghost text-sm"
          >
            ← View supplier profile
          </Link>
        </div>
      ) : (
        /* Supplier table */
        <div className="space-y-4">
          <ReportSectionHeader
            title="Supplier-linked sales"
            subtitle="Products are attributed to the supplier set as preferred supplier. This is not supplier debt."
            trailing={
              <DownloadLink
                href={exportHref}
                fallbackFilename={`supplier-sales-${fromInputValue}-to-${toInputValue}.csv`}
                className="btn-ghost text-xs"
              >
                CSV
              </DownloadLink>
            }
          />
          {!hasSupplierLinks ? (
            <ReportSetupEmptyState
              title="No supplier-linked sales yet"
              body="To use this report, link products to their preferred supplier. TillFlow will group sales by those product links; this does not create supplier debt or track exact stock batches."
              actions={[
                { label: 'Manage products', href: '/products', primary: true },
                { label: 'View suppliers', href: '/suppliers' },
              ]}
            />
          ) : null}
          {hasLinkedProductsWithoutSales ? (
            <ReportSetupEmptyState
              title="No sales for linked products in this period"
              body="Supplier links exist, but no linked products were sold in the selected date range. Use supplier payables for what you owe suppliers."
              actions={[
                { label: 'Change period', href: buildHref({ period: 'mtd' }) },
                { label: 'Manage products', href: '/products', primary: true },
              ]}
            />
          ) : null}
          <ReportTableCard>
            <thead>
              <tr>
                <th>Supplier</th>
                <th className="hidden sm:table-cell">Products linked</th>
                <th>Sales value</th>
                <th className="hidden lg:table-cell">Quantity sold</th>
                <th className="hidden lg:table-cell">Sales count</th>
                <th className="hidden xl:table-cell">Average sale value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {report.rows.length > 0 ? (
                report.rows.map((row) => (
                  <tr key={row.supplierId} className="rounded-xl bg-white">
                    <td className="px-3 py-3 text-sm font-semibold">
                      <Link href={`/suppliers/${row.supplierId}`} className="hover:underline">
                        {row.supplierName}
                      </Link>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-3 text-sm text-black/60">
                      {row.linkedProductCount}
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold tabular-nums">
                      {row.totalRevenuePence > 0
                        ? formatMoney(row.totalRevenuePence, business.currency)
                        : <span className="text-black/30">—</span>}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-sm tabular-nums">
                      {row.totalQtyBase > 0 ? row.totalQtyBase.toLocaleString() : <span className="text-black/30">—</span>}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-sm tabular-nums">
                      {row.totalSalesCount > 0 ? row.totalSalesCount.toLocaleString() : <span className="text-black/30">—</span>}
                    </td>
                    <td className="hidden xl:table-cell px-3 py-3 text-sm tabular-nums text-black/60">
                      {row.avgSaleValuePence > 0 ? formatMoney(row.avgSaleValuePence, business.currency) : <span className="text-black/30">—</span>}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <Link
                        href={buildHref({
                          period: periodInputValue,
                          from: fromInputValue,
                          to: toInputValue,
                          supplierId: row.supplierId,
                        })}
                        className="btn-ghost text-xs whitespace-nowrap"
                      >
                        View products
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <ReportTableEmptyRow
                  colSpan={7}
                  message="Link products to their preferred supplier to start this sales performance report."
                />
              )}
            </tbody>
          </ReportTableCard>
        </div>
      )}
    </div>
  );
}
