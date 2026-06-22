import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const readSource = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Stock Movements clarity and mobile polish', () => {
  const page = readSource('app/(protected)/reports/stock-movements/page.tsx');

  it('keeps the page and adds owner-friendly stock history copy', () => {
    expect(page).toContain('title="Stock Movements"');
    expect(page).toContain(
      'Stock movement history showing how stock increased or decreased from sales, purchases, returns, adjustments, transfers, and opening stock.',
    );
    expect(page).toContain('Use this report to trace stock activity.');
    expect(page).toContain('Positive means stock came in. Negative means stock went out.');
    expect(page).toContain('Movement reasons include sales, purchases');
    expect(page).toContain('stocktake, and opening stock');
  });

  it('points stock corrections to the existing inventory adjustments route', () => {
    expect(page).toContain("import Link from 'next/link';");
    expect(page).toContain('href="/inventory/adjustments"');
    expect(page).toContain('Record an inventory adjustment');
    expect(page).toContain('so the audit trail stays clear');
  });

  it('uses owner-friendly labels while preserving query parameter names', () => {
    expect(page).toContain('<label className="label">Reason</label>');
    expect(page).toContain('name="type"');
    expect(page).toContain('<th className="px-4 py-2">Reason</th>');
    expect(page).toContain('<th className="px-4 py-2 text-right">Stock change</th>');
    expect(page).toContain('<th className="px-4 py-2 text-right">Before movement</th>');
    expect(page).toContain('<th className="px-4 py-2 text-right">After movement</th>');
    expect(page).toContain('<th className="px-4 py-2">Recorded by</th>');
    expect(page).not.toContain('<th className="px-4 py-2">Type</th>');
    expect(page).not.toContain('<th className="px-4 py-2 text-right">Qty change</th>');
    expect(page).not.toContain('<th className="px-4 py-2 text-right">Before</th>');
    expect(page).not.toContain('<th className="px-4 py-2 text-right">After</th>');
    expect(page).not.toContain('<th className="px-4 py-2">User</th>');
  });

  it('keeps all existing movement types and badge mappings available', () => {
    for (const type of [
      'SALE',
      'SALE_RETURN',
      'PURCHASE',
      'PURCHASE_RETURN',
      'ADJUSTMENT_INCREASE',
      'ADJUSTMENT_DECREASE',
      'ADJUSTMENT',
      'STOCKTAKE',
      'TRANSFER_OUT',
      'TRANSFER_IN',
      'OPENING',
    ]) {
      expect(page).toContain(type);
    }
  });

  it('adds mobile cards using the same movement data and sign display', () => {
    expect(page).toContain('className="mt-3 space-y-3 md:hidden"');
    expect(page).toContain('<h3 className="mt-1 text-sm font-semibold text-ink">{m.product.name}</h3>');
    expect(page).toContain('Stock change');
    expect(page).toContain('Before movement');
    expect(page).toContain('After movement');
    expect(page).toContain('Recorded by');
    expect(page).toContain('m.qtyBase > 0 ? (');
    expect(page).toContain('<span className="font-semibold text-emerald-700">+{m.qtyBase}</span>');
    expect(page).toContain('<span className="font-semibold text-rose-600">{m.qtyBase}</span>');
  });

  it('preserves the desktop table and improves empty states', () => {
    expect(page).toContain('className="responsive-table-shell -mx-1 hidden px-1 md:block sm:mx-0 sm:px-0"');
    expect(page).toContain('<table className="table mt-3 w-full border-separate border-spacing-y-2">');
    expect(page).toContain('No stock movements found.');
    expect(page).toContain('When sales, purchases, returns, adjustments, transfers, or opening stock affect inventory');
    expect(page).toContain('ReportTableEmptyRow');
    expect(page).toContain('colSpan={7}');
  });

  it('does not add pointer or touch handlers', () => {
    expect(page).not.toContain('onPointerDown');
    expect(page).not.toContain('onTouchStart');
    expect(page).not.toContain('onTouchMove');
    expect(page).not.toContain('onTouchEnd');
  });

  it('leaves stock movement query and sign logic intact', () => {
    expect(page).toContain('prisma.stockMovement.count({ where })');
    expect(page).toContain('prisma.stockMovement.findMany({');
    expect(page).toContain("orderBy: { createdAt: 'desc' }");
    expect(page).toContain('qtyBase: true');
    expect(page).toContain('beforeQtyBase: true');
    expect(page).toContain('afterQtyBase: true');
    expect(page).toContain("typeFilter = params.type && MOVEMENT_TYPES.includes(params.type) ? params.type : undefined");
  });

  it('does not change stock, inventory, sales, purchase, return, transfer, or export services', () => {
    const inventory = readSource('lib/services/inventory.ts');
    const sales = readSource('lib/services/sales.ts');
    const purchases = readSource('lib/services/purchases.ts');
    const returns = readSource('lib/services/returns.ts');
    const transfers = readSource('lib/services/stock-transfers.ts');
    const exports = readSource('lib/exports/csv-writers.ts');

    expect(inventory).toContain("type: 'ADJUSTMENT'");
    expect(sales).toContain("type: 'SALE' as const");
    expect(purchases).toContain("stockMovementType?: 'OPENING' | 'PURCHASE'");
    expect(returns).toContain("type: 'PURCHASE_RETURN'");
    expect(transfers).toContain("type: 'TRANSFER_OUT'");
    expect(transfers).toContain("type: 'TRANSFER_IN'");
    expect(exports).toContain('export async function buildStockMovementsCsv');
  });
});
