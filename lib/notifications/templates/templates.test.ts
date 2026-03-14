import { describe, expect, it } from 'vitest';

import { formatMoney } from '@/lib/format';
import { buildCashVarianceTemplate } from '@/lib/notifications/templates/cash-variance';
import { buildDebtorReminderTemplate } from '@/lib/notifications/templates/debtor-reminder';
import { buildLowStockAlertTemplate } from '@/lib/notifications/templates/low-stock';
import { buildVoidReturnAlertTemplate } from '@/lib/notifications/templates/void-return';

function getDeepLinkText(link: string) {
  return new URL(link).searchParams.get('text');
}

describe('buildLowStockAlertTemplate', () => {
  it('includes the business name, branch, grouped categories, item quantities, and deep link text', () => {
    const result = buildLowStockAlertTemplate({
      recipient: '233241234567',
      businessName: 'TillFlow Market',
      storeName: 'Airport Branch',
      items: [
        { categoryName: 'Beverages', productName: 'Cola', currentQty: 2, reorderQty: 8 },
        { categoryName: 'Beverages', productName: 'Water', currentQty: 5, reorderQty: 10 },
        { categoryName: 'Groceries', productName: 'Rice', currentQty: 1, reorderQty: 6 },
      ],
    });

    expect(result.text).toContain('TillFlow Market - Low Stock Alert');
    expect(result.text).toContain('Branch: Airport Branch');
    expect(result.text).toContain('Items at or below reorder level (3):');
    expect(result.text).toContain('Beverages:');
    expect(result.text).toContain('- Cola: 2 on hand / 8 reorder');
    expect(result.text).toContain('- Water: 5 on hand / 10 reorder');
    expect(result.text).toContain('Groceries:');
    expect(result.text).toContain('- Rice: 1 on hand / 6 reorder');
    expect(result.deepLink).toContain('https://wa.me/233241234567?text=');
    expect(getDeepLinkText(result.deepLink)).toBe(result.text);
  });

  it('renders cleanly when there are no low-stock items', () => {
    const result = buildLowStockAlertTemplate({
      recipient: null,
      businessName: 'TillFlow Market',
      items: [],
    });

    expect(result.text).toContain('Items at or below reorder level (0):');
    expect(result.text).not.toContain('Branch:');
    expect(result.deepLink).toContain('https://wa.me/?text=');
  });
});

describe('buildCashVarianceTemplate', () => {
  it('formats currency values, includes a positive variance sign, and shows the shift range', () => {
    const result = buildCashVarianceTemplate({
      recipient: '233241234567',
      businessName: 'TillFlow Market',
      cashierName: 'Ama',
      expectedCashPence: 120_000,
      actualCashPence: 135_500,
      variancePence: 15_500,
      shiftRangeLabel: '15 Jan 2024, 08:00 - 15 Jan 2024, 18:00',
      currency: 'GHS',
    });

    expect(result.text).toContain('TillFlow Market - Cash Variance Alert');
    expect(result.text).toContain('Cashier: Ama');
    expect(result.text).toContain('Shift: 15 Jan 2024, 08:00 - 15 Jan 2024, 18:00');
    expect(result.text).toContain(`Expected cash: ${formatMoney(120_000, 'GHS')}`);
    expect(result.text).toContain(`Actual cash: ${formatMoney(135_500, 'GHS')}`);
    expect(result.text).toContain(`Variance: +${formatMoney(15_500, 'GHS')}`);
  });

  it('uses the default currency and shows a negative variance sign when cash is short', () => {
    const result = buildCashVarianceTemplate({
      businessName: 'TillFlow Market',
      cashierName: 'Yaw',
      expectedCashPence: 200_000,
      actualCashPence: 180_000,
      variancePence: -20_000,
      shiftRangeLabel: 'Night shift',
    });

    expect(result.text).toContain(`Variance: -${formatMoney(20_000, 'GHS')}`);
    expect(result.deepLink).toContain('https://wa.me/?text=');
  });
});

describe('buildDebtorReminderTemplate', () => {
  it('includes the customer name, balance, aging days, and last payment date', () => {
    const result = buildDebtorReminderTemplate({
      recipient: '233241234567',
      businessName: 'TillFlow Market',
      customerName: 'Kojo Mensah',
      outstandingBalancePence: 45_500,
      lastPaymentDateLabel: '10 Jan 2024',
      agingDays: 14,
      currency: 'GHS',
    });

    expect(result.text).toContain('Hello Kojo Mensah,');
    expect(result.text).toContain('TillFlow Market is reminding you about your outstanding balance.');
    expect(result.text).toContain(`Outstanding balance: ${formatMoney(45_500, 'GHS')}`);
    expect(result.text).toContain('Last payment: 10 Jan 2024');
    expect(result.text).toContain('Aging: 14 days');
  });

  it('supports long names and singular aging text when optional recipient and currency are omitted', () => {
    const longName = 'Nhyira Discount Wholesale Customer Account - Industrial Area';
    const result = buildDebtorReminderTemplate({
      businessName: 'TillFlow Market',
      customerName: longName,
      outstandingBalancePence: 10_000,
      lastPaymentDateLabel: 'No payment recorded',
      agingDays: 1,
    });

    expect(result.text).toContain(`Hello ${longName},`);
    expect(result.text).toContain('Aging: 1 day');
    expect(result.deepLink).toContain('https://wa.me/?text=');
  });
});

describe('buildVoidReturnAlertTemplate', () => {
  it('renders a VOID alert with invoice details and an item list', () => {
    const result = buildVoidReturnAlertTemplate({
      recipient: '233241234567',
      businessName: 'TillFlow Market',
      kind: 'VOID',
      cashierName: 'Ama',
      invoiceNumber: 'INV-123',
      amountPence: 250_000,
      items: ['2 x Cola', '1 x Rice'],
      reason: 'Customer entered duplicate sale',
      currency: 'GHS',
    });

    expect(result.text).toContain('TillFlow Market - Large Void Alert');
    expect(result.text).toContain('Invoice: INV-123');
    expect(result.text).toContain(`Void amount: ${formatMoney(250_000, 'GHS')}`);
    expect(result.text).toContain('- 2 x Cola');
    expect(result.text).toContain('- 1 x Rice');
  });

  it('renders a RETURN alert, preserves long names, and shows a fallback when items are missing', () => {
    const longCashierName = 'Akosua Frimpong-Sarpong (Senior Supervisor, Ring Road Central)';
    const result = buildVoidReturnAlertTemplate({
      businessName: 'TillFlow Market',
      kind: 'RETURN',
      cashierName: longCashierName,
      invoiceNumber: 'INV-456',
      amountPence: 85_000,
      items: [],
      reason: 'Damaged stock',
    });

    expect(result.text).toContain('TillFlow Market - Large Return Alert');
    expect(result.text).toContain(`Cashier: ${longCashierName}`);
    expect(result.text).toContain(`Return amount: ${formatMoney(85_000, 'GHS')}`);
    expect(result.text).toContain('- No items recorded');
    expect(result.deepLink).toContain('https://wa.me/?text=');
  });
});
