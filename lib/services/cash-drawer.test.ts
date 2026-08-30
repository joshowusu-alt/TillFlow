import { describe, expect, it } from 'vitest';

import {
  CASH_DRAWER_BREAKDOWN_ORDER,
  CASH_DRAWER_ENTRY_LABELS,
  recordCashDrawerEntryTx,
  summarizeCashDrawerEntries,
} from './cash-drawer';
import { vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

describe('cash drawer summaries', () => {
  it('summarizes the standard shift expected-cash formula categories', () => {
    const summary = summarizeCashDrawerEntries([
      { entryType: 'OPEN_FLOAT', amountPence: 20000 },
      { entryType: 'CASH_SALE', amountPence: 100000 },
      { entryType: 'CASH_DEBTOR_PAYMENT', amountPence: 200000 },
      { entryType: 'PAID_OUT_SUPPLIER', amountPence: -50000 },
      { entryType: 'PAID_OUT_EXPENSE', amountPence: -10000 },
      { entryType: 'CASH_REFUND', amountPence: 0 },
      { entryType: 'CASH_ADJUSTMENT', amountPence: 0 },
    ]);

    expect(summary.byType).toMatchObject({
      OPEN_FLOAT: 20000,
      CASH_SALE: 100000,
      CASH_DEBTOR_PAYMENT: 200000,
      PAID_OUT_SUPPLIER: -50000,
      PAID_OUT_EXPENSE: -10000,
      CASH_REFUND: 0,
      CASH_ADJUSTMENT: 0,
    });
    expect(summary.totalPence).toBe(260000);
  });

  it('provides owner-friendly labels for cash drawer report categories', () => {
    expect(CASH_DRAWER_BREAKDOWN_ORDER).toEqual([
      'OPEN_FLOAT',
      'CASH_SALE',
      'CASH_DEBTOR_PAYMENT',
      'PAID_OUT_SUPPLIER',
      'PAID_OUT_EXPENSE',
      'CASH_REFUND',
      'CASH_ADJUSTMENT',
    ]);
    expect(CASH_DRAWER_ENTRY_LABELS.PAID_OUT_SUPPLIER).toBe('Supplier payments');
    expect(CASH_DRAWER_ENTRY_LABELS.CASH_DEBTOR_PAYMENT).toBe('Customer payments received');
    expect(CASH_DRAWER_ENTRY_LABELS.CASH_ADJUSTMENT).toBe('Cash added / adjustments');
  });

  it('CASH_ADJUSTMENT with positive amountPence increases the running total', () => {
    const summary = summarizeCashDrawerEntries([
      { entryType: 'OPEN_FLOAT', amountPence: 0 },
      { entryType: 'CASH_SALE', amountPence: 86550 },
      { entryType: 'PAID_OUT_SUPPLIER', amountPence: -676900 },
      { entryType: 'CASH_ADJUSTMENT', amountPence: 700000 },
    ]);
    expect(summary.byType.CASH_ADJUSTMENT).toBe(700000);
    expect(summary.totalPence).toBe(109650);
  });

  it('CASH_ADJUSTMENT does not appear in PAID_OUT_SUPPLIER bucket', () => {
    const summary = summarizeCashDrawerEntries([
      { entryType: 'CASH_ADJUSTMENT', amountPence: 700000 },
    ]);
    expect(summary.byType.PAID_OUT_SUPPLIER).toBeUndefined();
    expect(summary.byType.CASH_SALE).toBeUndefined();
    expect(summary.byType.CASH_ADJUSTMENT).toBe(700000);
  });

  it('supplier cash payment still reduces expected cash correctly alongside an adjustment', () => {
    const summary = summarizeCashDrawerEntries([
      { entryType: 'CASH_SALE', amountPence: 86550 },
      { entryType: 'CASH_ADJUSTMENT', amountPence: 700000 },
      { entryType: 'PAID_OUT_SUPPLIER', amountPence: -676900 },
    ]);
    expect(summary.byType.PAID_OUT_SUPPLIER).toBe(-676900);
    expect(summary.totalPence).toBe(109650);
  });

  it('customer cash payment still increases expected cash correctly alongside an adjustment', () => {
    const summary = summarizeCashDrawerEntries([
      { entryType: 'CASH_DEBTOR_PAYMENT', amountPence: 50000 },
      { entryType: 'CASH_ADJUSTMENT', amountPence: 700000 },
    ]);
    expect(summary.byType.CASH_DEBTOR_PAYMENT).toBe(50000);
    expect(summary.totalPence).toBe(750000);
  });

  it('zero CASH_ADJUSTMENT has no effect on total', () => {
    const summary = summarizeCashDrawerEntries([
      { entryType: 'CASH_SALE', amountPence: 100000 },
      { entryType: 'CASH_ADJUSTMENT', amountPence: 0 },
    ]);
    expect(summary.totalPence).toBe(100000);
  });
});

describe('cash drawer writes', () => {
  it('atomically increments expected cash only while the shift is open', async () => {
    const tx = {
      shift: {
        findFirst: vi.fn().mockResolvedValue({ id: 'shift-1', expectedCashPence: 1000 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ expectedCashPence: 1250 }),
      },
      cashDrawerEntry: {
        create: vi.fn().mockResolvedValue({ id: 'entry-1' }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
      user: { findUnique: vi.fn() },
    };

    const result = await recordCashDrawerEntryTx(tx, {
      businessId: 'business-1',
      storeId: 'store-1',
      tillId: 'till-1',
      shiftId: 'shift-1',
      createdByUserId: 'user-1',
      entryType: 'CASH_SALE',
      amountPence: 250,
    });

    expect(tx.shift.updateMany).toHaveBeenCalledWith({
      where: { id: 'shift-1', tillId: 'till-1', status: 'OPEN' },
      data: { expectedCashPence: { increment: 250 } },
    });
    expect(result).toMatchObject({
      beforeExpectedCashPence: 1000,
      afterExpectedCashPence: 1250,
    });
  });
});
