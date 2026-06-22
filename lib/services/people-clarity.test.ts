import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Customer and Supplier reporting clarity', () => {
  const customerListSrc   = readFileSync(join(process.cwd(), 'app/(protected)/customers/page.tsx'), 'utf8');
  const supplierListSrc   = readFileSync(join(process.cwd(), 'app/(protected)/suppliers/page.tsx'), 'utf8');
  const customerReceiptsSrc = readFileSync(join(process.cwd(), 'app/(protected)/payments/customer-receipts/page.tsx'), 'utf8');
  const supplierPaymentsSrc = readFileSync(join(process.cwd(), 'app/(protected)/payments/supplier-payments/page.tsx'), 'utf8');
  const customerDetailSrc = readFileSync(join(process.cwd(), 'app/(protected)/customers/[id]/page.tsx'), 'utf8');
  const supplierDetailSrc = readFileSync(join(process.cwd(), 'app/(protected)/suppliers/[id]/page.tsx'), 'utf8');
  const supplierAgingSrc  = readFileSync(join(process.cwd(), 'app/(protected)/payments/supplier-aging/page.tsx'), 'utf8');
  const agingServiceSrc   = readFileSync(join(process.cwd(), 'lib/services/supplier-aging.ts'), 'utf8');
  const customerPaymentActionSrc = readFileSync(join(process.cwd(), 'app/actions/payments.ts'), 'utf8');

  // ── Customer list page ──────────────────────────────────────────────────
  it('1. Customer list page component exists', () => {
    expect(customerListSrc).toContain('export default async function CustomersPage');
  });

  it('2. "What customers owe" label is present', () => {
    expect(customerListSrc).toContain('What customers owe');
  });

  it('3. "Total AR outstanding" is no longer present', () => {
    expect(customerListSrc).not.toContain('Total AR outstanding');
  });

  it('4. "AR outstanding" is no longer present', () => {
    expect(customerListSrc).not.toContain('AR outstanding');
  });

  it('5. Current-balance scope note is present', () => {
    expect(customerListSrc).toContain('current customer balances');
    expect(customerListSrc).toContain('not limited to a date range');
  });

  it('6. "Balance due only" filter remains present', () => {
    expect(customerListSrc).toContain('Balance due only');
    expect(customerListSrc).toContain('balanceDue=1');
  });

  // ── Supplier list page ──────────────────────────────────────────────────
  it('7. Supplier list page component exists', () => {
    expect(supplierListSrc).toContain('export default async function SuppliersPage');
  });

  it('8. "What you owe suppliers" label is present', () => {
    expect(supplierListSrc).toContain('What you owe suppliers');
  });

  it('9. "Total AP outstanding" is no longer present', () => {
    expect(supplierListSrc).not.toContain('Total AP outstanding');
  });

  it('10. "AP outstanding" is no longer present', () => {
    expect(supplierListSrc).not.toContain('AP outstanding');
  });

  it('11. "Amount owed only" filter remains present', () => {
    expect(supplierListSrc).toContain('Amount owed only');
    expect(supplierListSrc).toContain('amountOwed=1');
  });

  // ── Customer receipts page ─────────────────────────────────────────────
  it('12. Customer receipts page component exists', () => {
    expect(customerReceiptsSrc).toContain('export default async function CustomerReceiptsPage');
  });

  it('13. "Record customer payment" heading remains present', () => {
    expect(customerReceiptsSrc).toContain('Record customer payment');
  });

  it('14. "Mobile Money (MoMo)" option label is present', () => {
    expect(customerReceiptsSrc).toContain('Mobile Money (MoMo)');
  });

  it('15. "Bank Transfer" option label is present', () => {
    expect(customerReceiptsSrc).toContain('Bank Transfer');
  });

  it('16. value="TRANSFER" remains present (form value unchanged)', () => {
    expect(customerReceiptsSrc).toContain('value="TRANSFER"');
  });

  it('17. value="MOBILE_MONEY" remains present (form value unchanged)', () => {
    expect(customerReceiptsSrc).toContain('value="MOBILE_MONEY"');
  });

  it('18. Recent payments do not display raw "MOBILE_MONEY" or "TRANSFER" strings as text', () => {
    expect(customerReceiptsSrc).not.toContain('{payment.method}');
  });

  it('19. recordCustomerPaymentAction import remains unchanged', () => {
    expect(customerReceiptsSrc).toContain("from '@/app/actions/payments'");
    expect(customerReceiptsSrc).toContain('recordCustomerPaymentAction');
  });

  // ── Supplier payments page ─────────────────────────────────────────────
  it('20. Supplier payments page component exists', () => {
    expect(supplierPaymentsSrc).toContain('export default async function SupplierPaymentsPage');
  });

  it('21. "Record supplier payment" heading remains present', () => {
    expect(supplierPaymentsSrc).toContain('Record supplier payment');
  });

  it('22. "Mobile Money (MoMo)" option label is present', () => {
    expect(supplierPaymentsSrc).toContain('Mobile Money (MoMo)');
  });

  it('23. "Bank Transfer" option label is present', () => {
    expect(supplierPaymentsSrc).toContain('Bank Transfer');
  });

  it('24. value="TRANSFER" remains present (form value unchanged)', () => {
    expect(supplierPaymentsSrc).toContain('value="TRANSFER"');
  });

  it('25. value="MOBILE_MONEY" remains present (form value unchanged)', () => {
    expect(supplierPaymentsSrc).toContain('value="MOBILE_MONEY"');
  });

  it('26. Recent payments do not display raw payment method strings as text', () => {
    expect(supplierPaymentsSrc).not.toContain('{payment.method}');
  });

  it('27. recordSupplierPaymentAction import remains unchanged', () => {
    expect(supplierPaymentsSrc).toContain("from '@/app/actions/payments'");
    expect(supplierPaymentsSrc).toContain('recordSupplierPaymentAction');
  });

  // ── Customer detail page ───────────────────────────────────────────────
  it('28. Customer detail page component exists', () => {
    expect(customerDetailSrc).toContain('export default async function CustomerDetailPage');
  });

  it('29. Raw "UNPAID" and "PART_PAID" are not rendered directly as status labels', () => {
    expect(customerDetailSrc).not.toContain('{invoice.paymentStatus}');
  });

  it('30. "Unpaid" and "Partially paid" human labels are present', () => {
    expect(customerDetailSrc).toContain("UNPAID: 'Unpaid'");
    expect(customerDetailSrc).toContain("PART_PAID: 'Partially paid'");
  });

  it('31. Ledger descriptions do not use raw lowercase method formatting', () => {
    expect(customerDetailSrc).not.toContain("payment.method.toLowerCase().replace('_', ' ')");
  });

  it('32. "Mobile Money (MoMo)" appears in payment method label map', () => {
    expect(customerDetailSrc).toContain("MOBILE_MONEY: 'Mobile Money (MoMo)'");
  });

  it('33. computeOutstandingBalance import remains unchanged', () => {
    expect(customerDetailSrc).toContain("from '@/lib/accounting'");
    expect(customerDetailSrc).toContain('computeOutstandingBalance');
  });

  // ── Supplier detail page ───────────────────────────────────────────────
  it('34. Supplier detail page component exists', () => {
    expect(supplierDetailSrc).toContain('export default async function SupplierDetailPage');
  });

  it('35. Raw "UNPAID" and "PART_PAID" are not rendered directly as status labels', () => {
    expect(supplierDetailSrc).not.toContain('{invoice.paymentStatus}');
  });

  it('36. "Unpaid" and "Partially paid" human labels are present', () => {
    expect(supplierDetailSrc).toContain("UNPAID: 'Unpaid'");
    expect(supplierDetailSrc).toContain("PART_PAID: 'Partially paid'");
  });

  it('37. "Credit limit" label is present (not "Payment threshold")', () => {
    expect(supplierDetailSrc).toContain('label="Credit limit"');
  });

  it('38. "Payment threshold" is no longer present', () => {
    expect(supplierDetailSrc).not.toContain('Payment threshold');
  });

  it('39. "No limit set" helper is present', () => {
    expect(supplierDetailSrc).toContain('No limit set');
  });

  it('40. "No threshold set" is no longer present', () => {
    expect(supplierDetailSrc).not.toContain('No threshold set');
  });

  it('41. Ledger descriptions do not use raw lowercase method formatting', () => {
    expect(supplierDetailSrc).not.toContain("payment.method.toLowerCase().replace('_', ' ')");
  });

  it('42. "Purchases increase what you owe" helper remains present', () => {
    expect(supplierDetailSrc).toContain('Purchases increase what you owe');
  });

  it('43. computeOutstandingBalance import remains unchanged', () => {
    expect(supplierDetailSrc).toContain("from '@/lib/accounting'");
    expect(supplierDetailSrc).toContain('computeOutstandingBalance');
  });

  // ── Supplier aging page ────────────────────────────────────────────────
  it('44. Supplier aging page component exists', () => {
    expect(supplierAgingSrc).toContain('export default async function SupplierAgingPage');
  });

  it('45. "Record payment" link is present on supplier aging page', () => {
    expect(supplierAgingSrc).toContain('Record payment');
  });

  it('46. Link points to /payments/supplier-payments?supplierId=', () => {
    expect(supplierAgingSrc).toContain('/payments/supplier-payments?supplierId=');
  });

  it('47. AGING_BUCKET_LABELS from service are imported', () => {
    expect(supplierAgingSrc).toContain('AGING_BUCKET_LABELS');
  });

  it('48. AGING_BUCKETS from service are imported', () => {
    expect(supplierAgingSrc).toContain('AGING_BUCKETS');
  });

  it('49. Export route link remains unchanged', () => {
    expect(supplierAgingSrc).toContain('/payments/supplier-aging/export');
    expect(supplierAgingSrc).toContain('Export CSV');
  });

  it('50. "As of date" filter remains present', () => {
    expect(supplierAgingSrc).toContain('As of date');
    expect(supplierAgingSrc).toContain('name="asOf"');
  });

  it('51. getSupplierAgingReport import remains unchanged', () => {
    expect(supplierAgingSrc).toContain('getSupplierAgingReport');
    expect(supplierAgingSrc).toContain("from '@/lib/services/supplier-aging'");
  });

  // ── Supplier aging service untouched ────────────────────────────────────
  it('52. Supplier aging service calculations are unchanged', () => {
    expect(agingServiceSrc).toContain('getSupplierAgingReport');
    expect(agingServiceSrc).toContain('AGING_BUCKET_LABELS');
    expect(agingServiceSrc).toContain('bucketForDaysOverdue');
  });

  // ── Safety: no touch/pointer handlers added ──────────────────────────────
  it('53. No touch or pointer handlers added to customer list', () => {
    expect(customerListSrc).not.toContain('onPointerDown');
    expect(customerListSrc).not.toContain('onTouchStart');
  });

  it('54. No touch or pointer handlers added to supplier list', () => {
    expect(supplierListSrc).not.toContain('onPointerDown');
    expect(supplierListSrc).not.toContain('onTouchStart');
  });

  it('55. No touch or pointer handlers added to supplier aging', () => {
    expect(supplierAgingSrc).not.toContain('onPointerDown');
    expect(supplierAgingSrc).not.toContain('onTouchStart');
  });

  it('56. Payment action file still contains both action handlers', () => {
    expect(customerPaymentActionSrc).toContain('recordCustomerPaymentAction');
    expect(customerPaymentActionSrc).toContain('recordSupplierPaymentAction');
  });

  it('57. Supplier list current-balance scope note is present', () => {
    expect(supplierListSrc).toContain('current supplier balances');
    expect(supplierListSrc).toContain('not limited to a date range');
  });

  it('58. Customer receipts PAYMENT_LABEL map covers all four methods', () => {
    expect(customerReceiptsSrc).toContain("CASH: 'Cash'");
    expect(customerReceiptsSrc).toContain("CARD: 'Card'");
    expect(customerReceiptsSrc).toContain("TRANSFER: 'Bank Transfer'");
    expect(customerReceiptsSrc).toContain("MOBILE_MONEY: 'Mobile Money (MoMo)'");
  });

  it('59. Supplier payments PAYMENT_LABEL map covers all four methods', () => {
    expect(supplierPaymentsSrc).toContain("CASH: 'Cash'");
    expect(supplierPaymentsSrc).toContain("CARD: 'Card'");
    expect(supplierPaymentsSrc).toContain("TRANSFER: 'Bank Transfer'");
    expect(supplierPaymentsSrc).toContain("MOBILE_MONEY: 'Mobile Money (MoMo)'");
  });
});
