import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import TodayScreen from '@/components/reports/today/TodayScreen';
import type { TodaySnapshot } from '@/lib/reports/today/load';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

function snapshot(overrides: Partial<TodaySnapshot> = {}): TodaySnapshot {
  return {
    readCount: 7,
    salesTodayPence: 150000,
    salesCount: 4,
    yesterdayPence: 80000,
    days: [
      { key: '2026-09-30', label: 'Wed', salesPence: 150000 },
    ],
    moneyReceivedPence: 120000,
    methods: [{ method: 'CASH', label: 'Cash', amountPence: 120000 }],
    cashDifferencePence: -400,
    comparison: null,
    branches: null,
    profit: { state: 'incomplete', grossProfitPence: null },
    topProducts: [{ name: 'Rice', salesPence: 50000 }],
    attention: [{
      rank: 2,
      severity: 'high',
      title: 'Cash counted is GH₵5.00 less than expected',
      detail: 'Front · Accra',
      action: 'Review cash',
      href: '/reports/cash-drawer?from=2026-09-30&to=2026-09-30&storeId=store-1',
      occurredAt: '2026-09-30T18:00:00.000Z',
    }],
    ...overrides,
  };
}

function html(overrides: Partial<Parameters<typeof TodayScreen>[0]> = {}) {
  return renderToStaticMarkup(
    <TodayScreen
      section="today"
      scopeLabel="Accra"
      dateLabel="Wednesday 30 September 2026 · Local time"
      zoneName="GMT"
      updatedLabel="12:00"
      readOnly={false}
      currency="GHS"
      storeId="store-1"
      links={[]}
      salesHref="/reports/dashboard?from=2026-09-30&to=2026-09-30&storeId=store-1"
      snapshot={snapshot()}
      blocked={null}
      failed={false}
      {...overrides}
    />,
  );
}

describe('Today screen', () => {
  it('shows sales, money received and a small cash difference without calling it an error', () => {
    const markup = html();
    expect(markup).toContain('GH₵1,500.00');
    expect(markup).toContain('Money received');
    expect(markup).toContain('GH₵1,200.00');
    expect(markup).toContain('−GH₵4.00');
    expect(markup).toContain('More reports');
    expect(markup).toContain('>More<');
    expect(markup).toContain('Review cash');
    expect(markup).toContain('/reports/cash-drawer?from=2026-09-30');
    expect(markup).not.toContain('<details open');
    expect(markup).toContain('How Today is calculated');
    expect(markup).toContain('Profit is hidden because some product costs are missing.');
    expect(markup).toContain('overflow-x-hidden');
    expect(markup).toContain('min-h-11');
  });

  it('shows the empty, restricted, failed and blocked states without substitute figures', () => {
    const empty = html({
      snapshot: snapshot({
        salesTodayPence: 0,
        salesCount: 0,
        yesterdayPence: 0,
        moneyReceivedPence: 0,
        methods: [],
        cashDifferencePence: null,
        profit: { state: 'omitted', grossProfitPence: null },
        topProducts: [],
        attention: [],
      }),
    });
    expect(empty).toContain('No sales recorded yet today');
    expect(empty).toContain('No sales yesterday.');
    expect(empty).toContain('No confirmed payments yet today');
    expect(empty).toContain('No till has been closed today');
    expect(empty).toContain('Nothing needs attention right now.');

    const restricted = html({ readOnly: true });
    expect(restricted).toContain('Read-only. You can look at reports. Downloads and changes stay off until billing is sorted.');

    const failed = html({ failed: true, snapshot: null });
    expect(failed).toContain('Today could not be loaded');
    expect(failed).toContain('Retry');
    expect(failed).not.toContain('GH₵');

    const blocked = html({
      snapshot: null,
      blocked: {
        title: 'All branches is part of Pro',
        body: 'This plan reports on one branch. No combined total is shown.',
        href: '/reports',
        action: 'View this branch',
      },
    });
    expect(blocked).toContain('All branches is part of Pro');
    expect(blocked).not.toContain('GH₵');
  });

  it('uses the desktop and mobile labels on the activity landing', () => {
    const markup = html({
      section: 'activity',
      snapshot: null,
      links: [{ href: '/reports/dashboard?storeId=store-1', label: 'Trading', purpose: 'Sales for a period you choose', group: 'Reports' }],
    });
    expect(markup).toContain('Trading');
    expect(markup).toContain('More reports');
    expect(markup).not.toContain('GH₵');
    expect(markup).not.toContain('/reports/balance-sheet');
  });
});
