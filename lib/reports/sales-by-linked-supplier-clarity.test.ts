import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const readSource = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Sales by Linked Supplier trust clarity pass', () => {
  const page = readSource('app/(protected)/reports/sales-by-supplier/page.tsx');

  it('keeps the report route title and improves the subtitle', () => {
    expect(page).toContain('title="Sales by Linked Supplier"');
    expect(page).toContain('Understand sales performance by the preferred supplier linked to each product.');
    expect(page).toContain('Product sales under the preferred supplier link for');
  });

  it('adds a prominent trust panel for preferred supplier attribution', () => {
    expect(page).toContain('rounded-2xl border border-blue-100 bg-blue-50/70');
    expect(page).toContain('Based on preferred supplier links on products.');
    expect(page).toContain('This is a sales performance view, not supplier debt.');
    expect(page).toContain('It does not prove which supplier supplied the exact');
    expect(page).toContain('does not track exact stock batch origin');
    expect(page).toContain('Supplier sales performance is separate from supplier purchases');
  });

  it('points users to existing supplier payables and payments routes', () => {
    expect(page).toContain('href="/payments/supplier-aging"');
    expect(page).toContain('View supplier payables');
    expect(page).toContain('href="/payments/supplier-payments"');
    expect(page).toContain('Supplier payments');
  });

  it('uses owner-friendly sales labels without changing date filters', () => {
    expect(page).toContain('Supplier-linked sales value');
    expect(page).toContain('Quantity sold');
    expect(page).toContain('<th>Sales value</th>');
    expect(page).toContain('<th className="hidden sm:table-cell">Products linked</th>');
    expect(page).toContain('<th className="hidden lg:table-cell">Quantity sold</th>');
    expect(page).toContain('<th className="hidden xl:table-cell">Average sale value</th>');
    expect(page).toContain('<label className="label">Period</label>');
    expect(page).toContain('name="period"');
    expect(page).toContain('name="from"');
    expect(page).toContain('name="to"');
  });

  it('keeps drill-down, setup states, and product links present', () => {
    expect(page).toContain('isDrillDown');
    expect(page).toContain('drilledRow');
    expect(page).toContain('Linked products sold');
    expect(page).toContain('View products');
    expect(page).toContain('No supplier-linked sales yet');
    expect(page).toContain('link products to their preferred supplier');
    expect(page).toContain('this does not create supplier debt or track exact stock batches');
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

  it('leaves supplier sales service and export calculations unchanged', () => {
    const service = readSource('lib/reports/supplier-sales.ts');
    const exportRoute = readSource('app/(protected)/reports/sales-by-supplier/export/route.ts');

    expect(service).toContain('export async function getSupplierSalesReport');
    expect(service).toContain('preferredSupplierId: { not: null }');
    expect(service).toContain("notIn: ['RETURNED', 'VOID']");
    expect(service).toContain('lineTotalPence');
    expect(service).toContain('b.totalRevenuePence - a.totalRevenuePence');
    expect(exportRoute).toContain('preferred supplier setting');
    expect(exportRoute).toContain("['Supplier', 'Product', 'SKU', 'Qty Sold (base units)', 'Revenue', 'Sales Count']");
  });

  it('does not import new services or change supplier/payment logic files for this page pass', () => {
    const sales = readSource('lib/services/sales.ts');
    const purchases = readSource('lib/services/purchases.ts');
    const products = readSource('lib/services/products.ts');

    expect(page).toContain("import { getSupplierSalesReport } from '@/lib/reports/supplier-sales';");
    expect(page).not.toContain("from '@/lib/services");
    expect(sales).toContain("type: 'SALE' as const");
    expect(purchases).toContain('linkPurchasedProductsToSupplier');
    expect(products).toContain('preferredSupplierId?: string | null');
  });
});
