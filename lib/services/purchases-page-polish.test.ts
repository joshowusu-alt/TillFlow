import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('purchases page polish', () => {
  const pageSrc = readFileSync(join(process.cwd(), 'app/(protected)/purchases/page.tsx'), 'utf8');
  const formSrc = readFileSync(join(process.cwd(), 'app/(protected)/purchases/PurchaseFormClient.tsx'), 'utf8');
  const paymentSrc = readFileSync(join(process.cwd(), 'components/InlinePaymentForm.tsx'), 'utf8');
  const btnSrc = readFileSync(join(process.cwd(), 'app/(protected)/purchases/RecordPurchaseButton.tsx'), 'utf8');
  const barcodeScanSrc = readFileSync(join(process.cwd(), 'components/BarcodeScanInput.tsx'), 'utf8');

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
    expect(pageSrc).toContain('details-mobile');
    expect(pageSrc).not.toContain('details-mobile" open>');
  });

  it('record purchase CTA is clearly visible at the top of the page', () => {
    expect(pageSrc).toContain('RecordPurchaseButton');
  });

  it('record purchase CTA appears before recent purchases section', () => {
    const ctaPos = pageSrc.indexOf('RecordPurchaseButton');
    const historyPos = pageSrc.indexOf('Recent purchases');
    expect(ctaPos).toBeGreaterThanOrEqual(0);
    expect(historyPos).toBeGreaterThanOrEqual(0);
    expect(ctaPos).toBeLessThan(historyPos);
  });

  it('record-purchase-form id exists on the details wrapper', () => {
    expect(pageSrc).toContain('id="record-purchase-form"');
  });

  it('CTA is a client component that opens the details element', () => {
    expect(btnSrc).toContain("'use client'");
    expect(btnSrc).toContain('record-purchase-form');
    expect(btnSrc).toContain('details.open = true');
    expect(btnSrc).toContain('scrollIntoView');
    expect(btnSrc).toContain('onClick');
  });

  it('CTA uses click only, no touch or pointer handlers', () => {
    expect(btnSrc).not.toContain('onPointerDown');
    expect(btnSrc).not.toContain('onTouchStart');
    expect(btnSrc).not.toContain('onTouchMove');
    expect(btnSrc).not.toContain('onTouchEnd');
  });

  it('page does not use a plain anchor to the form (client CTA instead)', () => {
    expect(pageSrc).not.toContain('href="#record-purchase-form"');
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
    expect(formSrc).not.toContain('onPointerDown');
    expect(formSrc).not.toContain('onTouchStart');
    expect(formSrc).not.toContain('onTouchMove');
    expect(formSrc).not.toContain('onTouchEnd');
    expect(barcodeScanSrc).not.toContain('onPointerDown');
    expect(barcodeScanSrc).not.toContain('onTouchStart');
    expect(barcodeScanSrc).not.toContain('onTouchMove');
    expect(barcodeScanSrc).not.toContain('onTouchEnd');
  });

  it('PurchaseFormClient still references createPurchaseAction', () => {
    expect(formSrc).toContain('createPurchaseAction');
  });

  it('barcode camera buttons have explicit accessible labels', () => {
    const purchaseScannerLabels = formSrc.match(/aria-label="Open barcode scanner"/g) ?? [];

    expect(purchaseScannerLabels).toHaveLength(2);
    expect(barcodeScanSrc).toContain('aria-label="Open barcode scanner"');
    expect(formSrc).toContain('title="Scan with camera"');
    expect(barcodeScanSrc).toContain('title="Scan with camera"');
  });

  it('barcode scanner logic remains wired to the same handlers', () => {
    expect(formSrc).toContain("import CameraScanner from '@/app/(protected)/pos/components/CameraScanner'");
    expect(formSrc).toContain('setQuickCameraOpen(true)');
    expect(formSrc).toContain('setLookupCameraOpen(true)');
    expect(formSrc).toContain('handleBarcodeLookup(code)');
    expect(formSrc).toContain('setQuickBarcode(code)');
    expect(barcodeScanSrc).toContain("import CameraScanner from '@/app/(protected)/pos/components/CameraScanner'");
    expect(barcodeScanSrc).toContain('setCameraOpen(true)');
    expect(barcodeScanSrc).toContain('handleChange(code)');
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
