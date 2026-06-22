import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const readSource = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Reorder Suggestions clarity pass', () => {
  const page = readSource('app/(protected)/reports/reorder-suggestions/page.tsx');

  it('keeps the Reorder Suggestions page and owner-friendly subtitle', () => {
    expect(page).toContain('title="Reorder Suggestions"');
    expect(page).toContain('Products that may need restocking based on recent sales and current stock.');
    expect(page).not.toContain('subtitle={`Velocity-based reorder: avg daily demand x ${leadDays}-day lead time + safety stock.`}');
  });

  it('adds guidance that suggestions are not automatic supplier orders', () => {
    expect(page).toContain('Use these suggestions as a guide before placing supplier orders.');
    expect(page).toContain('TillFlow does not order stock automatically.');
    expect(page).toContain('Suggested quantities are based on recent sales, current stock');
    expect(page).toContain('supplier lead time, and backup stock');
  });

  it('keeps the formula available in owner-friendly language without changing calculation strings', () => {
    expect(page).toContain('Formula guide: recent average daily sales x supplier lead time + backup stock, compared with current stock.');
    expect(page).toContain('const avgDailyDemand = soldQty / lookbackDays;');
    expect(page).toContain('const safetyStock = product.reorderPointBase;');
    expect(page).toContain('const reorderTarget = Math.ceil(avgDailyDemand * leadDays + safetyStock);');
    expect(page).toContain('const suggestedQty = Math.max(reorderTarget - onHand, 0);');
    expect(page).toContain('const daysOfCover = avgDailyDemand > 0 ? onHand / avgDailyDemand : Number.POSITIVE_INFINITY;');
  });

  it('uses owner-friendly filter and table labels without changing query names', () => {
    expect(page).toContain('<label className="label">Sales period</label>');
    expect(page).toContain('name="days"');
    expect(page).toContain('<label className="label">Supplier lead time</label>');
    expect(page).toContain('name="lead"');
    expect(page).toContain('<th>Average daily sales</th>');
    expect(page).toContain('<th>Current stock</th>');
    expect(page).toContain('<th>Suggested reorder quantity</th>');
    expect(page).toContain('<th>Days of stock left</th>');
    expect(page).not.toContain('<label className="label">Lookback Days</label>');
    expect(page).not.toContain('<label className="label">Lead Time (Days)</label>');
    expect(page).not.toContain('<th>Avg / Day</th>');
    expect(page).not.toContain('<th>On Hand</th>');
    expect(page).not.toContain('<th>Suggested</th>');
    expect(page).not.toContain('<th>Coverage</th>');
  });

  it('adds a mobile card view using existing suggestion row data', () => {
    expect(page).toContain('className="space-y-3 md:hidden"');
    expect(page).toContain('className="responsive-table-shell hidden md:block"');
    expect(page).toContain('<h3 className="text-sm font-semibold text-ink">{item.name}</h3>');
    expect(page).toContain('Current stock');
    expect(page).toContain('{item.onHandLabel}');
    expect(page).toContain('Suggested reorder quantity');
    expect(page).toContain('{item.suggestionLabel}');
    expect(page).toContain('Average daily sales');
    expect(page).toContain('{item.avgDailyDemand.toFixed(2)}');
    expect(page).toContain('Days of stock left');
    expect(page).toContain('Badge tone={urgencyTone[item.urgency]}');
  });

  it('keeps Mark Ordered behaviour but adds actionability copy', () => {
    expect(page).toContain("import { markAsOrdered } from '@/app/actions/reorder';");
    expect(page).toContain("await markAsOrdered(fd);");
    expect(page).toContain('Mark ordered after you have placed the supplier order.');
    expect(page).toContain('Mark Ordered');
    expect(page).toContain('name="productId" value={item.id}');
    expect(page).toContain('name="qtyBase" value={item.suggestedQty}');
    expect(page).toContain('name="storeId" value={selectedStoreId}');
  });

  it('improves the empty state copy', () => {
    expect(page).toContain('No reorder suggestions right now.');
    expect(page).toContain('When products start running low based on recent sales and stock levels, TillFlow will show them here.');
  });

  it('does not add new services, export routes, pointer, or touch handlers', () => {
    expect(page).not.toContain('/exports/');
    expect(page).not.toContain('from "@/lib/services');
    expect(page).not.toContain("from '@/lib/services");
    expect(page).not.toContain('onPointerDown');
    expect(page).not.toContain('onTouchStart');
    expect(page).not.toContain('onTouchMove');
    expect(page).not.toContain('onTouchEnd');
  });

  it('leaves reorder actions and stock/product/purchase services out of this UI pass', () => {
    const reorderAction = readSource('app/actions/reorder.ts');
    const purchases = readSource('lib/services/purchases.ts');
    const products = readSource('lib/services/products.ts');
    const inventory = readSource('lib/services/inventory.ts');

    expect(reorderAction).toContain('export async function markAsOrdered');
    expect(reorderAction).toContain("revalidatePath('/reports/reorder-suggestions')");
    expect(purchases).toContain("stockMovementType?: 'OPENING' | 'PURCHASE'");
    expect(products).toContain('preferredSupplierId?: string | null');
    expect(inventory).toContain("type: 'ADJUSTMENT'");
  });
});
