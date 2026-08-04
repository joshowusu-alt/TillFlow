import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('inventory increase Phase 2 actions and UI contracts', () => {
  const inventoryAction = readFileSync(join(process.cwd(), 'app/actions/inventory.ts'), 'utf8');
  const formSrc = readFileSync(
    join(process.cwd(), 'app/(protected)/inventory/StockAdjustmentClient.tsx'),
    'utf8',
  );
  const pageSrc = readFileSync(
    join(process.cwd(), 'app/(protected)/inventory/adjustments/page.tsx'),
    'utf8',
  );
  const reverseSrc = readFileSync(
    join(process.cwd(), 'app/(protected)/inventory/adjustments/ReverseStockAdjustmentForm.tsx'),
    'utf8',
  );
  const stocktakeAction = readFileSync(join(process.cwd(), 'app/actions/stocktake.ts'), 'utf8');

  it('create action supports Phase 2 increase and Phase 1 decrease', () => {
    expect(inventoryAction).toContain('createInventoryIncrease');
    expect(inventoryAction).toContain('createInventoryDecrease');
    expect(inventoryAction).toContain('isInventoryIncreasePhase2Enabled');
    expect(inventoryAction).toContain('isInventoryDecreasePhase1Enabled');
    expect(inventoryAction).not.toContain("from '@/lib/services/inventory'");
  });

  it('restricts adjustments to Owner/Manager and excludes Cashier', () => {
    expect(inventoryAction).toContain("withBusinessStoreContext(['MANAGER', 'OWNER'])");
    expect(inventoryAction).not.toMatch(
      /withBusinessStoreContext\(\s*\[[^\]]*['"]CASHIER['"]/,
    );
  });

  it('blocks automated reversal and value-only controls', () => {
    expect(inventoryAction).toContain('Automated adjustment reversal is unavailable');
    expect(formSrc).not.toContain('value-only');
    expect(formSrc).not.toContain('SYSTEM_CORRECTION');
    expect(formSrc).not.toContain('OTHER_APPROVED');
    expect(reverseSrc).toContain('Automated reversal unavailable');
  });

  it('UI exposes Record decrease and Record increase as named actions', () => {
    expect(formSrc).toContain('Record decrease');
    expect(formSrc).toContain('Record increase');
    expect(formSrc).toContain('PHYSICAL_COUNT_SURPLUS');
    expect(formSrc).toContain('STOCK_FOUND');
    expect(formSrc).toContain('Debit');
    expect(formSrc).toContain('1200');
    expect(formSrc).toContain('4100');
    expect(formSrc).toContain('Inventory Gain');
    expect(formSrc).toContain('SubmitButton');
    expect(formSrc).toContain('loadingText="Recording…"');
  });

  it('success state shows posting reference and quantity reconciliation', () => {
    expect(pageSrc).toContain('posted');
    expect(pageSrc).toContain('Previous quantity');
    expect(pageSrc).toContain('Quantity added');
    expect(pageSrc).toContain('New quantity');
    expect(pageSrc).toContain('Inventory value added');
    expect(pageSrc).toContain('role="status"');
  });

  it('adjustment counters use store-scoped totals (not page-only mismatch)', () => {
    expect(pageSrc).toContain("direction: { in: ['INCREASE', 'IN'] }");
    expect(pageSrc).toContain('Store increases (all pages)');
    expect(pageSrc).toContain('Store decreases (all pages)');
  });

  it('stocktake surplus remains review-only (no batch increase posting)', () => {
    expect(stocktakeAction).toContain('SURPLUS_PENDING_REVIEW');
    expect(stocktakeAction).not.toContain('createInventoryIncrease');
  });
});
