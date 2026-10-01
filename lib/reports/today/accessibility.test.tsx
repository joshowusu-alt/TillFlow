import { render } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import TodayScreen from '@/components/reports/today/TodayScreen';
import type { TodaySnapshot } from '@/lib/reports/today/model';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

function snapshot(): TodaySnapshot {
  return {
    readCount: 0,
    salesTodayPence: 0,
    salesCount: 0,
    yesterdayPence: 0,
    days: [{ key: '2026-09-30', label: 'Wed', salesPence: 0 }],
    moneyReceivedPence: 0,
    methods: [],
    cashDifferencePence: null,
    comparison: null,
    branches: null,
    profit: { state: 'omitted', grossProfitPence: null },
    topProducts: [],
    attention: [],
  };
}

describe('Today accessibility', () => {
  it('meets WCAG 2.1 A and AA on the quiet Today screen', async () => {
    const view = render(
      <TodayScreen
        section="today"
        scopeLabel="Main Branch"
        dateLabel="Wednesday 30 September 2026 · Local time"
        zoneName="GMT"
        updatedLabel="12:00"
        readOnly={false}
        currency="GHS"
        storeId="store-1"
        links={[]}
        exploreLinks={[{
          href: '/reports/dashboard',
          label: 'Trading',
          purpose: 'See sales for a period you choose.',
          group: 'Reports',
          iconKey: 'reports',
          explore: 'Understand sales',
        }]}
        nextActions={[{ href: '/pos', label: 'Open Sell' }]}
        salesHref={null}
        snapshot={snapshot()}
        blocked={null}
        failed={false}
      />,
    );
    const results = await axe.run(view.container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations.map((item) => `${item.id}: ${item.help}`)).toEqual([]);
    expect(view.container.querySelector('h1')).toBeTruthy();
    expect(view.getByRole('status').textContent).toMatch(/No sales have been recorded/);
    const sell = view.getByRole('link', { name: 'Open Sell' });
    sell.focus();
    expect(document.activeElement).toBe(sell);
    expect(view.container.scrollWidth).toBeLessThanOrEqual(view.container.clientWidth + 1);
  });

  it('names the failed load as an alert', async () => {
    const view = render(
      <TodayScreen
        section="today"
        scopeLabel="Main Branch"
        dateLabel="Wednesday 30 September 2026 · Local time"
        zoneName="GMT"
        updatedLabel=""
        readOnly={false}
        currency="GHS"
        storeId="store-1"
        links={[]}
        salesHref={null}
        snapshot={null}
        blocked={null}
        failed
      />,
    );
    expect(view.getByRole('alert').textContent).toMatch(/could not be loaded/);
    const results = await axe.run(view.container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations.map((item) => item.id)).toEqual([]);
  });
});
