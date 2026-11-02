import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { cashflowAccumulator, getCashflowStatement, type CashflowJournal } from './cashflow-statement';
const types: Record<string, string> = { '1000.HOLD.store.manager': 'ASSET', '2300.OWNER.owner': 'LIABILITY', '3100.OWNER.owner': 'EQUITY', '1000': 'ASSET', '1010': 'ASSET', '1100': 'ASSET', '1200': 'ASSET', '1300': 'ASSET', '1500': 'ASSET', '2000': 'LIABILITY', '2100': 'LIABILITY', '3000': 'EQUITY', '3200': 'EQUITY', '4000': 'INCOME', '4100': 'INCOME', '5000': 'EXPENSE', '5100': 'EXPENSE', '6000': 'EXPENSE' };
const journal = (referenceType: string | null, values: Record<string, number>): CashflowJournal => ({ id: 'entry', referenceType, lines: Object.entries(values).map(([code, amount]) => ({ account: { code, name: code, type: types[code] }, debitPence: Math.max(amount, 0), creditPence: Math.max(-amount, 0) })) });
const report = (...entries: CashflowJournal[]) => { const accumulator = cashflowAccumulator(); entries.forEach(accumulator.add); return accumulator.finish(); };
describe('indirect cash flow and direct supporting detail', () => {
  it('classifies return credits as noncash and later supplier refunds as money received', () => {
    const result = report(journal('PURCHASE_RETURN_CREDIT', { '1200': -1000, '1300': -200, '2000': 1200 }), journal('SUPPLIER_CREDIT_REFUND', { '1010': 1200, '2000': -1200 }));
    expect(result).toMatchObject({ netCashFromOps: 1200, directOperatingPence: 1200, operatingDifferencePence: 0, otherPence: 0 });
    expect(result.directRows).toEqual([expect.objectContaining({ label: 'Supplier refunds — money received', amountPence: 1200 })]);
  });
  it('turns accrual profit into the same cash movement as receipts and payments', () => {
    const result = report(
      journal('SALES_INVOICE', { '1000': 4700000, '1100': 300000, '4000': -5000000, '1200': -3100000, '5000': 3100000 }),
      journal('PURCHASE_INVOICE', { '1200': 3500000, '1010': -3200000, '2000': -300000 }),
      journal('EXPENSE', { '6000': 700000, '1000': -700000 }),
    );
    expect(result).toMatchObject({ netProfit: 1200000, netCashFromOps: 800000, directOperatingPence: 800000, operatingDifferencePence: 0 });
    expect(result.adjustments.map(row => row.amountPence)).toEqual([-300000, -400000, 300000]);
    expect(result.directRows.map(row => row.amountPence).sort((a, b) => a - b)).toEqual([-3200000, -700000, 4700000]);
  });
  it('does not turn unpaid sales, unpaid purchases, VAT or stock losses into cash', () => {
    const result = report(
      journal('SALES_INVOICE', { '1100': 1200, '4000': -1000, '2100': -200, '1200': -400, '5000': 400 }),
      journal('PURCHASE_INVOICE', { '1200': 700, '1300': 100, '2000': -800 }),
      journal('STOCK_ADJUSTMENT', { '1200': -50, '5100': 50 }),
    );
    expect(result).toMatchObject({ netCashFromOps: 0, directOperatingPence: 0, operatingDifferencePence: 0 });
    expect(result.directRows).toEqual([]);
  });
  it('keeps dated opening entries and equity funding outside operating receipts', () => {
    const result = report(
      journal('OPENING_BALANCE_CASH_BANK', { '1010': 1000, '3200': -1000 }),
      journal('OPENING_BALANCE_AR', { '1100': 800, '3200': -800 }),
      journal(null, { '1000': 400, '3000': -400 }),
      journal(null, { '1010': -200, '3000': 200 }),
    );
    expect(result).toMatchObject({ netCashFromOps: 0, openingEntriesPence: 1000, financingPence: 200, classifiedMovementPence: 1200 });
  });
  it('excludes internal transfers and handles refunds and reversed expense payments with signed rows', () => {
    const result = report(
      journal(null, { '1000': -500, '1010': 500 }),
      journal('SALES_RETURN', { '1000': -100, '4000': 100 }),
      journal('PURCHASE_RETURN', { '1010': 200, '1200': -200 }),
      journal('EXPENSE_PAYMENT', { '1010': 50, '2000': -50 }),
    );
    expect(result).toMatchObject({ netCashFromOps: 150, directOperatingPence: 150, financingPence: 0, otherPence: 0 });
    expect(result.directRows).toHaveLength(3);
  });
  it('shows unknown money movements explicitly instead of pretending they are operating cash', () => {
    const result = report(journal('CUSTOM_EQUIPMENT', { '1500': 500, '1010': -500 }));
    expect(result).toMatchObject({ otherPence: -500, otherEntryCount: 1, netCashFromOps: 0, investingPence: 0 });
    expect(result.directRows[0]).toMatchObject({ label: 'Other money paid', amountPence: -500 });
  });
  it('exposes unbalanced entries rather than plugging cash or changing inventory', () => {
    const result = report(journal('SALES_INVOICE', { '1000': 100, '4000': -90 }));
    expect(result).toMatchObject({ netCashFromOps: 90, directOperatingPence: 100, operatingDifferencePence: -10 });
  });
  it('handles empty ledgers and refuses imprecise arithmetic', () => {
    expect(report()).toMatchObject({ netProfit: 0, netCashFromOps: 0, classifiedMovementPence: 0 });
    expect(() => report(journal('SALES_INVOICE', { '1000': Number.MAX_SAFE_INTEGER + 1 }))).toThrow('precision');
  });
  it('reads all pages under one snapshot with business-scoped lines and half-open dates', async () => {
    const start = new Date('2026-03-01'), end = new Date('2026-04-01');
    const first = Array.from({ length: 500 }, (_, i) => ({ ...journal('SALES_INVOICE', { '1010': 1, '4000': -1 }), id: String(i) }));
    const db = { salesInvoiceLine: { count: vi.fn().mockResolvedValue(0) }, account: { findMany: vi.fn().mockResolvedValue([{ id: 'bank', code: '1010', name: 'Bank' }]) },
      journalLine: { groupBy: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ accountId: 'bank', _sum: { debitPence: 501, creditPence: 0 } }]) },
      journalEntry: { findMany: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce([journal('SALES_INVOICE', { '1010': 1, '4000': -1 })]) }, $transaction: vi.fn(),
    };
    db.$transaction.mockImplementation(fn => fn(db));
    const result = await getCashflowStatement(db as unknown as PrismaClient, 'biz', start, end);
    expect(result).toMatchObject({ beginningCash: 0, endingCash: 501, netCashFromOps: 501, movementDifferencePence: 0 });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
    expect(db.journalEntry.findMany.mock.calls[0][0]).toMatchObject({ where: { businessId: 'biz', entryDate: { gte: start, lt: end } }, select: { lines: { where: { account: { businessId: 'biz' } } } } });
    expect(db.journalEntry.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: '499' }, skip: 1 });
  });
});

describe('cash custody and owner funding', () => {
  it('excludes handovers from total cash movement and recognises supplier spending once', () => {
    const result = report(journal('CASH_TRANSFER', { '1010': -100000, '1000.HOLD.store.manager': 100000 }), journal('PURCHASE_INVOICE', { '1200': 80000, '1000.HOLD.store.manager': -80000 }), journal('CASH_TRANSFER', { '1000.HOLD.store.manager': -20000, '1010': 20000 }));
    expect(result).toMatchObject({ netCashFromOps: -80000, directOperatingPence: -80000, operatingDifferencePence: 0, classifiedMovementPence: -80000 });
  });
  it('does not invent business cash movement when an owner pays a supplier directly', () => {
    for (const code of ['2300.OWNER.owner', '3100.OWNER.owner']) {
      expect(report(journal('PURCHASE_INVOICE', { '1200': 80000, [code]: -80000 }))).toMatchObject({ netCashFromOps: 0, directOperatingPence: 0, operatingDifferencePence: 0, classifiedMovementPence: 0 });
    }
  });
  it('classifies actual owner funding and repayment as financing', () => {
    const result = report(journal('CASH_TRANSFER', { '1000.HOLD.store.manager': 100000, '2300.OWNER.owner': -100000 }), journal('CASH_TRANSFER', { '1010': -20000, '2300.OWNER.owner': 20000 }));
    expect(result).toMatchObject({ financingPence: 80000, netCashFromOps: 0, classifiedMovementPence: 80000 });
  });
});
