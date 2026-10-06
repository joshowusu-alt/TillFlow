import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnalyticsClient from '@/app/(protected)/reports/analytics/AnalyticsClient';
import TradingReportView from '@/components/reports/stage3b/TradingReportView';
import BusinessMovementReportView from '@/components/reports/stage3b/BusinessMovementReportView';
import BusyTradingTimes from '@/components/reports/stage3b/BusyTradingTimes';
import { stage3bAnalyticsFixture, stage3bTradingFixture } from '@/lib/reviews/reports-stage3b-fixtures';
import { ownerMovementFixture } from '@/lib/reviews/reports-owner-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/DownloadLink', () => ({ default: ({ href, disabled, children }: { href: string; disabled?: boolean; children: React.ReactNode }) => <button disabled={disabled} data-download-url={href}>{children}</button> }));

function movement(failed = false) {
  return renderToStaticMarkup(<BusinessMovementReportView result={{ ...ownerMovementFixture(), moneyQueryFailed: failed }} scopeLabel="Sample branch" choices={[{ id: 'sample-branch', name: 'Sample branch' }]} offerAll={false} selectedStoreId="sample-branch" selectedPreset="last_full_calendar_month" currentFromValue="2026-09-01" currentToValue="2026-09-30" exportQuery="preset=last_full_calendar_month&storeId=sample-branch" moneyQuery="from=2026-09-01&to=2026-09-30&storeId=sample-branch" />);
}

describe('Stage 3B presentation contracts', () => {
  it('separates screenshot-sized unlinked balances from named customer debt and ageing', () => {
    const html = renderToStaticMarkup(<TradingReportView data={stage3bTradingFixture('debt')} />);
    const root = document.createElement('div'); root.innerHTML = html;
    const debtMetric = [...root.querySelectorAll('[data-stage3b-metric]')].find(node => node.querySelector('dt')?.textContent === 'What customers owe overall');
    expect(debtMetric?.textContent).toContain('GH₵648.50');
    expect(debtMetric?.textContent).not.toContain('GH₵19,417.50');
    expect(html).toContain('Sale balances without a customer account');
    expect(html).toContain('GH₵18,769.00');
    expect(html).toContain('excluded from customer debt and ageing');
  });

  it('shows the ageing-to-net bridge without assigning excess payments to other invoices', () => {
    const data = stage3bTradingFixture('normal');
    data.outstandingAR = 650_000;
    data.customerDebt!.excess = 100_000;
    data.customerDebt.netBalance = 650_000;
    const html = renderToStaticMarkup(<TradingReportView data={data} />);
    expect(html).toContain('Less excess confirmed payments');
    expect(html).toContain('GH₵1,000.00');
    expect(html).toContain('GH₵6,500.00');
    expect(html).toContain('have not been reassigned');
  });

  it('does not let a different customer credit hide collectible debt', () => {
    const data = stage3bTradingFixture('normal');
    data.outstandingAR = 750_000;
    data.customerDebt.excess = 900_000;
    data.customerDebt.creditBalance = 900_000;
    data.customerDebt.netBalance = -150_000;
    const html = renderToStaticMarkup(<TradingReportView data={data} />);
    const root = document.createElement('div'); root.innerHTML = html;
    const due = [...root.querySelectorAll('[data-stage3b-metric]')].find(node => node.querySelector('dt')?.textContent === 'What customers owe overall');
    expect(due?.textContent).toContain('GH₵7,500.00');
    expect(html).toContain('Customer credit balances');
    expect(html).toContain('GH₵9,000.00');
    expect(html).toContain('−GH₵1,500.00');
  });
  it('distinguishes period figures from current debts without changing values', () => {
    const data = stage3bTradingFixture('normal');
    const html = renderToStaticMarkup(<TradingReportView data={data} />);
    expect(html.indexOf('Sales revenue')).toBeLessThan(html.indexOf('Current debts and stock'));
    expect(html).toContain('GH₵162,730.50');
    expect(html).toContain('GH₵164,766.50');
    expect(html).toContain('This is not branch net profit');
    expect(html).toContain('do not follow the selected report dates');
    expect(html).toContain('from=2026-09-01&amp;to=2026-09-30&amp;storeId=sample-branch');
    expect(html).toContain('/customers/sample-customer');
    expect(html).toContain('/products/rice');
  });

  it('withholds both trading profit figures for incomplete costs', () => {
    const html = renderToStaticMarkup(<TradingReportView data={stage3bTradingFixture('incomplete')} />);
    const root = document.createElement('div'); root.innerHTML = html;
    const profit = [...root.querySelectorAll('[data-stage3b-metric]')].filter(node => node.querySelector('dt')?.textContent === 'Gross profit' || node.querySelector('dt')?.textContent === 'Profit after business-wide expenses');
    expect(profit).toHaveLength(2);
    for (const node of profit) { expect(node.textContent).toContain('Costs incomplete'); expect(node.querySelector('[data-financial-amount]')).toBeNull(); }
  });

  it('keeps negative receipt amounts but omits shares', () => {
    const html = renderToStaticMarkup(<TradingReportView data={stage3bTradingFixture('negative')} />);
    expect(html).toContain('−GH₵500.00');
    expect(html).not.toContain('% of confirmed receipts');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('does not suggest 0% growth or missing costs when there are no sales', () => {
    const html = renderToStaticMarkup(<AnalyticsClient data={stage3bAnalyticsFixture('empty')} />);
    expect(html).toContain('No comparison base');
    expect(html).toContain('Percentage growth is not meaningful');
    expect(html).not.toContain('+0.0%');
    expect(html).not.toContain('Costs incomplete');
  });

  it('compares aggregate period totals instead of the misaligned daily series', () => {
    const data = stage3bAnalyticsFixture('normal');
    data.comparison.previous = [999_999_999];
    const html = renderToStaticMarkup(<AnalyticsClient data={data} />);
    const root = document.createElement('div'); root.innerHTML = html;
    const region = root.querySelector('[aria-label="Period comparison figures"]');
    expect(region?.textContent).toContain('8,134.80');
    expect(region?.textContent).not.toContain('9,999,999.99');
    expect(html).toContain('Category line subtotals');
    expect(html).not.toContain('Profit</th>');
  });

  it('lets a touch or keyboard select a weekday and hour for an exact sale count', () => {
    render(<BusyTradingTimes rows={stage3bAnalyticsFixture('normal').hourlyData} />);
    expect(screen.getByText('Mon 12:00–13:00 · 9 sales')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: 'Sat' } });
    fireEvent.change(screen.getByLabelText('Hour'), { target: { value: '10' } });
    expect(screen.getByText('Sat 10:00–11:00 · 20 sales')).toBeVisible();
  });

  it('withholds every movement payment figure and disables export on query failure', () => {
    const html = movement(true);
    const root = document.createElement('div'); root.innerHTML = html;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Payment figures could not be loaded');
    for (const node of root.querySelectorAll('[data-stage3b-metric]')) expect(node.querySelector('[data-financial-amount]')).toBeNull();
    expect(root.querySelector('button[data-download-url]')?.hasAttribute('disabled')).toBe(true);
    expect(html).toContain('GH₵162,730.50');
  });

  it('keeps movement comparison dates, all ranked product evidence and exact export scope', () => {
    const html = movement();
    expect(html).toContain('30 days'); expect(html).toContain('31 days');
    expect(html).toContain('2026-08-31');
    expect(html).toContain('All product figures');
    expect(html).toContain('Supporting figures');
    expect(html).toContain('preset=last_full_calendar_month&amp;storeId=sample-branch');
    expect(html).not.toContain('Strong signal');
  });
});
