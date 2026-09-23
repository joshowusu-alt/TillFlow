import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { receivableDocumentBalance, sumReceivableBalances } from './receivables-balance';
import { payableDocumentBalance, sumPayableBalances } from './payables-balance';

describe('receivables balance', () => {
  const invoice = {
    paymentStatus: 'PART_PAID',
    totalPence: 10_000,
    payments: [
      { amountPence: 4_000, status: 'CONFIRMED' },
      { amountPence: 9_000, status: 'PENDING_MANUAL' },
      { amountPence: 1_000, status: 'FAILED' },
      { amountPence: 1_000, status: 'CANCELLED' },
      { amountPence: 1_000, status: 'VOID' },
      { amountPence: 1_000, status: 'PENDING' },
    ],
  };

  it('lets only CONFIRMED payments reduce the balance', () => {
    const balance = receivableDocumentBalance(invoice);
    expect(balance.paidPence).toBe(4_000);
    expect(balance.balancePence).toBe(6_000);
    expect(balance.excessPence).toBe(0);
  });

  it('keeps RETURNED and VOID at zero and keeps PARTIAL open', () => {
    expect(receivableDocumentBalance({ ...invoice, paymentStatus: 'RETURNED' }).balancePence).toBe(0);
    expect(receivableDocumentBalance({ ...invoice, paymentStatus: 'VOID' }).balancePence).toBe(0);
    expect(receivableDocumentBalance({ ...invoice, paymentStatus: 'PARTIAL' }).balancePence).toBe(6_000);
  });

  it('exposes an existing confirmed excess instead of a silent zero', () => {
    const balance = receivableDocumentBalance({
      paymentStatus: 'PAID',
      totalPence: 5_000,
      payments: [{ amountPence: 7_000, status: 'CONFIRMED' }],
    });
    expect(balance.balancePence).toBe(-2_000);
    expect(balance.excessPence).toBe(2_000);
    expect(balance.balancePence).not.toBe(0);
  });

  it('makes the list total the sum of source-document balances, including older invoices', () => {
    const documents = [
      invoice,
      { paymentStatus: 'UNPAID', totalPence: 3_000, payments: [], createdDaysAgo: 120 },
    ];
    expect(sumReceivableBalances(documents)).toBe(6_000 + 3_000);
  });
});

describe('payables balance', () => {
  it('counts every stored supplier payment and does not subtract a return refund again', () => {
    const open = payableDocumentBalance({
      paymentStatus: 'PART_PAID',
      totalPence: 8_000,
      payments: [{ amountPence: 3_000 }],
      refundAmountPence: 3_000,
    });
    expect(open.paidPence).toBe(3_000);
    expect(open.balancePence).toBe(5_000);

    const returned = payableDocumentBalance({
      paymentStatus: 'RETURNED',
      totalPence: 8_000,
      payments: [{ amountPence: 3_000 }],
      refundAmountPence: 3_000,
    });
    expect(returned.balancePence).toBe(0);
    expect(returned.paidPence).toBe(0);
  });

  it('keeps PARTIAL open and exposes a pre-existing excess', () => {
    expect(payableDocumentBalance({
      paymentStatus: 'PARTIAL',
      totalPence: 8_000,
      payments: [{ amountPence: 1_000 }],
    }).balancePence).toBe(7_000);
    const excess = payableDocumentBalance({
      paymentStatus: 'PAID',
      totalPence: 4_000,
      payments: [{ amountPence: 5_500 }],
    });
    expect(excess.balancePence).toBe(-1_500);
    expect(excess.excessPence).toBe(1_500);
  });

  it('sums source documents without a 90-day cutoff', () => {
    expect(sumPayableBalances([
      { paymentStatus: 'UNPAID', totalPence: 2_000, payments: [] },
      { paymentStatus: 'UNPAID', totalPence: 9_000, payments: [] },
    ])).toBe(11_000);
  });
});

describe('statement callers use the helpers', () => {
  it('customer and supplier statements do not reimplement a status-blind cap', () => {
    const customer = readFileSync(resolve(process.cwd(), 'app/(protected)/customers/[id]/statement/route.ts'), 'utf8');
    const supplier = readFileSync(resolve(process.cwd(), 'app/(protected)/suppliers/[id]/statement/route.ts'), 'utf8');
    expect(customer).toContain('receivableDocumentBalance');
    expect(supplier).toContain('payableDocumentBalance');
    expect(customer).not.toContain('Math.max(invoice.totalPence - paid, 0)');
    expect(supplier).not.toContain('Math.max(invoice.totalPence - paid, 0)');
  });
});
