import { describe, expect, it } from 'vitest';
import { reconcileCustomerDebt } from './customer-debt-reconciliation';

const customer = { id: 'synthetic-customer', name: 'Synthetic customer' };
const invoice = (totalPence: number, linked = true, payments: { amountPence: number; status: string }[] = [], paymentStatus = 'UNPAID') => ({ totalPence, customer: linked ? customer : null, payments, paymentStatus });

describe('customer debt reconciliation', () => {
  it('reproduces the screenshot-sized difference with synthetic unlinked balances without losing money', () => {
    // This is a reproduction of the code defect, not an attribution of the live book.
    const result = reconcileCustomerDebt([
      invoice(64_850), invoice(42_000, false), invoice(873_950, false), invoice(960_950, false),
    ]);
    expect(result.customerBalancePence).toBe(64_850);
    expect(result.unlinkedDuePence).toBe(1_876_900);
    expect(result.documentBalancePence).toBe(1_941_750);
    expect(result.accounts).toEqual([{ ...customer, balancePence: 64_850 }]);
  });

  it('retains linked pending, failed, missing-status and paid-stamp shortfalls until receipts are confirmed', () => {
    const result = reconcileCustomerDebt([
      invoice(1000, true, [{ amountPence: 1000, status: 'PENDING_MANUAL' }]),
      invoice(1000, true, [{ amountPence: 1000, status: 'FAILED' }]),
      invoice(1000, true, [{ amountPence: 1000, status: undefined as unknown as string }]),
      invoice(1000, true, [{ amountPence: 400, status: 'CONFIRMED' }], 'PAID'),
    ]);
    expect(result.customerBalancePence).toBe(3600);
  });

  it('exposes credits separately and reconciles invoice ageing before credits to signed account balances', () => {
    const result = reconcileCustomerDebt([
      invoice(1000), invoice(500, true, [{ amountPence: 800, status: 'CONFIRMED' }], 'PAID'),
      invoice(200, false, [{ amountPence: 500, status: 'CONFIRMED' }], 'PAID'),
    ]);
    expect(result.customerInvoiceDuePence).toBe(1000);
    expect(result.customerExcessPence).toBe(300);
    expect(result.customerBalancePence).toBe(700);
    expect(result.accounts[0].balancePence).toBe(700);
    expect(result.unlinkedExcessPence).toBe(300);
    expect(result.documentBalancePence).toBe(400);
  });

  it('never hides a net credit or offsets one named customer in the largest-debtor list with another', () => {
    const result = reconcileCustomerDebt([
      invoice(1000), { ...invoice(500, true, [{ amountPence: 2000, status: 'CONFIRMED' }]), customer: { id: 'other', name: 'Other' } },
    ]);
    expect(result.customerBalancePence).toBe(-500);
    expect(result.customerDuePence).toBe(1000);
    expect(result.customerCreditPence).toBe(1500);
    expect(result.accounts.filter(account => account.balancePence > 0)).toEqual([{ ...customer, balancePence: 1000 }]);
  });

  it('excludes voided and fully returned documents, including their pending payments', () => {
    const result = reconcileCustomerDebt([invoice(1000, true, [], 'VOID'), invoice(2000, false, [], 'RETURNED')]);
    expect(result.documentBalancePence).toBe(0);
    expect(result.unlinkedInvoiceCount).toBe(0);
  });
});
