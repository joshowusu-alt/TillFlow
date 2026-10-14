import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({ open: vi.fn(), sheet: vi.fn() }));
vi.mock('@/lib/entitlements/live-report', () => ({ openLiveReport: mocks.open }));
vi.mock('@/lib/reports/financials', () => ({ getBalanceSheet: mocks.sheet }));
vi.mock('@/components/DownloadLink', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/components/reports/ReportsRefresh', () => ({ default: () => null }));
import Page from './page';

describe('balance-sheet business presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-04-02T10:00:00Z')); vi.clearAllMocks();
    mocks.open.mockResolvedValue({ ok: true, business: { id: 'biz', currency: 'GHS', timezone: 'Africa/Nairobi' },
      decision: {}, branch: { kind: 'label', label: 'Whole business · all branches' }, readOnly: false });
    mocks.sheet.mockResolvedValue({ assets: [{ accountCode: '1010', name: 'Bank', balancePence: -100 }], liabilities: [], equity: [],
      totalAssets: -100, totalLiabilities: 0, totalEquity: 0, legacyCapitalPence: 500,
      reconciliation: { equationDifferencePence: -100, journalProfitPence: 0, operationalProfitPence: null,
        profitDifferencePence: null, profitIncomplete: true, stockValueIncomplete: true } });
  });
  afterEach(() => vi.useRealTimers());
  it('shows signed recorded balances, warnings, legacy disclosure and review navigation', async () => {
    const html = renderToStaticMarkup(await Page({ searchParams: { asOf: '2026-03-31' } }));
    expect(html).toContain('Bank &amp; MoMo'); expect(html).toContain('-1.00');
    expect(html).toContain('Some sales have no product cost recorded');
    expect(html.indexOf('Financial position')).toBeLessThan(html.indexOf('Report notes'));
    expect(html).toContain('Opening capital setting'); expect(html).toContain('separate from the opening balance entries');
    expect(html).not.toContain('No external balances');
    expect(html).not.toContain('cannot be confirmed');
    expect(html).not.toContain('CURRENT_PROFIT');
    expect(html).toContain('/payments/reconciliation/balances?month=2026-03');
    expect(mocks.sheet).toHaveBeenCalledWith('biz', new Date('2026-03-31T21:00:00Z'));
  });
  it('shows a clean statement when no specific entry issues exist', async () => {
    const sheet = await mocks.sheet();
    sheet.legacyCapitalPence = 0;
    sheet.reconciliation = { ...sheet.reconciliation, equationDifferencePence: 0, stockValueIncomplete: false, profitIncomplete: false };
    mocks.sheet.mockResolvedValue(sheet);
    const html = renderToStaticMarkup(await Page({}));
    expect(html).not.toContain('Report notes');
    expect(html).not.toContain('Entry difference');
    expect(html).not.toContain('unverified');
    expect(html).toContain('Total liabilities and equity');
  });
  it('excludes future-dated entries from today even before the local day ends', async () => {
    await Page({});
    expect(mocks.sheet).toHaveBeenCalledWith('biz', new Date('2026-04-02T10:00:00Z'));
  });
  it('does not load figures when access is denied', async () => {
    mocks.open.mockResolvedValue({ ok: false, denial: <p>Access denied</p> });
    expect(renderToStaticMarkup(await Page({}))).toContain('Access denied');
    expect(mocks.sheet).not.toHaveBeenCalled();
  });
  it('rejects invalid and future statement dates before loading figures', async () => {
    for (const asOf of ['2026-02-30', '2026-04-03']) {
      expect(renderToStaticMarkup(await Page({ searchParams: { asOf } }))).toContain('Choose a valid statement date');
    }
    expect(mocks.sheet).not.toHaveBeenCalled();
  });
});
