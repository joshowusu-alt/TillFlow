import { SalesMixChart } from '@/components/reports/charts/ReportVisuals';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import DownloadLink from '@/components/DownloadLink';
import StatCard from '@/components/StatCard';
import ReportFilterCard from '@/components/reports/ReportFilterCard';
import ReportSectionHeader from '@/components/reports/ReportSectionHeader';
import type { ReactNode } from 'react';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatMoney } from '@/lib/format';
import { resolveSelectableReportDateRange } from '@/lib/reports/date-parsing';
import { getSupplierSalesReport } from '@/lib/reports/supplier-sales';
import { prisma } from '@/lib/prisma';
import { listProductDivisions } from '@/lib/services/product-classification';

export const dynamic = 'force-dynamic';

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'This week' },
  { value: 'mtd', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'ytd', label: 'This year' },
  { value: 'custom', label: 'Custom' },
] as const;

type ReportFilters = { period?: string; from?: string; to?: string; supplierId?: string; storeId?: string; categoryId?: string; divisionId?: string; groupId?: string };
function buildHref(params: ReportFilters) {
  const p = new URLSearchParams();
  if (params.period) p.set('period', params.period);
  if (params.from) p.set('from', params.from);
  if (params.to) p.set('to', params.to);
  if (params.supplierId) p.set('supplierId', params.supplierId);
  for(const key of ['storeId','categoryId','divisionId','groupId'] as const) if(params[key])p.set(key,params[key]!);
  const qs = p.toString();
  return `/reports/sales-by-supplier${qs ? `?${qs}` : ''}`;
}

function Figure({ label, value }: { label: string; value: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-600">{label}</dt><dd className="mt-1 break-words font-semibold tabular-nums [overflow-wrap:anywhere]">{value}</dd></div>;
}

function SupplierSaleCard({ name, href, sales, netSales, currency, children, action }: {
  name: string; href?: string; sales: ReactNode; netSales: number | null; currency: string; children?: ReactNode; action?: ReactNode;
}) {
  return <article data-supplier-sale-row className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 className="min-w-0 break-words text-base font-semibold text-ink [overflow-wrap:anywhere]">{href ? <Link href={href} className="hover:underline">{name}</Link> : name}</h3>
      {action}
    </div>
    <dl className="mt-2 grid min-w-0 grid-cols-2 gap-3 text-base" data-supplier-primary-figures>
      <Figure label="Sales" value={sales} />
      <Figure label="Net sales" value={netSales === null ? '—' : formatMoney(netSales, currency)} />
    </dl>
    {children ? <details className="mt-2 border-t border-slate-100 text-sm"><summary className="cursor-pointer py-2 font-semibold text-accent">More figures</summary><dl className="grid min-w-0 grid-cols-2 gap-3 pb-2">{children}</dl></details> : null}
  </article>;
}

function ProfitFigures({row,currency}:{row:{costPence:number|null;profitPence:number|null;marginPercent:number|null};currency:string}){
  return <><Figure label="Product costs" value={row.costPence===null?'Incomplete costs':formatMoney(row.costPence,currency)}/><Figure label="Profit before running costs" value={row.profitPence===null?'—':formatMoney(row.profitPence,currency)}/><Figure label="Profit share of net sales" value={row.marginPercent===null?'—':`${row.marginPercent.toFixed(1)}%`}/></>;
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

export default async function SalesBySupplierPage(
  props: {
    searchParams?: Promise<ReportFilters>;
  }
) {
  const searchParams = await props.searchParams;
  const opened = await openLiveReport({
    surfaceId: 'sales_by_supplier',
    search: searchParams,
    range: ({ timezone, now }) => {
      const resolved = resolveSelectableReportDateRange(searchParams, 'mtd', now, timezone);
      return { fromLocalDate: resolved.fromInputValue, toLocalDate: resolved.toInputValue, preset: 'CUSTOM' };
    },
  });
  if (!opened.ok) return opened.denial;
  const { business } = opened;
  if (opened.branch.kind !== 'stores') notFound();

  const { start, end, fromInputValue, toInputValue, periodInputValue, isCustomRange } =
    resolveSelectableReportDateRange(
      opened.decision.appliedRange
        ? { from: opened.decision.appliedRange.fromLocalDate, to: opened.decision.appliedRange.toLocalDate }
        : searchParams,
      'mtd',
      new Date(),
      business.timezone,
    );

  const supplierId = searchParams?.supplierId?.trim() || undefined;
  const hierarchy = {categoryId:searchParams?.categoryId,divisionId:searchParams?.divisionId,groupId:searchParams?.groupId};
  const reportHref=(params:ReportFilters)=>buildHref({...hierarchy,storeId:searchParams?.storeId,...params});

  // When drilling into a supplier, also fetch its name for the header
  const [report, drilledSupplier, categories, divisions] = await Promise.all([
    getSupplierSalesReport(business.id, { start, end, supplierId, storeIds: opened.branch.storeIds,...hierarchy }),
    supplierId
      ? prisma.supplier.findFirst({
          where: { id: supplierId, businessId: business.id },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    prisma.category.findMany({where:{businessId:business.id},select:{id:true,name:true},orderBy:{name:'asc'}}),
    listProductDivisions(business.id),
  ]);

  const exportHref = reportHref({ period: periodInputValue, from: fromInputValue, to: toInputValue, supplierId })
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
      <ReportsDestinationHead
        title="Sales by supplier"
        periodLabel={
          isDrillDown
            ? `Sales of products linked to ${drilledSupplier!.name}.`
            : 'See how much you sold from each supplier’s products.'
        }
        actions={isDrillDown ? (
          <Link href={reportHref({ period: periodInputValue, from: fromInputValue, to: toInputValue })} className="btn-secondary justify-center text-sm">
            ← All suppliers
          </Link>
        ) : undefined}
      />

      <section className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-4 text-sm leading-relaxed text-blue-900 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p>This shows sales of each supplier’s products. It is not what you owe them. See Supplier balances for that.</p>
            <details className="mt-2"><summary className="cursor-pointer font-semibold text-accent">How these figures work</summary>
              <p className="mt-2">Sales use each product’s main supplier, not the supplier of the exact item sold. Changing the main supplier also moves earlier sales to that supplier.</p>
              <p className="mt-1">Returned and cancelled sales are excluded. Net sales exclude tax and include discounts. Product costs are recorded at the time of sale; missing costs leave profit incomplete. Profit before running costs is not necessarily money your business keeps.</p>
            </details>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link href="/payments/supplier-aging" className="btn-secondary text-xs">
              Supplier balances
            </Link>
            <Link href="/payments/supplier-payments" className="btn-ghost text-xs">
              Supplier payments
            </Link>
          </div>
        </div>
      </section>

      {/* Filter card */}
      <ReportFilterCard
        columnsClassName="min-w-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 [&>*]:min-w-0 [&_input]:w-full [&_input]:min-w-0 [&_input]:max-w-full [&_select]:w-full [&_select]:min-w-0 [&_select]:max-w-full"
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
          <label className="label" htmlFor="supplier-period">Period</label>
          <select className="input" id="supplier-period" name="period" defaultValue={periodInputValue}>
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {isCustomRange ? (
          <>
            <div>
              <label className="label" htmlFor="supplier-from">From</label>
              <input className="input w-full min-w-0 max-w-full" id="supplier-from" type="date" name="from" defaultValue={fromInputValue} />
            </div>
            <div>
              <label className="label" htmlFor="supplier-to">To</label>
              <input className="input w-full min-w-0 max-w-full" id="supplier-to" type="date" name="to" defaultValue={toInputValue} />
            </div>
          </>
        ) : null}
        {supplierId ? <input type="hidden" name="supplierId" value={supplierId} /> : null}
        {searchParams?.storeId?<input type="hidden" name="storeId" value={searchParams.storeId}/>:null}
        <label className="label">Category<select className="input" name="categoryId" defaultValue={hierarchy.categoryId??''}><option value="">All categories</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        {divisions.length?<><label className="label">Division<select className="input" name="divisionId" defaultValue={hierarchy.divisionId??''}><option value="">All divisions</option>{divisions.map(division=><option key={division.id} value={division.id}>{categories.find(category=>category.id===division.categoryId)?.name} / {division.name}</option>)}</select></label><label className="label">Group<select className="input" name="groupId" defaultValue={hierarchy.groupId??''}><option value="">All groups</option>{divisions.flatMap(division=>division.groups.map(group=><option key={group.id} value={group.id}>{division.name} / {group.name}</option>))}</select></label></>:null}
      </ReportFilterCard>

      {/* Summary cards — not shown in drill-down mode */}
      {!isDrillDown ? (
        <div className="grid min-w-0 grid-cols-2 gap-3 [&>*:first-child]:col-span-2 [&>*:last-child]:col-span-2 lg:grid-cols-4 lg:[&>*:first-child]:col-span-1 lg:[&>*:last-child]:col-span-1">
          <StatCard
            label="Sales of supplier products"
            value={formatMoney(report.totalRevenuePence, business.currency)}
            tone="accent"
          />
          <StatCard
            label="Items sold"
            value={report.totalQtyBase.toLocaleString()}
          />
          <StatCard
            label="Suppliers with sales"
            value={report.suppliersWithSalesCount.toLocaleString()}
          />
          <StatCard
            label="Top supplier"
            value={report.topSupplierName ?? '—'}
            tone={report.topSupplierName ? 'success' : 'default'}
            helper="Highest sales in this period"
          />
        </div>
      ) : null}

      {/* Drill-down: product breakdown for a specific supplier */}
      {!isDrillDown ? <SalesMixChart title="Share of supplier sales" supplierView currency={business.currency} rows={report.rows.map(row => ({ name: row.supplierName, value: row.totalRevenuePence }))} /> : null}
      {isDrillDown ? (
        <div className="space-y-4">
          {/* Supplier summary */}
          <div className="card grid gap-4 p-5 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-black/40">Sales</div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatMoney(drilledRow?.totalRevenuePence ?? 0, business.currency)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-black/40">Items sold</div>
              <div className="text-2xl font-semibold tabular-nums">
                {(drilledRow?.totalQtyBase ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-black/40">Number of sales</div>
              <div className="text-2xl font-semibold tabular-nums">
                {(drilledRow?.totalSalesCount ?? 0).toLocaleString()}
              </div>
            </div>
          </div>

          {drilledHasNoLinkedProducts ? (
            <ReportSetupEmptyState
              title={`No products linked to ${drilledSupplier!.name}`}
              body={`Choose ${drilledSupplier!.name} as the main supplier on the products they supply. This groups sales, not money owed.`}
              actions={[
                { label: 'Manage products', href: '/products', primary: true },
                { label: 'View supplier profile', href: `/suppliers/${supplierId}` },
              ]}
            />
          ) : null}

          {drilledHasLinkedProductsWithoutSales ? (
            <ReportSetupEmptyState
              title="No sales for linked products in this period"
              body={`Products are linked to ${drilledSupplier!.name}, but none were sold in these dates.`}
              actions={[
                { label: 'Change period', href: reportHref({ period: 'mtd', supplierId }) },
                { label: 'View linked products', href: `/suppliers/${supplierId}#products-supplied`, primary: true },
              ]}
            />
          ) : null}

          {/* Product table */}
          <h2 className="text-lg font-semibold">Linked products sold</h2>
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {drilledRow && drilledRow.products.length > 0 ? drilledRow.products.map(p => (
              <SupplierSaleCard key={p.productId} name={p.productName} href={`/products/${p.productId}`} sales={formatMoney(p.revenuePence, business.currency)} netSales={p.netRevenuePence} currency={business.currency}>
                <Figure label="Product code" value={p.sku ?? '—'}/>
                <Figure label="Items sold" value={p.qtyBase.toLocaleString()}/>
                <Figure label="Number of sales" value={p.salesCount.toLocaleString()}/>
                <ProfitFigures row={p} currency={business.currency}/>
              </SupplierSaleCard>
            )) : <p className="text-sm text-slate-600">{drilledRow && drilledRow.linkedProductCount > 0 ? 'No sales for linked products in this period.' : `No products are linked to ${drilledSupplier?.name}.`}</p>}
          </div>

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
            title="Supplier sales"
            subtitle="Based on each product’s main supplier. This is not money owed."
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
              title="No supplier sales yet"
              body="Choose a main supplier for your products to see their sales here. This is not money owed."
              actions={[
                { label: 'Manage products', href: '/products', primary: true },
                { label: 'View suppliers', href: '/suppliers' },
              ]}
            />
          ) : null}
          {hasLinkedProductsWithoutSales ? (
            <ReportSetupEmptyState
              title="No sales for linked products in this period"
              body="No products linked to suppliers were sold in these dates. See Supplier balances for what you owe."
              actions={[
                { label: 'Change period', href: reportHref({ period: 'mtd' }) },
                { label: 'Manage products', href: '/products', primary: true },
              ]}
            />
          ) : null}
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.unallocatedSalesDifferencePence !== 0 ? <SupplierSaleCard name={report.unallocatedSalesDifferenceLabel} sales={formatMoney(report.unallocatedSalesDifferencePence, business.currency)} netSales={null} currency={business.currency}/> : null}
            {report.rows.map(row => (
              <SupplierSaleCard key={row.supplierId} name={row.supplierName} href={`/suppliers/${row.supplierId}`}
                sales={row.totalRevenuePence > 0 ? formatMoney(row.totalRevenuePence, business.currency) : '—'} netSales={row.netRevenuePence} currency={business.currency}
                action={<Link href={reportHref({ period: periodInputValue, from: fromInputValue, to: toInputValue, supplierId: row.supplierId })}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-2" aria-label={`View products for ${row.supplierName}`}>View products</Link>}>
                <Figure label="Linked products" value={row.linkedProductCount}/>
                <Figure label="Items sold" value={row.totalQtyBase > 0 ? row.totalQtyBase.toLocaleString() : '—'}/>
                <Figure label="Number of sales" value={row.totalSalesCount > 0 ? row.totalSalesCount.toLocaleString() : '—'}/>
                <Figure label="Average sale value" value={row.avgSaleValuePence > 0 ? formatMoney(row.avgSaleValuePence, business.currency) : '—'}/>
                <ProfitFigures row={row} currency={business.currency}/>
              </SupplierSaleCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
