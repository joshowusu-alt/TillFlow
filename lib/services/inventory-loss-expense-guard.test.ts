import { describe, expect, it } from 'vitest';
import { INVENTORY_LOSS_ACCOUNT_CODE } from '@/lib/reliability/walkthrough-contracts';
import {
  assertInventoryLossExpenseAllowed,
  assertSourceAdjustmentAvailable,
  composeInventoryLossNotes,
  INVENTORY_LOSS_DUPLICATE_ADJUSTMENT_MSG,
  INVENTORY_LOSS_OVERRIDE_REQUIRED_MSG,
  isInventoryLossAccount,
  isSourceAdjustmentUniqueConflict,
} from './inventory-loss-expense-guard';

describe('inventory-loss expense guard', () => {
  it('treats only account 5100 as inventory loss', () => {
    expect(isInventoryLossAccount(INVENTORY_LOSS_ACCOUNT_CODE)).toBe(true);
    expect(isInventoryLossAccount('6000')).toBe(false);
    expect(isInventoryLossAccount('5000')).toBe(false);
  });

  it('allows a normal operating expense without an override', () => {
    expect(() =>
      assertInventoryLossExpenseAllowed({ accountCode: '6000', override: false, reason: null }),
    ).not.toThrow();
  });

  it('rejects a 5100 expense without an exceptional override and reason', () => {
    expect(() =>
      assertInventoryLossExpenseAllowed({ accountCode: INVENTORY_LOSS_ACCOUNT_CODE }),
    ).toThrow(INVENTORY_LOSS_OVERRIDE_REQUIRED_MSG);
    expect(() =>
      assertInventoryLossExpenseAllowed({
        accountCode: INVENTORY_LOSS_ACCOUNT_CODE,
        override: true,
        reason: '   ',
      }),
    ).toThrow(INVENTORY_LOSS_OVERRIDE_REQUIRED_MSG);
  });

  it('allows a 5100 expense only with override and reason', () => {
    expect(() =>
      assertInventoryLossExpenseAllowed({
        accountCode: INVENTORY_LOSS_ACCOUNT_CODE,
        override: true,
        reason: 'Authorised recount of a missing journal',
      }),
    ).not.toThrow();
  });

  it('persists the override reason without rewriting historic notes', () => {
    expect(composeInventoryLossNotes(null, 'Authorised recount')).toBe(
      'Inventory-loss override: Authorised recount',
    );
    expect(composeInventoryLossNotes('Keep the receipt', 'Authorised recount')).toBe(
      'Inventory-loss override: Authorised recount\nKeep the receipt',
    );
  });

  it('rejects a second expense for the same sourceAdjustmentId', async () => {
    const findFirst = async (args: { where?: { businessId?: string } }) => {
      expect(args.where?.businessId).toBe('biz-1');
      return { id: 'exp-existing' };
    };
    const tx = { expense: { findFirst } };
    await expect(assertSourceAdjustmentAvailable(tx, 'adj-1', 'biz-1')).rejects.toThrow(
      INVENTORY_LOSS_DUPLICATE_ADJUSTMENT_MSG,
    );
  });

  it('allows the first expense for a sourceAdjustmentId', async () => {
    const tx = {
      expense: {
        findFirst: async () => null,
      },
    };
    await expect(assertSourceAdjustmentAvailable(tx, 'adj-1')).resolves.toBeUndefined();
  });

  it('recognises the unique constraint on sourceAdjustmentId', () => {
    expect(
      isSourceAdjustmentUniqueConflict({
        code: 'P2002',
        meta: { target: ['sourceAdjustmentId'] },
      }),
    ).toBe(true);
    expect(
      isSourceAdjustmentUniqueConflict({
        code: 'P2002',
        meta: { target: ['businessId', 'key'] },
      }),
    ).toBe(false);
  });
});
