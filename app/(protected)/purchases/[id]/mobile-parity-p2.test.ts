import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('P2 purchase-detail mobile presentation', () => {
  const src = read('app/(protected)/purchases/[id]/page.tsx');
  const paymentForm = read('components/SupplierPaymentForm.tsx');

  it('adapts purchase lines and payment history for mobile without removing desktop tables', () => {
    expect(src).toContain('data-purchase-detail-lines');
    expect(src).toContain('data-purchase-detail-payments');
    expect(src).toContain('DataCard');
    expect(src).toContain('lg:hidden');
    expect(src).toContain('hidden overflow-x-auto lg:block');
    expect(src).toContain('Items purchased');
    expect(src).toContain('Payment history');
    expect(src).toContain('Unit Cost');
    expect(src).toContain('Recorded by');
  });

  it('preserves role gate and outstanding/total meanings from server values', () => {
    expect(src).toContain("requireBusiness(['MANAGER', 'OWNER'])");
    expect(src).toContain('invoice.payments.reduce');
    expect(src).toContain('invoice.totalPence - totalPaid');
    expect(src).toContain('formatMoney(invoice.totalPence');
    expect(src).toContain('formatMoney(outstanding');
  });

  it('keeps SupplierPaymentForm / PR #78 controls intact on the detail page', () => {
    expect(src).toContain('SupplierPaymentForm');
    expect(src).toContain('data-purchase-payment-form');
    expect(src).toContain('pb-28 lg:pb-6');
    expect(src).toContain('pb-24 lg:pb-0');
    expect(src).not.toContain('pb-24 sm:pb-6');
    expect(paymentForm).toContain('idempotencyKey');
    expect(paymentForm).toContain('recordSupplierPaymentAction');
    expect(paymentForm).not.toContain('freeze'); // freeze lives in the action/service layer
  });

  it('keeps bottom-nav clearance until lg where the mobile tab bar hides', () => {
    // Bottom tab bar uses lg:hidden; padding must not collapse at sm/md.
    expect(src).toMatch(/pb-28\s+lg:pb-6/);
    expect(src).toMatch(/pb-24\s+lg:pb-0/);
  });
});
