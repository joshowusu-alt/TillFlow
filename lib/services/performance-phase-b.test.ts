import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Phase B: cache revalidation and dashboard performance hardening', () => {
  const revalidationSrc = read('lib/reports/cache-revalidation.ts');
  const ownerDashboardSrc = read('lib/reports/owner-dashboard.ts');
  const todayKpisSrc = read('lib/reports/today-kpis.ts');
  const tradingDashboardSrc = read('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
  const posSrc = read('app/(protected)/pos/page.tsx') + '\n' + read('app/(protected)/pos/PosBoard.tsx');
  const salesActionsSrc = read('app/actions/sales.ts');
  const paymentActionsSrc = read('app/actions/payments.ts');
  const purchaseActionsSrc = read('app/actions/purchases.ts');
  const expenseActionsSrc = read('app/actions/expenses.ts');
  const inventoryActionsSrc = read('app/actions/inventory.ts');
  const shiftActionsSrc = read('app/actions/shifts.ts');
  const productActionsSrc = read('app/actions/products.ts');
  const returnActionsSrc = read('app/actions/returns.ts');
  const momoActionsSrc = read('app/actions/mobile-money.ts');
  const schemaSrc = read('prisma/schema.prisma');
  const financialsSrc = read('lib/reports/financials.ts');
  const forecastSrc = read('lib/reports/forecast.ts');
  const customerSvcSrc = read('lib/services/customers.ts');
  const supplierSvcSrc = read('lib/services/suppliers.ts');
  const salesSvcSrc = read('lib/services/sales.ts');

  const ownerRevalidatedActions = [
    salesActionsSrc,
    paymentActionsSrc,
    purchaseActionsSrc,
    expenseActionsSrc,
    inventoryActionsSrc,
    shiftActionsSrc,
    productActionsSrc,
    returnActionsSrc,
    momoActionsSrc,
  ].join('\n');

  it('defines a narrow owner-dashboard cache revalidation helper', () => {
    expect(revalidationSrc).toContain("import { revalidateTag } from 'next/cache'");
    expect(revalidationSrc).toContain('export function revalidateOwnerDashboardCache()');
    expect(revalidationSrc).toContain("revalidateTag('owner-dashboard')");
  });

  it('owner dashboard remains cached for 60 seconds with the owner-dashboard tag', () => {
    expect(ownerDashboardSrc).toContain('unstable_cache(');
    expect(ownerDashboardSrc).toContain("'report-owner-dashboard'");
    expect(ownerDashboardSrc).toContain('revalidate: 60');
    expect(ownerDashboardSrc).toContain("tags: ['owner-dashboard']");
  });

  it('key write action modules import the owner-dashboard revalidation helper', () => {
    for (const src of [
      salesActionsSrc,
      paymentActionsSrc,
      purchaseActionsSrc,
      expenseActionsSrc,
      inventoryActionsSrc,
      shiftActionsSrc,
      productActionsSrc,
      returnActionsSrc,
      momoActionsSrc,
    ]) {
      expect(src).toContain("import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation'");
    }
  });

  it('sale creation and checkout completion revalidate owner dashboard after successful writes', () => {
    expect(salesActionsSrc).toContain('await createSale({');
    expect(salesActionsSrc.match(/revalidateOwnerDashboardCache\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(salesActionsSrc).toContain("revalidateTag('reports')");
  });

  it('POS completeSaleAction revalidates readiness and onboarding after successful checkout', () => {
    const completeSaleBlock = salesActionsSrc.slice(
      salesActionsSrc.indexOf('export async function completeSaleAction'),
      salesActionsSrc.indexOf('export async function amendSaleAction'),
    );

    expect(completeSaleBlock).toContain("revalidateTag('reports')");
    expect(completeSaleBlock).toContain('revalidateOwnerDashboardCache()');
    expect(completeSaleBlock).toContain('revalidateTag(`readiness-${businessId}`)');
    expect(completeSaleBlock).toContain("revalidatePath('/onboarding')");
  });

  it('customer and supplier payments revalidate reports and owner dashboard', () => {
    expect(paymentActionsSrc).toContain('await recordCustomerPayment');
    expect(paymentActionsSrc).toContain('await recordSupplierPayment');
    expect(paymentActionsSrc.match(/revalidateOwnerDashboardCache\(\);/g)).toHaveLength(2);
    expect(paymentActionsSrc.match(/revalidateTag\('reports'\);/g)).toHaveLength(2);
  });

  it('purchase and expense writes revalidate owner dashboard after success', () => {
    expect(purchaseActionsSrc).toContain('await createPurchase({');
    expect(purchaseActionsSrc).toContain('await prisma.$transaction');
    expect(purchaseActionsSrc.match(/revalidateOwnerDashboardCache\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(expenseActionsSrc.match(/revalidateOwnerDashboardCache\(\);/g)).toHaveLength(2);
  });

  it('stock, shift, return, product, and mobile money writes revalidate owner dashboard', () => {
    expect(inventoryActionsSrc.match(/revalidateOwnerDashboardCache\(\);/g)).toHaveLength(2);
    expect(shiftActionsSrc.match(/revalidateOwnerDashboardCache\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(returnActionsSrc.match(/revalidateOwnerDashboardCache\(\);/g)).toHaveLength(2);
    expect(productActionsSrc.match(/revalidateOwnerDashboardCache\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(momoActionsSrc.match(/revalidateOwnerDashboardCache\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('owner dashboard revalidation is not placed inside repeated loops', () => {
    expect(ownerRevalidatedActions).not.toMatch(/for\s*\([^)]*\)\s*{[^}]*revalidateOwnerDashboardCache\(\)/s);
    expect(ownerRevalidatedActions).not.toMatch(/\.map\([^)]*revalidateOwnerDashboardCache\(\)/s);
    expect(ownerRevalidatedActions).not.toMatch(/\.forEach\([^)]*revalidateOwnerDashboardCache\(\)/s);
  });

  it('Today KPI reports tag and 30 second TTL remain intact', () => {
    expect(todayKpisSrc).toContain("'report-today-kpis'");
    expect(todayKpisSrc).toContain('revalidate: 30');
    expect(todayKpisSrc).toContain("tags: ['reports']");
    expect(todayKpisSrc).toContain('cachedTodayKPIs(businessId, storeId ??');
  });

  it('Trading Dashboard caches only the scoped period snapshot with a short TTL', () => {
    expect(tradingDashboardSrc).toContain("import { unstable_cache } from 'next/cache'");
    expect(tradingDashboardSrc).toContain('async function _getTradingDashboardSnapshot');
    expect(tradingDashboardSrc).toContain('const getCachedTradingDashboardSnapshot = unstable_cache');
    expect(tradingDashboardSrc).toContain("'report-trading-dashboard'");
    expect(tradingDashboardSrc).toContain('revalidate: 60');
    expect(tradingDashboardSrc).toContain("tags: ['reports', 'trading-dashboard']");
  });

  it('Trading Dashboard cache arguments include business, currency, date range, and store scope', () => {
    expect(tradingDashboardSrc).toContain('businessId: string');
    expect(tradingDashboardSrc).toContain('currency: string');
    expect(tradingDashboardSrc).toContain('startIso: string');
    expect(tradingDashboardSrc).toContain('endIso: string');
    expect(tradingDashboardSrc).toContain('selectedStoreId: string');
    expect(tradingDashboardSrc).toContain('getCachedTradingDashboardSnapshot(');
    expect(tradingDashboardSrc).toContain('startIso,');
    expect(tradingDashboardSrc).toContain('endIso,');
  });

  it('Trading Dashboard live pulse remains uncached in the page', () => {
    expect(tradingDashboardSrc).toContain('prisma.salesInvoice.findFirst({');
    expect(tradingDashboardSrc).toContain('closedAt: null');
    expect(tradingDashboardSrc).toContain('lastSaleMinutesAgo');
    expect(tradingDashboardSrc).toContain('activeCashierCount');
  });

  it('Trading Dashboard keeps force-dynamic on page shell and existing date range resolution', () => {
    const dashboardPage = read('app/(protected)/reports/dashboard/page.tsx');
    expect(dashboardPage).toContain("export const dynamic = 'force-dynamic'");
    expect(dashboardPage).toContain('resolveReportDateRange(');
    expect(dashboardPage).toContain('defaultRangeStart');
    expect(dashboardPage).toContain('todayEnd');
  });

  it('POS cached loaders remain scoped by function arguments and TTLs are unchanged', () => {
    expect(posSrc).toContain('getCachedProducts(business.id)');
    expect(posSrc).toContain('getCachedInventory(baseStore.id)');
    expect(posSrc).toContain('getCachedCustomers(business.id)');
    expect(posSrc).toContain('getCachedTills(baseStore.id)');
    expect(posSrc).toContain('getCachedShifts(baseStore.id)');
    expect(posSrc).toContain('revalidate: 60');
    expect(posSrc).toContain('revalidate: 30');
    expect(posSrc).toContain('revalidate: 10');
  });

  it('POS checkout action signature and checkout service call remain unchanged', () => {
    expect(salesActionsSrc).toContain('export async function completeSaleAction(data: {');
    expect(salesActionsSrc).toContain('cart: string;');
    expect(salesActionsSrc).toContain('momoPaid?: number;');
    expect(salesActionsSrc).toContain('const invoice = await createSale({');
  });

  it('schema, financial calculations, forecast assumptions, and balance services stay untouched', () => {
    expect(schemaSrc).toContain('provider = "sqlite"');
    expect(schemaSrc).toContain('model SalesInvoice');
    expect(schemaSrc).toContain('model PurchaseInvoice');
    expect(schemaSrc).toContain('model Customer');
    expect(schemaSrc).toContain('model Supplier');
    expect(financialsSrc).toContain('export function getIncomeStatement');
    expect(financialsSrc).toContain('export function getCashflow');
    expect(forecastSrc).toContain('0.85');
    expect(forecastSrc).toContain('0.6');
    expect(forecastSrc).toContain('1.1');
    expect(forecastSrc).toContain('0.8');
    expect(customerSvcSrc).toContain('computeOutstandingBalance');
    expect(supplierSvcSrc).toContain('computeOutstandingBalance');
    expect(salesSvcSrc).toContain('export async function createSale');
  });

  it('routes and export route files are not changed by Phase B', () => {
    const financialExportSrc = read('app/api/reports/financials/route.ts');
    const supplierSalesExportSrc = read('app/(protected)/reports/sales-by-supplier/export/route.ts');
    expect(financialExportSrc).toContain('income-statement');
    expect(financialExportSrc).toContain('balance-sheet');
    expect(supplierSalesExportSrc).toContain('getSupplierSalesReport');
  });
});
