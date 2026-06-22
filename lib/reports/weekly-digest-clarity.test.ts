import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Weekly Digest clarity', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/reports/weekly-digest/page.tsx'), 'utf8');
  const serviceSrc = readFileSync(join(process.cwd(), 'lib/reports/weekly-digest.ts'), 'utf8');

  it('Weekly Digest page component exists', () => {
    expect(src).toContain('export default async function WeeklyDigestPage');
  });

  it('"Sales this week" label replaces "Weekly Sales"', () => {
    expect(src).toContain('Sales this week');
    expect(src).not.toContain('"Weekly Sales"');
  });

  it('"Average sale" label replaces "Avg. Transaction"', () => {
    expect(src).toContain('Average sale');
    expect(src).not.toContain('Avg. Transaction');
  });

  it('"How money came in" section heading replaces "Payment Receipts Split"', () => {
    expect(src).toContain('How money came in');
    expect(src).not.toContain('Payment Receipts Split');
  });

  it('"Profit before expenses" helper is present on Gross Profit stat card', () => {
    expect(src).toContain('Profit before expenses');
  });

  it('"Control checks by cashier" heading replaces "Risk Trends by Cashier"', () => {
    expect(src).toContain('Control checks by cashier');
    expect(src).not.toContain('Risk Trends by Cashier');
  });

  it('"Highest estimated margin items" heading replaces "Top Margin Items (est.)"', () => {
    expect(src).toContain('Highest estimated margin items');
    expect(src).not.toContain('Top Margin Items (est.)');
  });

  it('"Mobile Money (MoMo)" display label is present in payment method map', () => {
    expect(src).toContain('Mobile Money (MoMo)');
  });

  it('"Bank Transfer" display label is present in payment method map', () => {
    expect(src).toContain('Bank Transfer');
  });

  it('PAYMENT_LABEL map covers all four payment methods', () => {
    expect(src).toContain('PAYMENT_LABEL');
    expect(src).toContain("CASH: 'Cash'");
    expect(src).toContain("CARD: 'Card'");
    expect(src).toContain("MOBILE_MONEY: 'Mobile Money (MoMo)'");
    expect(src).toContain("TRANSFER: 'Bank Transfer'");
  });

  it('payment method display uses PAYMENT_LABEL lookup, not raw method string alone', () => {
    expect(src).toContain('PAYMENT_LABEL[method]');
  });

  it('trust copy says digest covers Monday to Sunday', () => {
    expect(src).toContain('Monday to Sunday');
  });

  it('trust copy says digest covers the whole business', () => {
    expect(src).toContain('whole business');
  });

  it('trust copy explains receipts may include older customer credit payments', () => {
    expect(src).toContain('Receipts may include payments for older customer credit');
  });

  it('page links to Trading Report for date and branch filtering', () => {
    expect(src).toContain('/reports/dashboard');
    expect(src).toContain('Trading Report');
  });

  it('"Week at a glance" section label is present', () => {
    expect(src).toContain('Week at a glance');
  });

  it('"Activity & control" section label is present', () => {
    expect(src).toContain('Activity & control');
  });

  it('CSV export route remains present and unchanged', () => {
    expect(src).toContain('/api/reports/weekly-digest');
    expect(src).toContain('Export CSV');
  });

  it('week navigation controls remain present', () => {
    expect(src).toContain('week=${weekOffset - 1}');
    expect(src).toContain('Prev Week');
  });

  it('weekly digest service import remains unchanged', () => {
    expect(src).toContain("from '@/lib/reports/weekly-digest'");
    expect(src).toContain('getWeeklyDigestData');
  });

  it('weekly digest service calculations are unchanged', () => {
    expect(serviceSrc).toContain('getWeeklyDigestData');
    expect(serviceSrc).toContain('totalSalesPence');
    expect(serviceSrc).toContain('grossProfitPence');
    expect(serviceSrc).toContain('totalReceiptsPence');
  });

  it('payment split calculation logic is unchanged', () => {
    expect(src).toContain('data.paymentSplit');
    expect(src).toContain('data.totalReceiptsPence');
    expect(src).toContain('amount / data.totalReceiptsPence');
  });

  it('week-over-week comparison section remains present', () => {
    expect(src).toContain('Week-over-Week');
    expect(src).toContain('salesChange');
    expect(src).toContain('gpChange');
    expect(src).toContain('txChange');
  });

  it('cashier performance section remains present', () => {
    expect(src).toContain('Cashier Performance');
    expect(src).toContain('data.cashierPerf');
  });

  it('top sellers section remains present', () => {
    expect(src).toContain('Top Sellers');
    expect(src).toContain('data.topSellers');
  });

  it('does not add touch or pointer handlers', () => {
    expect(src).not.toContain('onPointerDown');
    expect(src).not.toContain('onTouchStart');
    expect(src).not.toContain('onTouchMove');
    expect(src).not.toContain('onTouchEnd');
  });
});
