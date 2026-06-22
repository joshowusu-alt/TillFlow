import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('inventory page polish', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/inventory/page.tsx'), 'utf8');

  it('renders the Inventory page component', () => {
    expect(src).toContain('export default async function InventoryPage');
    expect(src).toContain('title="Inventory"');
  });

  it('uses owner-friendly subtitle', () => {
    expect(src).toContain('See what is in stock, what is running low, and what needs attention.');
    expect(src).not.toContain('Real-time balances in mixed units.');
  });

  it('renders all four stat card labels', () => {
    expect(src).toContain('Products');
    expect(src).toContain('Low stock');
    expect(src).toContain('Out of stock');
    expect(src).toContain('Cost drift');
  });

  it('stat cards have helper text', () => {
    expect(src).toContain('Active in catalogue');
    expect(src).toContain('Avg cost differs on this page');
  });

  it('page-scoped stat helpers clarify their scope', () => {
    const lowStockLabelPos = src.indexOf('Low stock');
    const outOfStockLabelPos = src.indexOf('Out of stock');
    const costDriftLabelPos = src.indexOf('Cost drift');

    expect(lowStockLabelPos).toBeGreaterThanOrEqual(0);
    expect(outOfStockLabelPos).toBeGreaterThanOrEqual(0);
    expect(costDriftLabelPos).toBeGreaterThanOrEqual(0);
    expect(src.indexOf('On this page', lowStockLabelPos)).toBeGreaterThan(lowStockLabelPos);
    expect(src.indexOf('On this page', outOfStockLabelPos)).toBeGreaterThan(outOfStockLabelPos);
    expect(src.indexOf('Avg cost differs on this page', costDriftLabelPos)).toBeGreaterThan(costDriftLabelPos);
  });

  it('stat cards use shadow-card and polished typography', () => {
    expect(src).toContain('shadow-card');
    expect(src).toContain('font-bold tabular-nums');
  });

  it('stocktake route is unchanged', () => {
    expect(src).toContain('href="/inventory/stocktake"');
    expect(src).toContain('Stocktake');
  });

  it('record adjustment route is unchanged', () => {
    expect(src).toContain('href="/inventory/adjustments"');
    expect(src).toContain('Record adjustment');
  });

  it('current stock section header is present', () => {
    expect(src).toContain('Current stock');
  });

  it('stock status badges remain present', () => {
    expect(src).toContain('Out of stock');
    expect(src).toContain('Low stock');
    expect(src).toContain('Cost drift');
  });

  it('stock calculation logic is untouched', () => {
    expect(src).toContain('qtyOnHandBase');
    expect(src).toContain('avgCostBasePence');
    expect(src).toContain('reorderPointBase');
    expect(src).toContain('isLow = product.reorderPointBase > 0 && qtyOnHand <= product.reorderPointBase');
    expect(src).toContain('isOut = qtyOnHand <= 0');
    expect(src).toContain('hasCostDrift = balance?.avgCostBasePence != null && balance.avgCostBasePence !== product.defaultCostBasePence');
  });

  it('desktop table has row hover polish', () => {
    expect(src).toContain('hover:-translate-y-px');
    expect(src).toContain('hover:bg-slate-50');
    expect(src).toContain('hover:shadow-card');
  });

  it('mobile cards have active scale for tap feedback', () => {
    expect(src).toContain('active:scale-[0.98]');
    expect(src).toContain('transition-transform duration-150');
    expect(src).toContain('motion-reduce:transition-none');
    expect(src).toContain('motion-reduce:active:scale-100');
  });

  it('does not add pointer or touch handlers', () => {
    expect(src).not.toContain('onPointerDown');
    expect(src).not.toContain('onTouchStart');
    expect(src).not.toContain('onTouchMove');
    expect(src).not.toContain('onTouchEnd');
  });

  it('empty state copy is owner-friendly', () => {
    expect(src).toContain('No stock items yet.');
    expect(src).toContain('Add products and opening stock so TillFlow can help you monitor stock levels and movement.');
  });

  it('desktop table empty state is present', () => {
    expect(src).toContain('colSpan={7}');
    expect(src).toContain('InventoryEmptyState');
  });

  it('data repair link is unchanged', () => {
    expect(src).toContain('href="/settings/data-repair"');
  });
});
