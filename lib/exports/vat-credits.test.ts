import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  salesInvoice: { aggregate: vi.fn() },
  purchaseInvoice: { aggregate: vi.fn() },
  journalEntry: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { buildVatReportCsv } from './csv-writers';

const range = { from: new Date('2026-10-01Z'), to: new Date('2026-11-01Z') };
const aggregate = (vatPence = 0, subtotalPence = 0, count = 0) => ({
  _sum: { vatPence, subtotalPence, totalPence: vatPence + subtotalPence }, _count: { id: count },
});
const line = (code: string, debitPence: number, creditPence: number) => ({ account: { code }, debitPence, creditPence });

describe('VAT export posted return credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.salesInvoice.aggregate.mockResolvedValue(aggregate());
    db.purchaseInvoice.aggregate.mockResolvedValue(aggregate());
    db.journalEntry.findMany.mockResolvedValue([]);
  });

  it('reports an earlier invoice credit in its posting period, even without new purchases', async () => {
    db.journalEntry.findMany.mockResolvedValue([{ referenceType: 'PURCHASE_RETURN_CREDIT', lines: [
      line('2000', 4800, 0), line('1200', 0, 4000), line('1300', 0, 800),
    ] }]);
    const csv = await buildVatReportCsv('business-a', range);
    expect(csv).toContain('Input Tax Reversals (Purchase Credits),1,-40.00,-8.00');
    expect(csv).toContain('Net VAT Payable,,,"8.00"');
    expect(db.journalEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      businessId: 'business-a', entryDate: { gte: range.from, lt: range.to },
      referenceType: { in: ['SALES_RETURN', 'PURCHASE_RETURN', 'PURCHASE_RETURN_CREDIT'] },
    } }));
  });

  it('nets partial and full posted reversals against VAT from purchases and sales', async () => {
    db.salesInvoice.aggregate.mockResolvedValue(aggregate(3000, 15000, 1));
    db.purchaseInvoice.aggregate.mockResolvedValue(aggregate(2000, 10000, 1));
    db.journalEntry.findMany.mockResolvedValue([
      { referenceType: 'PURCHASE_RETURN_CREDIT', lines: [line('1200', 0, 4000), line('1300', 0, 800)] },
      { referenceType: 'PURCHASE_RETURN', lines: [line('1200', 0, 1000), line('1300', 0, 200)] },
      { referenceType: 'SALES_RETURN', lines: [line('4000', 2000, 0), line('2100', 400, 0)] },
    ]);
    const csv = await buildVatReportCsv('business-a', range);
    expect(csv).toContain('Input Tax Reversals (Purchase Credits),2,-50.00,-10.00');
    expect(csv).toContain('Output Tax Reversals (Returns),1,-20.00,-4.00');
    expect(csv).toContain('Net VAT Payable,,,"16.00"');
  });

  it('keeps zero VAT credits visible and handles empty periods', async () => {
    expect(await buildVatReportCsv('business-a', range)).toContain('Net VAT Payable,,,"0.00"');
    db.journalEntry.findMany.mockResolvedValue([{ referenceType: 'PURCHASE_RETURN_CREDIT', lines: [line('1200', 0, 1000)] }]);
    expect(await buildVatReportCsv('business-a', range)).toContain('Input Tax Reversals (Purchase Credits),1,-10.00,0.00');
  });
});
