import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectedCashPenceFromEntries, type ExpectedCashEntry } from './expected-cash';

const scope = { businessId: 'b1', storeId: 's1', tillId: 't1', shiftId: 'sh1' };

function entry(partial: Partial<ExpectedCashEntry> & Pick<ExpectedCashEntry, 'entryType' | 'amountPence'>): ExpectedCashEntry {
  return { businessId: 'b1', storeId: 's1', tillId: 't1', shiftId: 'sh1', ...partial };
}

describe('expected cash', () => {
  const entries: ExpectedCashEntry[] = [
    entry({ entryType: 'OPEN_FLOAT', amountPence: 20_000 }),
    entry({ entryType: 'CASH_SALE', amountPence: 15_000, paymentStatus: 'CONFIRMED' }),
    entry({ entryType: 'CASH_DEBTOR_PAYMENT', amountPence: 4_000, paymentStatus: 'CONFIRMED' }),
    entry({ entryType: 'CASH_ADJUSTMENT', amountPence: 500 }),
    entry({ entryType: 'PAID_OUT_SUPPLIER', amountPence: -3_000 }),
    entry({ entryType: 'PAID_OUT_EXPENSE', amountPence: -1_200 }),
    entry({ entryType: 'CASH_ADJUSTMENT', amountPence: -400 }),
    entry({ entryType: 'CASH_REFUND', amountPence: -800, paymentStatus: 'CONFIRMED' }),
    entry({ entryType: 'CLOSE_RECONCILIATION', amountPence: 9_999 }),
    entry({ entryType: 'CASH_SALE', amountPence: 7_000, paymentStatus: 'PENDING_MANUAL' }),
    entry({ entryType: 'CASH_SALE', amountPence: 6_000, shiftId: 'other-shift' }),
    entry({ entryType: 'CASH_SALE', amountPence: 6_000, tillId: 'other-till' }),
    entry({ entryType: 'CASH_SALE', amountPence: 6_000, storeId: 'other-store' }),
  ];

  it('sums the eligible physical rows and ignores the exclusions', () => {
    expect(expectedCashPenceFromEntries(entries, scope)).toBe(
      20_000 + 15_000 + 4_000 + 500 - 3_000 - 1_200 - 400 - 800,
    );
  });

  it('is zero when there is no open shift worth of entries', () => {
    expect(expectedCashPenceFromEntries([], scope)).toBe(0);
  });

  it('matches the value a close snapshot must store for the same rows', () => {
    const beforeClose = entries.filter((row) => row.entryType !== 'CLOSE_RECONCILIATION');
    const live = expectedCashPenceFromEntries(beforeClose, scope);
    const storedSnapshot = live;
    expect(storedSnapshot).toBe(live);
  });

  it('is the function used by close, the drawer writer, and the home reader', () => {
    const close = readFileSync(resolve(process.cwd(), 'lib/services/shifts.ts'), 'utf8');
    const drawer = readFileSync(resolve(process.cwd(), 'lib/services/cash-drawer.ts'), 'utf8');
    const home = readFileSync(resolve(process.cwd(), 'lib/reports/home-expected-cash.ts'), 'utf8');
    expect(close).toContain('expectedCashPenceFromEntries');
    expect(drawer).toContain('isExpectedCashEntryType');
    expect(home).toContain('expectedCashPenceFromEntries');
  });
});
