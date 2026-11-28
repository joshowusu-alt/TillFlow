import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const readSource = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Sales by Linked Supplier trust clarity pass', () => {
  const page = readSource('app/(protected)/reports/sales-by-supplier/page.tsx');

  it('keeps the report route title and improves the subtitle', () => {
    expect(page).toContain('title="Sales by supplier"');
    expect(page).toContain('See how much you sold from each supplier’s products.');
    expect(page).toContain('Sales of products linked to');
  });

  it('adds a prominent trust panel for preferred supplier attribution', () => {
    expect(page).toContain('rounded-2xl border border-blue-100 bg-blue-50/70');
    expect(page).toContain('This shows sales of each supplier’s products. It is not what you owe them.');
    expect(page).toContain('Sales use each product’s main supplier, not the supplier of the exact item sold.');
    expect(page).toContain('Changing the main supplier also moves earlier sales');
    expect(page).toContain('Returned and cancelled sales are excluded.');
    expect(page).toContain('Net sales exclude tax and include discounts.');
  });

  it('points users to existing supplier payables and payments routes', () => {
    expect(page).toContain('href="/payments/supplier-aging"');
    expect(page).toContain('Supplier balances');
    expect(page).toContain('href="/payments/supplier-payments"');
    expect(page).toContain('Supplier payments');
  });

  it('uses owner-friendly sales labels without changing date filters', () => {
    expect(page).toContain('Sales of supplier products');
    expect(page).toContain('Items sold');
    expect(page).toContain('label="Sales"');
    expect(page).toContain('label="Net sales"');
    expect(page).toContain('label="Linked products"');
    expect(page).toContain('label="Average sale value"');
    expect(page).toContain('data-supplier-primary-figures');
    expect(page).not.toContain('sticky right-0');
    expect(page).not.toContain('Sum of all base-unit quantities');
    expect(page).not.toContain('retained shop earnings');
    expect(page).toContain('htmlFor="supplier-period">Period</label>');
    expect(page).toContain('name="period"');
    expect(page).toContain('name="from"');
    expect(page).toContain('name="to"');
  });

  it('keeps drill-down, setup states, and product links present', () => {
    expect(page).toContain('isDrillDown');
    expect(page).toContain('drilledRow');
    expect(page).toContain('Linked products sold');
    expect(page).toContain('View products');
    expect(page).toContain('No supplier sales yet');
    expect(page).toContain('Choose a main supplier for your products');
    expect(page).toContain('This groups sales, not money owed.');
    expect(page).toContain('Manage products');
  });

  it('keeps export link construction and export route untouched from the page', () => {
    expect(page).toContain(".replace('/reports/sales-by-supplier', '/reports/sales-by-supplier/export')");
    expect(page).toContain('Download CSV');
    expect(page).toContain('fallbackFilename={`supplier-sales-${fromInputValue}-to-${toInputValue}.csv`}');
  });

  it('does not add pointer or touch handlers', () => {
    expect(page).not.toContain('onPointerDown');
    expect(page).not.toContain('onTouchStart');
    expect(page).not.toContain('onTouchMove');
    expect(page).not.toContain('onTouchEnd');
  });

  it('preserves supplier attribution while exposing historical profit in the export', () => {
    const service = readSource('lib/reports/supplier-sales.ts');
    const exportRoute = readSource('app/(protected)/reports/sales-by-supplier/export/route.ts');

    expect(service).toContain('export async function getSupplierSalesReport');
    expect(service).toContain('preferredSupplierId: { not: null }');
    expect(service).toContain("notIn: ['RETURNED', 'VOID']");
    // Product rank moved off lineTotalPence onto the shared sales_activity net.
    expect(service).toContain('rankRecognisedProductSales');
    expect(service).toContain('lineTotalPence');
    expect(service).toContain('b.totalRevenuePence - a.totalRevenuePence');
    expect(exportRoute).toContain('preferred supplier setting');
    for (const label of ['Supplier', 'Product', 'SKU', 'Qty Sold (base units)', 'Revenue', 'Sales Count', 'Net sales (ex tax)', 'Recorded cost', 'Calculated gross profit', 'Margin %']) expect(exportRoute).toContain(`'${label}'`);
    expect(service).toContain('evaluateMarginLines');
    expect(exportRoute).toContain('guardLiveReport');
  });

  it('loads optional hierarchy filters while preserving supplier/payment attribution', () => {
    const sales = readSource('lib/services/sales.ts');
    const purchases = readSource('lib/services/purchases.ts');
    const products = readSource('lib/services/products.ts');

    expect(page).toContain("import { getSupplierSalesReport } from '@/lib/reports/supplier-sales';");
    expect(page).toContain("import { listProductDivisions } from '@/lib/services/product-classification';");
    expect(sales).toContain("type: 'SALE' as const");
    expect(purchases).toContain('linkPurchasedProductsToSupplier');
    expect(products).toContain('preferredSupplierId?: string | null');
  });
});
