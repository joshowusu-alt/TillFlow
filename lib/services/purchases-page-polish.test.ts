import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('purchases page polish', () => {
  const pageSrc = readFileSync(join(process.cwd(), 'app/(protected)/purchases/page.tsx'), 'utf8');
  const formSrc = readFileSync(join(process.cwd(), 'app/(protected)/purchases/PurchaseFormClient.tsx'), 'utf8');
  const paymentSrc = readFileSync(join(process.cwd(), 'components/InlinePaymentForm.tsx'), 'utf8');

  it('purchases page component exists', () => {
    expect(pageSrc).toContain('export default async function PurchasesPage');
  });

  it('page subtitle is owner-friendly', () => {
    expect(pageSrc).toContain('Record deliveries once');
  });

  it('total invoices stat card is present', () => {
    expect(pageSrc).toContain('Total invoices');
    expect(pageSrc).toContain('purchaseCount');
    expect(pageSrc).toContain('Supplier deliveries recorded');
  });

  it('awaiting payment stat card is present', () => {
    expect(pageSrc).toContain('Awaiting payment');
    expect(pageSrc).toContain('unpaidCount');
  });

  it('receive stock details form does not have open attribute', () => {
    expect(pageSrc).toContain('<details className="details-mobile">');
    expect(pageSrc).not.toContain('<details className="details-mobile" open>');
  });

  it('record delivery summary label remains present', () => {
    expect(pageSrc).toContain('Record delivery');
  });

  it('outstanding column exists in desktop table header', () => {
    expect(pageSrc).toContain('<th>Outstanding</th>');
  });

  it('outstanding column exists in desktop table rows', () => {
    expect(pageSrc).toContain('Math.max(0, outstandingPence)');
  });

  it('desktop table empty state spans 8 columns', () => {
    expect(pageSrc).toContain('colSpan={8}');
  });

  it('desktop rows have hover polish', () => {
    expect(pageSrc).toContain('hover:-translate-y-px');
    expect(pageSrc).toContain('hover:bg-slate-50');
    expect(pageSrc).toContain('hover:shadow-card');
  });

  it('mobile purchase history cards have active scale', () => {
    expect(pageSrc).toContain('active:scale-[0.98]');
    expect(pageSrc).toContain('transition-transform duration-150');
    expect(pageSrc).toContain('motion-reduce:transition-none');
    expect(pageSrc).toContain('motion-reduce:active:scale-100');
  });

  it('return route remains available', () => {
    expect(pageSrc).toContain('/purchases/return/');
  });

  it('delete action remains available', () => {
    expect(pageSrc).toContain('DeletePurchaseButton');
  });

  it('inline payment form remains available', () => {
    expect(pageSrc).toContain('InlinePaymentForm');
  });

  it('does not add pointer or touch handlers', () => {
    expect(pageSrc).not.toContain('onPointerDown');
    expect(pageSrc).not.toContain('onTouchStart');
    expect(pageSrc).not.toContain('onTouchMove');
    expect(pageSrc).not.toContain('onTouchEnd');
  });

  it('PurchaseFormClient still references createPurchaseAction', () => {
    expect(formSrc).toContain('createPurchaseAction');
  });

  it('cart hidden inputs remain unchanged', () => {
    expect(formSrc).toContain('name="cart"');
    expect(formSrc).toContain('name="cashPaid"');
    expect(formSrc).toContain('name="cardPaid"');
    expect(formSrc).toContain('name="transferPaid"');
  });

  it('"Build purchase" has become "Add items"', () => {
    expect(formSrc).toContain('Add items');
    expect(formSrc).not.toContain('Build purchase');
  });

  it('"Receive Purchase" has become "Record purchase"', () => {
    expect(formSrc).toContain('Record purchase');
    expect(formSrc).not.toContain('Receive Purchase');
  });

  it('InlinePaymentForm uses Confirm and Cancel labels', () => {
    expect(paymentSrc).toContain('Confirm');
    expect(paymentSrc).toContain('Cancel');
    expect(paymentSrc).not.toContain('✓');
    expect(paymentSrc).not.toContain('✕');
  });

  it('InlinePaymentForm action handlers remain unchanged', () => {
    expect(paymentSrc).toContain('recordSupplierPaymentAction');
    expect(paymentSrc).toContain('recordCustomerPaymentAction');
    expect(paymentSrc).toContain('name="invoiceId"');
    expect(paymentSrc).toContain('name="amount"');
    expect(paymentSrc).toContain('name="paymentMethod"');
  });
});
