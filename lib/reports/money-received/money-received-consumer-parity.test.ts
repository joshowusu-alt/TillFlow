import { describe, expect, it, vi } from 'vitest';

import {
  aggregateMoneyReceivedByMethod,
  aggregateMoneyReceivedPence,
  resolveMoneyReceivedScope,
} from '@/lib/reports/money-received';

describe('Canonical consumer parity', () => {
  it('aggregateMoneyReceivedByMethod matches money_received sum for identical scope', async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { method: 'CASH', _sum: { amountPence: 1000 } },
      { method: 'CARD', _sum: { amountPence: 500 } },
      { method: 'CHEQUE', _sum: { amountPence: 200 } },
    ]);
    const aggregate = vi.fn().mockResolvedValue({
      _sum: { amountPence: 1700 },
      _count: { id: 3 },
    });
    const db = { salesPayment: { groupBy, aggregate } } as any;
    const scope = resolveMoneyReceivedScope({
      businessId: 'biz-1',
      currency: 'GHS',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEndInclusive: new Date('2026-02-01T00:00:00.000Z'),
      absoluteBounds: true,
    });

    const methods = await aggregateMoneyReceivedByMethod(db, scope);
    const headline = await aggregateMoneyReceivedPence(db, scope);
    expect('queryFailed' in methods).toBe(false);
    if ('queryFailed' in methods) return;
    const methodSum = methods.reduce((s, r) => s + r.amountPence, 0);
    expect(methodSum).toBe(headline.moneyReceivedPence);
    expect(headline.moneyReceivedPence).toBe(1700);

    const where = groupBy.mock.calls[0][0].where;
    expect(where.status).toBe('CONFIRMED');
    expect(JSON.stringify(where)).not.toContain('RETURNED');
    expect(where.salesInvoice.businessId).toBe('biz-1');
  });

  it('weekly-digest and trading dashboard import canonical Money Received helpers', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = process.cwd();
    const weekly = readFileSync(join(root, 'lib/reports/weekly-digest.ts'), 'utf8');
    const today = readFileSync(join(root, 'lib/reports/today-kpis.ts'), 'utf8');
    const dash = readFileSync(
      join(root, 'app/(protected)/reports/dashboard/TradingDashboardContent.tsx'),
      'utf8',
    );
    const trading = readFileSync(join(root, 'lib/reports/money-received/trading-surface.ts'), 'utf8');
    expect(weekly).toContain('aggregateMoneyReceivedByMethod');
    expect(today).toContain('aggregateMoneyReceivedByMethod');
    expect(today).toContain('aggregateConfirmedReceiptsThroughAsOf');
    // Trading Dashboard uses getMoneyReceivedSummary from the canonical package
    // (trading-surface: CONFIRMED-only, no parent RETURNED/VOID exclusion).
    expect(dash).toContain('getMoneyReceivedSummary');
    expect(dash).toContain("from '@/lib/reports/money-received'");
    expect(trading).toContain("status: CONFIRMED_PAYMENT_STATUS");
    expect(trading).not.toContain('REPORTING_EXCLUDED_SALE_STATUSES');
    expect(weekly).not.toMatch(/salesPayment\.groupBy/);
    expect(dash).not.toMatch(/salesPayment\.groupBy/);
  });
});
