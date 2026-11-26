import { describe, expect, it } from 'vitest';
import { purchasePaymentMethod, purchaseStatus } from './presentation';

describe('purchase wording', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  const past = new Date('2026-11-01T12:00:00Z');
  const invoice = { paymentStatus: 'UNPAID', totalPence: 1000, payments: [], dueDate: null };
  it('uses the actual balance and never marks a fully paid purchase overdue', () => {
    expect(purchaseStatus({...invoice, dueDate: past, payments: [{amountPence: 1000}]}, now)).toBe('Paid');
    expect(purchaseStatus({...invoice, creditAppliedPence: 1000, dueDate: past}, now)).toBe('Paid');
    expect(purchaseStatus({...invoice, payments: [{amountPence: 100}]}, now)).toBe('Part paid');
    expect(purchaseStatus(invoice, now)).toBe('Owing');
    expect(purchaseStatus({...invoice, dueDate: past}, now)).toBe('Overdue');
  });
  it('uses ordinary payment names', () => {
    expect(purchasePaymentMethod('MOBILE_MONEY')).toBe('Mobile Money');
    expect(purchasePaymentMethod('TRANSFER')).toBe('Bank');
    expect(purchasePaymentMethod('CASH')).toBe('Cash');
  });
});
