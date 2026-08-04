import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('inventory adjustments page polish', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/inventory/adjustments/page.tsx'), 'utf8');
  const formSrc = readFileSync(join(process.cwd(), 'app/(protected)/inventory/StockAdjustmentClient.tsx'), 'utf8');
  const reverseSrc = readFileSync(join(process.cwd(), 'app/(protected)/inventory/adjustments/ReverseStockAdjustmentForm.tsx'), 'utf8');

  it('page component exists and renders', () => {
    expect(src).toContain('export default async function StockAdjustmentsPage');
    expect(src).toContain('title="Stock Adjustments"');
  });

  it('uses owner-friendly subtitle', () => {
    expect(src).toContain('Correct stock safely and keep a clear audit trail.');
  });

  it('stat card labels are present', () => {
    expect(src).toContain('Recorded');
    expect(src).toContain('Added');
    expect(src).toContain('Removed');
  });

  it('stat cards have helper text with consistent store scope', () => {
    expect(src).toContain('Total adjustments (this store)');
    expect(src).toContain('Store increases (all pages)');
    expect(src).toContain('Store decreases (all pages)');
  });

  it('stat cards use shadow-card and polished typography', () => {
    expect(src).toContain('shadow-card');
    expect(src).toContain('font-bold tabular-nums');
  });

  it('audit trail copy is present in history section', () => {
    expect(src).toContain('Every posting is permanently recorded');
    expect(src).toContain('Automated reversal is unavailable');
  });

  it('adjustment form component remains present with Phase 1 and Phase 2 flags', () => {
    expect(src).toContain('StockAdjustmentClient');
    expect(src).toContain('storeId={store.id}');
    expect(src).toContain('phase1Enabled={phase1Enabled}');
    expect(src).toContain('phase2Enabled={phase2Enabled}');
  });

  it('adjustment form references createStockAdjustmentAction', () => {
    expect(formSrc).toContain('createStockAdjustmentAction');
  });

  it('form posts required fields for decrease and increase modes', () => {
    expect(formSrc).toContain('name="storeId"');
    expect(formSrc).toContain('name="productId"');
    expect(formSrc).toContain('name="unitId"');
    expect(formSrc).toContain('name="qtyInUnit"');
    expect(formSrc).toContain('name="direction"');
    expect(formSrc).toContain('name="reason"');
    expect(formSrc).toContain('name="reasonCode"');
    expect(formSrc).toContain('name="idempotencyKey"');
    expect(formSrc).toContain('Record increase');
    expect(formSrc).toContain('Record decrease');
  });

  it('recent adjustments history section is present', () => {
    expect(src).toContain('Recent adjustments');
  });

  it('automated reversal UI is unavailable', () => {
    expect(src).not.toContain('ReverseStockAdjustmentForm');
    expect(reverseSrc).toContain('Automated reversal unavailable');
    expect(reverseSrc).not.toContain('reverseStockAdjustmentAction');
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

  it('direction badge is colour-coded in desktop table', () => {
    expect(src).toContain('bg-emerald-100 text-emerald-700');
    expect(src).toContain('bg-rose-100 text-rose-700');
  });

  it('empty state copy forbids same-direction corrections', () => {
    expect(src).toContain('No stock adjustments yet.');
    expect(src).toContain('never correct a decrease with another decrease');
  });

  it('desktop table has an empty state', () => {
    expect(src).toContain('AdjustmentsEmptyState');
    expect(src).toContain('colSpan={7}');
  });

  it('does not add pointer or touch handlers', () => {
    expect(src).not.toContain('onPointerDown');
    expect(src).not.toContain('onTouchStart');
    expect(src).not.toContain('onTouchMove');
    expect(src).not.toContain('onTouchEnd');
  });

  it('adjustment count query is present', () => {
    expect(src).toContain('prisma.stockAdjustment.count');
    expect(src).toContain('prisma.stockAdjustment.findMany');
  });

  it('stock calculation helpers remain unchanged', () => {
    expect(src).toContain('formatMixedUnit');
    expect(src).toContain('getPrimaryPackagingUnit');
  });
});
