import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { todayDetailHref } from '@/lib/reports/today/stage3a-nav';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import AnalyticsClient from '@/app/(protected)/reports/analytics/AnalyticsClient';
import { ownerInsightCopy, ownerPeriodLabels, resolveLastFullCalendarMonthPair } from '@/lib/reports/business-movement';

vi.mock('@/components/charts', () => ({
  SalesTrendChart: () => <canvas />, ComparisonChart: () => <canvas />,
  CategoryBreakdown: () => <canvas />, ProductPerformance: () => <canvas />, HourlyHeatmap: () => <div />,
}));

it('Analytics accessible chart figures preserve money units and hourly counts', () => {
  const markup = renderToStaticMarkup(<AnalyticsClient data={{
    currency: 'GHS', periodDays: 7,
    salesTrend: { labels: ['Mon'], values: [150_000] }, profitTrend: { labels: [], values: [] },
    hourlyData: [{ day: 'Mon', hour: 10, sales: 4 }], categoryData: [], productData: [],
    comparison: { labels: ['Mon'], current: [150_000], previous: [100_000] },
    kpis: { totalSales: 150_000, totalProfit: null, marginPercent: null, totalTransactions: 4,
      avgTransaction: 37_500, growthPercent: 50, previousPeriodSales: 100_000, topSellingProduct: '', peakHour: '10:00' },
  }} />);
  const root = document.createElement('div'); root.innerHTML = markup;
  const hourly = root.querySelector('[aria-label="Sales by hour and day figures"]')!;
  expect(hourly.textContent).toContain('Sales count');
  expect(hourly.querySelector('tbody')!.textContent).toBe('Mon10:004');
  expect(root.querySelector('[aria-label="Revenue trend figures"]')!.textContent).toContain('1,500.00');
  expect(root.querySelector('[aria-label="Period comparison figures"]')!.textContent).toContain('1,000.00');
  expect(root.querySelectorAll('[role="img"]')).toHaveLength(5);
  expect(markup).toContain('Costs incomplete');
});

describe('Business Movement customer evidence', () => {
  it('translates internal date and quantity terms without altering the insight', () => {
    const labels = ownerPeriodLabels(resolveLastFullCalendarMonthPair({ timeZone: 'Africa/Accra', asOf: new Date('2026-08-12T12:00:00Z') }));
    const insight = { fact: 'Sales changed', evidence: 'Invoice sales (createdAt); tx 76; qty 5; Δ 20.', signal: 'This SKU changed.', recommendedCheck: 'Check productId', category: 'sales_growth', confidence: 'high' } as Parameters<typeof ownerInsightCopy>[0];
    const copy = ownerInsightCopy(insight, labels);
    expect(copy.evidence).toBe('Invoice sales (by invoice date); sales 76; quantity 5; change 20.');
    expect(copy.signal).toBe('This product changed.');
    expect(insight.evidence).toContain('createdAt');
  });
});

it('Today drill-downs keep the tenant-local day and branch instead of the seven-day default', () => {
  const day = formatBusinessLocalDateKey(new Date('2026-06-30T23:30:00Z'), 'Europe/London');
  for (const route of ['dashboard', 'money-received', 'cash-drawer']) {
    const target = new URL(todayDetailHref(`/reports/${route}`, day, 'owned-branch'), 'https://tillflow.local');
    expect(target.searchParams.get('from')).toBe('2026-07-01');
    expect(target.searchParams.get('to')).toBe('2026-07-01');
    expect(target.searchParams.get('storeId')).toBe('owned-branch');
  }
  expect(todayDetailHref('/reports/money-received', day, 'ALL')).toContain('storeId=ALL');
});
