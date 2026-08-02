import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('inventory decrease Phase 1 actions', () => {
  const inventoryAction = readFileSync(join(process.cwd(), 'app/actions/inventory.ts'), 'utf8');
  const stocktakeAction = readFileSync(join(process.cwd(), 'app/actions/stocktake.ts'), 'utf8');
  const legacyService = readFileSync(join(process.cwd(), 'lib/services/inventory.ts'), 'utf8');

  it('create action uses Phase 1 decrease and never calls legacy createStockAdjustment', () => {
    expect(inventoryAction).toContain('createInventoryDecrease');
    expect(inventoryAction).toContain('isInventoryDecreasePhase1Enabled');
    expect(inventoryAction).not.toContain("from '@/lib/services/inventory'");
    expect(inventoryAction).toContain("direction !== 'DECREASE'");
  });

  it('requires reasonCode and idempotencyKey on create', () => {
    expect(inventoryAction).toContain('reasonCode');
    expect(inventoryAction).toContain('idempotencyKey');
    expect(inventoryAction).toContain('isInventoryDecreaseReasonCode');
  });

  it('blocks automated reversal', () => {
    expect(inventoryAction).toContain('Automated adjustment reversal is unavailable');
    expect(inventoryAction).not.toContain('createStockAdjustment({');
  });

  it('legacy createStockAdjustment is permanently disabled', () => {
    expect(legacyService).toContain('Legacy stock adjustments are disabled');
    expect(legacyService).toContain('Promise<never>');
    expect(legacyService).not.toContain('postJournalEntry');
  });

  it('stocktake posts shortfalls via Phase 1 and marks surplus pending review', () => {
    expect(stocktakeAction).toContain('createInventoryDecrease');
    expect(stocktakeAction).toContain('STOCKTAKE_SHORTFALL');
    expect(stocktakeAction).toContain('SURPLUS_PENDING_REVIEW');
    expect(stocktakeAction).not.toContain("direction: variance > 0 ? 'INCREASE'");
    expect(stocktakeAction).not.toContain("from '@/lib/services/inventory'");
  });

  it('no production callers import the disabled legacy inventory service', () => {
    const inventoryAction = readFileSync(join(process.cwd(), 'app/actions/inventory.ts'), 'utf8');
    const stocktakeAction = readFileSync(join(process.cwd(), 'app/actions/stocktake.ts'), 'utf8');
    const phase3a = readFileSync(join(process.cwd(), 'scripts/phase3a-qa.ts'), 'utf8');
    expect(inventoryAction).not.toContain("from '@/lib/services/inventory'");
    expect(stocktakeAction).not.toContain("from '@/lib/services/inventory'");
    expect(phase3a).toContain('createInventoryDecrease');
    expect(phase3a).not.toContain('createStockAdjustment');
  });
});
