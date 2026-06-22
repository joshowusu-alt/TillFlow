import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Service layer
// ---------------------------------------------------------------------------

describe('getSupplierSalesReport — service layer', () => {
  const src = readFileSync(join(process.cwd(), 'lib/reports/supplier-sales.ts'), 'utf8');

  it('exports getSupplierSalesReport function', () => {
    expect(src).toContain('export async function getSupplierSalesReport');
  });

  it('exports SupplierSalesRow and SupplierSalesReport types', () => {
    expect(src).toContain('export type SupplierSalesRow');
    expect(src).toContain('export type SupplierSalesReport');
    expect(src).toContain('export type SupplierSalesProductRow');
  });

  it('fetches products via preferredSupplierId index', () => {
    expect(src).toContain('preferredSupplierId');
    expect(src).toContain('prisma.product.findMany');
  });

  it('filters out RETURNED and VOID invoices', () => {
    expect(src).toContain("notIn: ['RETURNED', 'VOID']");
  });

  it('aggregates lineTotalPence as revenue', () => {
    expect(src).toContain('lineTotalPence');
    expect(src).toContain('revenuePence');
  });

  it('aggregates qtyBase as quantity', () => {
    expect(src).toContain('qtyBase');
  });

  it('initialises all linked suppliers including zero-sales ones', () => {
    expect(src).toContain('supplierAcc');
    expect(src).toContain('supplierNames');
  });

  it('supports optional supplierId filter for drill-down', () => {
    expect(src).toContain('supplierId');
    expect(src).toContain('supplierId ? { preferredSupplierId: supplierId }');
  });

  it('sorts rows by revenue descending', () => {
    expect(src).toContain('b.totalRevenuePence - a.totalRevenuePence');
  });

  it('computes avgSaleValuePence per supplier', () => {
    expect(src).toContain('avgSaleValuePence');
  });

  it('returns suppliersWithSalesCount and topSupplierName', () => {
    expect(src).toContain('suppliersWithSalesCount');
    expect(src).toContain('topSupplierName');
  });

  it('uses two-query approach: products first, then sales lines', () => {
    expect(src).toContain('prisma.product.findMany');
    expect(src).toContain('prisma.salesInvoiceLine.findMany');
  });
});

// ---------------------------------------------------------------------------
// Report page
// ---------------------------------------------------------------------------

describe('sales-by-supplier page', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/(protected)/reports/sales-by-supplier/page.tsx'),
    'utf8',
  );

  it('is force-dynamic', () => {
    expect(src).toContain("export const dynamic = 'force-dynamic'");
  });

  it('gates on advancedReports feature', () => {
    expect(src).toContain('advancedReports');
    expect(src).toContain('AdvancedModeNotice');
  });

  it('shows summary cards: total revenue, units sold, suppliers with sales, top supplier', () => {
    expect(src).toContain('Supplier-linked sales value');
    expect(src).toContain('Quantity sold');
    expect(src).toContain('Suppliers with sales');
    expect(src).toContain('Top supplier');
  });

  it('renders the supplier table with drill-down links', () => {
    expect(src).toContain('supplierId: row.supplierId');
    expect(src).toContain('View products');
    expect(src).toContain('Linked products');
  });

  it('supports drill-down mode via supplierId param', () => {
    expect(src).toContain('isDrillDown');
    expect(src).toContain('drilledRow');
    expect(src).toContain('drilledSupplier');
  });

  it('shows product table in drill-down mode', () => {
    expect(src).toContain('Linked products sold');
    expect(src).toContain('productId');
    expect(src).toContain('productName');
  });

  it('includes period filter with mtd as default', () => {
    expect(src).toContain("'mtd'");
    expect(src).toContain('This month');
    expect(src).toContain('Last month');
    expect(src).toContain('This year');
  });

  it('includes Download CSV button', () => {
    expect(src).toContain('Download CSV');
    expect(src).toContain('DownloadLink');
  });

  it('renders disclaimer note about preferred supplier attribution', () => {
    expect(src).toContain('Based on preferred supplier links on products.');
    expect(src).toContain('This is a sales performance view, not supplier debt.');
    expect(src).toContain('does not track exact stock batch origin');
  });

  it('links back to all suppliers from drill-down', () => {
    expect(src).toContain('← All suppliers');
  });

  it('links to supplier profile from drill-down', () => {
    expect(src).toContain('← View supplier profile');
    expect(src).toContain('/suppliers/${supplierId}');
  });

  it('uses resolveSelectableReportDateRange for date parsing', () => {
    expect(src).toContain('resolveSelectableReportDateRange');
  });

  it('shows an actionable setup state when no products are linked to suppliers', () => {
    expect(src).toContain('No supplier-linked sales yet');
    expect(src).toContain('link products to their preferred supplier');
    expect(src).toContain('Manage products');
    expect(src).toContain('View suppliers');
  });

  it('distinguishes linked products with no sales from missing supplier links', () => {
    expect(src).toContain('No sales for linked products in this period');
    expect(src).toContain('Supplier links exist, but no linked products were sold');
    expect(src).toContain('Use supplier payables for what you owe suppliers.');
    expect(src).toContain('Change period');
  });

  it('shows filtered supplier setup actions for empty drill-downs', () => {
    expect(src).toContain('No products linked to');
    expect(src).toContain('this does not create supplier debt or track exact stock batches');
    expect(src).toContain('View linked products');
    expect(src).toContain('#products-supplied');
  });
});

// ---------------------------------------------------------------------------
// Product setup UX for supplier linking
// ---------------------------------------------------------------------------

describe('product setup — preferred supplier linking', () => {
  const productsPage = readFileSync(
    join(process.cwd(), 'app/(protected)/products/page.tsx'),
    'utf8',
  );
  const productDetailPage = readFileSync(
    join(process.cwd(), 'app/(protected)/products/[id]/page.tsx'),
    'utf8',
  );
  const productActions = readFileSync(join(process.cwd(), 'app/actions/products.ts'), 'utf8');
  const productService = readFileSync(join(process.cwd(), 'lib/services/products.ts'), 'utf8');

  it('loads suppliers and renders a preferred supplier selector on product creation', () => {
    expect(productsPage).toContain('prisma.supplier.findMany');
    expect(productsPage).toContain('name="preferredSupplierId"');
    expect(productsPage).toContain('No preferred supplier');
    expect(productsPage).toContain('Used by Sales by Linked Supplier reporting');
  });

  it('loads and displays preferred supplier links in the product list', () => {
    expect(productsPage).toContain('preferredSupplier: { select: { id: true, name: true } }');
    expect(productsPage).toContain('Preferred Supplier');
    expect(productsPage).toContain('/suppliers/${product.preferredSupplier.id}');
  });

  it('renders a preferred supplier selector on product edit with the current value selected', () => {
    expect(productDetailPage).toContain('prisma.supplier.findMany');
    expect(productDetailPage).toContain('name="preferredSupplierId"');
    expect(productDetailPage).toContain("defaultValue={product.preferredSupplierId ?? ''}");
  });

  it('parses and persists preferredSupplierId through product actions and service writes', () => {
    expect(productActions).toContain("formOptionalString(formData, 'preferredSupplierId')");
    expect(productService).toContain('preferredSupplierId?: string | null');
    expect(productService).toContain('assertSupplierBelongsToBusiness');
    expect(productService).toContain('preferredSupplierId: normalized.preferredSupplierId');
  });

  it('does not render the old owner-facing price repair banner or button', () => {
    expect(productsPage).not.toContain('RepairPricesButton');
    expect(productsPage).not.toContain('Price repair:');
    expect(productsPage).not.toContain('Repair prices');
  });
});

// ---------------------------------------------------------------------------
// Purchase/import-driven supplier linking
// ---------------------------------------------------------------------------

describe('purchase-driven supplier-product linking', () => {
  const purchaseService = readFileSync(join(process.cwd(), 'lib/services/purchases.ts'), 'utf8');
  const purchaseActions = readFileSync(join(process.cwd(), 'app/actions/purchases.ts'), 'utf8');
  const purchaseDetailPage = readFileSync(join(process.cwd(), 'app/(protected)/purchases/[id]/page.tsx'), 'utf8');
  const importStockAction = readFileSync(join(process.cwd(), 'app/actions/import-stock.ts'), 'utf8');
  const importStockClient = readFileSync(
    join(process.cwd(), 'app/(protected)/settings/import-stock/ImportStockClient.tsx'),
    'utf8',
  );
  const supplierSalesSrc = readFileSync(join(process.cwd(), 'lib/reports/supplier-sales.ts'), 'utf8');

  it('links purchased products only when preferredSupplierId is null', () => {
    expect(purchaseService).toContain('linkPurchasedProductsToSupplier');
    expect(purchaseService).toContain('preferredSupplierId: null');
    expect(purchaseService).toContain('data: { preferredSupplierId: input.supplierId }');
  });

  it('returns a structured supplier-link summary with reviewable products left unchanged', () => {
    expect(purchaseService).toContain('linkedCount');
    expect(purchaseService).toContain('alreadyLinkedCount');
    expect(purchaseService).toContain('skippedDifferentSupplierCount');
    expect(purchaseService).toContain('skippedProducts');
    expect(purchaseService).toContain('productName: product.name');
    expect(purchaseService).toContain('sku: product.sku');
    expect(purchaseService).toContain('currentSupplierName');
    expect(purchaseService).toContain('purchaseSupplierName');
    expect(purchaseService).toContain('product.preferredSupplierId !== input.supplierId');
  });

  it('redirects purchase creation to a detail page with supplier-link counts', () => {
    expect(purchaseActions).toContain('const invoice = await createPurchase');
    expect(purchaseActions).toContain("params.set('linked'");
    expect(purchaseActions).toContain("params.set('already'");
    expect(purchaseActions).toContain("params.set('left'");
    expect(purchaseActions).toContain('redirect(`/purchases/${invoice.id}?${params.toString()}`)');
  });

  it('shows purchase supplier-link summary and a review table for products left unchanged', () => {
    expect(purchaseDetailPage).toContain('Supplier links updated');
    expect(purchaseDetailPage).toContain('for supplier sales reporting');
    expect(purchaseDetailPage).toContain('left them unchanged');
    expect(purchaseDetailPage).toContain('We do this to avoid changing supplier sales reports by mistake.');
    expect(purchaseDetailPage).toContain('Review skipped products');
    expect(purchaseDetailPage).toContain('Current linked supplier');
    expect(purchaseDetailPage).toContain('Purchase supplier');
    expect(purchaseDetailPage).toContain('Keep current supplier');
    expect(purchaseDetailPage).toContain('Change to purchase supplier');
  });

  it('keeps supplier-link summary copy owner friendly', () => {
    const start = purchaseDetailPage.indexOf('Supplier links updated');
    const end = purchaseDetailPage.indexOf("searchParams?.supplierLinkChanged === '1'");
    const summaryBlock = purchaseDetailPage.slice(start, end);
    expect(summaryBlock).not.toMatch(/\berror\b|\bfailed\b|\bconflict\b|\bmismatch\b|\binvalid\b|\bforeign key\b|preferredSupplierId/i);
  });

  it('allows only managers and owners to change a product to the purchase supplier', () => {
    expect(purchaseActions).toContain('export async function changePurchaseProductSupplierLinkAction');
    expect(purchaseActions).toContain("withBusinessContext(['MANAGER', 'OWNER']");
    expect(purchaseActions).toContain('purchaseInvoiceLine.findFirst');
    expect(purchaseActions).toContain('prisma.product.updateMany');
    expect(purchaseActions).toContain("action: 'PRODUCT_UPDATE'");
    expect(purchaseActions).toContain('data: { preferredSupplierId: invoice.supplierId }');
    expect(purchaseActions).toContain("revalidatePath('/reports/sales-by-supplier')");
    expect(purchaseActions).toContain('supplierLinkChanged=1');
  });

  it('groups import-created purchase invoices by supplier so imports can auto-link products', () => {
    expect(importStockAction).toContain('groupLinesBySupplier');
    expect(importStockAction).toContain('supplierId: group.supplierId');
    expect(importStockAction).not.toContain('supplierId: null,\n          paymentStatus');
  });

  it('surfaces supplier-link summary from import results', () => {
    expect(importStockAction).toContain('supplierLinkSummary: ImportSupplierLinkSummary');
    expect(importStockAction).toContain('mergeSupplierProductLinkSummary');
    expect(importStockAction).toContain('supplierLinkSummary.supplierSummaries');
    expect(importStockClient).toContain('Supplier links updated');
    expect(importStockClient).toContain('linked to suppliers from your import');
    expect(importStockClient).toContain('left unchanged');
    expect(importStockClient).toContain('Review skipped products');
    expect(importStockClient).toContain('Review product');
  });

  it('feeds the existing Sales by Linked Supplier report via Product.preferredSupplierId', () => {
    expect(supplierSalesSrc).toContain('preferredSupplierId: { not: null }');
    expect(supplierSalesSrc).toContain('salesInvoiceLine.findMany');
  });
});

// ---------------------------------------------------------------------------
// CSV export route
// ---------------------------------------------------------------------------

describe('sales-by-supplier export route', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/(protected)/reports/sales-by-supplier/export/route.ts'),
    'utf8',
  );

  it('is force-dynamic', () => {
    expect(src).toContain("export const dynamic = 'force-dynamic'");
  });

  it('gates on advancedReports and returns 403 for unauthenticated plans', () => {
    expect(src).toContain('advancedReports');
    expect(src).toContain('403');
  });

  it('emits Content-Type text/csv and Content-Disposition attachment', () => {
    expect(src).toContain('text/csv');
    expect(src).toContain('Content-Disposition');
    expect(src).toContain('attachment');
  });

  it('includes supplier and product columns', () => {
    expect(src).toContain('Supplier');
    expect(src).toContain('Product');
    expect(src).toContain('SKU');
    expect(src).toContain('Revenue');
  });

  it('includes a disclaimer row', () => {
    expect(src).toContain('preferred supplier setting');
  });

  it('includes totals row', () => {
    expect(src).toContain('TOTAL');
    expect(src).toContain('totalRevenuePence');
    expect(src).toContain('totalQtyBase');
  });

  it('uses resolveSelectableReportDateRange for date parsing', () => {
    expect(src).toContain('resolveSelectableReportDateRange');
  });
});

// ---------------------------------------------------------------------------
// getTopLinkedSupplierForMonth — focused dashboard helper
// ---------------------------------------------------------------------------

describe('getTopLinkedSupplierForMonth — service helper', () => {
  const src = readFileSync(join(process.cwd(), 'lib/reports/supplier-sales.ts'), 'utf8');

  it('exports getTopLinkedSupplierForMonth function', () => {
    expect(src).toContain('export async function getTopLinkedSupplierForMonth');
  });

  it('exports TopLinkedSupplierResult type', () => {
    expect(src).toContain('export type TopLinkedSupplierResult');
  });

  it('uses current month date range: first day of month as start', () => {
    expect(src).toContain('now.getFullYear(), now.getMonth(), 1');
  });

  it('filters out RETURNED and VOID invoices (same as full report)', () => {
    // Both functions use the same filter — verify it appears at least twice
    const matches = [...src.matchAll(/notIn: \['RETURNED', 'VOID'\]/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('excludes products without preferredSupplierId', () => {
    // Both product queries use `preferredSupplierId: { not: null }`
    const matches = [...src.matchAll(/preferredSupplierId: \{ not: null \}/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('aggregates qtyBase and lineTotalPence at supplier level', () => {
    expect(src).toContain('acc.revenuePence += line.lineTotalPence');
    expect(src).toContain('acc.qtyBase += line.qtyBase');
  });

  it('returns null when no products are linked to suppliers', () => {
    expect(src).toContain('if (linkedProducts.length === 0) return null');
  });

  it('returns null when no sales lines found this month', () => {
    expect(src).toContain('if (salesLines.length === 0) return null');
  });

  it('selects the supplier with highest revenue (not just first found)', () => {
    expect(src).toContain('if (acc.revenuePence > topRevenue)');
    expect(src).toContain('topRevenue = acc.revenuePence');
  });

  it('returns supplierId, supplierName, totalRevenuePence, totalQtyBase', () => {
    expect(src).toContain('supplierId: topId');
    expect(src).toContain('supplierName: top.name');
    expect(src).toContain('totalRevenuePence: top.revenuePence');
    expect(src).toContain('totalQtyBase: top.qtyBase');
  });

  it('uses a flat supplier-level accumulator (no per-product breakdown)', () => {
    // The helper accumulator has only name/revenuePence/qtyBase — no nested products Map
    expect(src).toContain('name: string; revenuePence: number; qtyBase: number');
  });
});

// ---------------------------------------------------------------------------
// Command center — Top Supplier This Month card
// ---------------------------------------------------------------------------

describe('command-center — Top Supplier This Month card', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/(protected)/reports/command-center/page.tsx'),
    'utf8',
  );

  it('imports getTopLinkedSupplierForMonth', () => {
    expect(src).toContain('getTopLinkedSupplierForMonth');
    expect(src).toContain("from '@/lib/reports/supplier-sales'");
  });

  it('fetches top supplier in parallel with KPIs', () => {
    expect(src).toContain('Promise.all');
    expect(src).toContain('getTopLinkedSupplierForMonth(business.id)');
  });

  it('gates the card on advancedReports (Starter users do not see it)', () => {
    expect(src).toContain('features.advancedReports');
    expect(src).toContain('TopSupplierCard');
  });

  it('shows supplier name and revenue this month', () => {
    expect(src).toContain('Top Supplier This Month');
    expect(src).toContain('totalRevenuePence');
    expect(src).toContain('revenue');
  });

  it('shows quantity sold (items sold)', () => {
    expect(src).toContain('totalQtyBase');
    expect(src).toContain('items sold');
  });

  it('View report link points to /reports/sales-by-supplier with supplierId and mtd period', () => {
    expect(src).toContain('/reports/sales-by-supplier?supplierId=');
    expect(src).toContain('period=mtd');
    expect(src).toContain('View report →');
  });

  it('shows empty state when no supplier-linked sales exist', () => {
    expect(src).toContain('No supplier-linked sales yet this month');
    expect(src).toContain('Link products to suppliers to see this insight');
  });

  it('includes disclaimer about linked-product basis not stock-batch origin', () => {
    expect(src).toContain('Does not track exact stock-batch origin');
  });

  it('includes Sales by Linked Supplier in deeper analysis links for Growth+ users', () => {
    expect(src).toContain('Sales by Linked Supplier');
    expect(src).toContain('/reports/sales-by-supplier');
  });

  it('wraps top supplier fetch in catch to prevent dashboard crash', () => {
    expect(src).toContain('getTopLinkedSupplierForMonth(business.id).catch(() => null)');
  });

  it('skips supplier query for Starter (only queries when advancedReports is true)', () => {
    expect(src).toContain('features.advancedReports ? getTopLinkedSupplierForMonth');
    expect(src).toContain('Promise.resolve(null)');
  });
});

// ---------------------------------------------------------------------------
// Supplier detail — Sales Performance section
// ---------------------------------------------------------------------------

describe('supplier detail page — sales performance section', () => {
  const src = readFileSync(
    join(process.cwd(), 'app/(protected)/suppliers/[id]/page.tsx'),
    'utf8',
  );

  it('imports and calls getSupplierSalesReport', () => {
    expect(src).toContain('getSupplierSalesReport');
    expect(src).toContain("from '@/lib/reports/supplier-sales'");
  });

  it('gates the sales section on advancedReports feature', () => {
    expect(src).toContain('features.advancedReports');
    expect(src).toContain('getFeatures');
  });

  it('shows MTD revenue, units sold, and sales count', () => {
    expect(src).toContain('Revenue (MTD)');
    expect(src).toContain('Units sold');
    expect(src).toContain('Sales count');
  });

  it('shows top product with link', () => {
    expect(src).toContain('Top product');
    expect(src).toContain('topProduct');
  });

  it('links to full report drill-down', () => {
    expect(src).toContain('/reports/sales-by-supplier?supplierId=');
    expect(src).toContain('Full report →');
  });

  it('action bar has View Sales Performance link for Growth+ plans', () => {
    expect(src).toContain('View Sales Performance');
  });

  it('shows an empty state when the supplier has no linked products', () => {
    expect(src).toContain('No products linked yet');
    expect(src).toContain('or record a purchase from {supplier.name}');
    expect(src).toContain('Link products');
    expect(src).toContain('Manage products');
  });
});
