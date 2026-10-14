import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({ open: vi.fn(), cashflow: vi.fn() }));
vi.mock('@/lib/entitlements/live-report', () => ({ openLiveReport: mocks.open }));
vi.mock('@/lib/reports/financials', () => ({ getCashflow: mocks.cashflow }));
vi.mock('@/components/DownloadLink', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/components/reports/ReportsRefresh', () => ({ default: () => null }));
import Page from './page';
describe('cash-flow report and supporting detail', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-04-02T10:00:00Z')); vi.clearAllMocks();
    mocks.open.mockResolvedValue({ ok: true, business: { id: 'biz', currency: 'GHS', timezone: 'Africa/Nairobi' }, decision: {}, branch: { kind: 'label' }, readOnly: false });
    mocks.cashflow.mockResolvedValue({ netProfit: 300, excludedProfit: 0, adjustments: [{ key: '1100', label: 'Customer balances', amountPence: -100 }],
      netCashFromOps: 200, directOperatingPence: 200, beginningCash: 500, endingCash: 700,
      investingPence: 0, financingPence: 0, openingEntriesPence: 0, otherPence: 0, otherEntryCount: 0,
      operatingDifferencePence: 0, movementDifferencePence: 0,
      directRows: [{ key: 'Customers-in', label: 'Customers — money received', amountPence: 200 }], money: { netMovementPence: 200 } });
  });
  afterEach(() => vi.useRealTimers());
  it('shows indirect first, expandable direct detail and separate exports for the same period', async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: { from: '2026-03-01', to: '2026-03-31' } }));
    expect(html).toContain('Indirect method'); expect(html).toContain('<details');
    expect(html.indexOf('Net profit from posted entries')).toBeLessThan(html.indexOf('Money received and paid'));
    expect(html).toContain('Customers — money received'); expect(html).toContain('view=direct');
    expect(html).toContain('Closing cash, bank and MoMo'); expect(html).toContain('7.00');
    expect(html).not.toContain('unverified'); expect(html).not.toContain('Report notes');
    expect(mocks.cashflow).toHaveBeenCalledWith('biz', new Date('2026-02-28T21:00:00Z'), new Date('2026-03-31T21:00:00Z'));
  });
  it('uses the permitted range and stops today at request time', async () => {
    mocks.open.mockResolvedValue({ ok: true, business: { id: 'biz', currency: 'GHS', timezone: 'Africa/Nairobi' }, decision: { appliedRange: { fromLocalDate: '2026-04-01', toLocalDate: '2026-04-02' } } });
    await Page({ searchParams: { from: '2020-01-01', to: '2026-04-02' } });
    expect(mocks.cashflow).toHaveBeenCalledWith('biz', new Date('2026-03-31T21:00:00Z'), new Date('2026-04-02T10:00:00Z'));
  });
  it('defaults to the new business-local month while UTC is still in the previous month', async () => {
    vi.setSystemTime(new Date('2026-03-31T22:00:00Z'));
    await Page({});
    expect(mocks.cashflow).toHaveBeenCalledWith('biz', new Date('2026-03-31T21:00:00Z'), new Date('2026-03-31T22:00:00Z'));
  });
  it('shows a specific missing-sale-cost note without hiding recorded cash', async () => {
    const fixture = await mocks.cashflow(); mocks.cashflow.mockResolvedValue({ ...fixture, missingSaleCostCount: 1 });
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain('Some sales have no product cost entry');
    expect(html).toContain('7.00');
  });
  it('shows specific entry differences below the figures without changing closing cash', async () => {
    const fixture = await mocks.cashflow();
    mocks.cashflow.mockResolvedValue({ ...fixture, operatingDifferencePence: 10, otherEntryCount: 1 });
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain('Entry difference'); expect(html).toContain('entry is');
    expect(html).toContain('7.00');
  });
  it('never loads numbers on access denial', async () => {
    mocks.open.mockResolvedValue({ ok: false, denial: <p>Access denied</p> });
    expect(renderToStaticMarkup(await Page({}))).toContain('Access denied');
    expect(mocks.cashflow).not.toHaveBeenCalled();
  });
  it.each([['2026-02-30', '2026-03-31'], ['2026-04-03', '2026-04-03'], ['2026-03-31', '2026-03-01']])('rejects invalid, future and reversed dates', async (from, to) => {
    expect(renderToStaticMarkup(await Page({ searchParams: { from, to } }))).toContain('Choose a valid period');
    expect(mocks.cashflow).not.toHaveBeenCalled();
  });
});
