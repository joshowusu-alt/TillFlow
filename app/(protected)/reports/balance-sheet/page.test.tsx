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
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ asOf: '2026-03-31' }) }));
    expect(html).toContain('Bank &amp; MoMo'); expect(html).toContain('-GH₵1.00');
    expect(html).toContain('Some sales have no product cost recorded');
    expect(html.indexOf('Figures may be incomplete')).toBeLessThan(html.indexOf('Financial position'));
    expect(html).not.toContain('Some stock has no cost entry');
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
  it('uses owner-friendly names without dropping accounts, changing signs or losing drill-downs', async () => {
    const sheet = await mocks.sheet();
    sheet.assets = [
      { accountCode: '1000', name: 'Cash', balancePence: 500000 },
      { accountCode: '1100', name: 'Accounts Receivable', balancePence: 700000 },
      { accountCode: '1200', name: 'Inventory', balancePence: 4000000 },
      { accountCode: '9999', name: 'Other recorded asset', balancePence: -100 },
    ];
    sheet.liabilities = [{ accountCode: '2000', name: 'Accounts Payable', balancePence: 1200000 }];
    sheet.equity = [{ accountCode: 'CURRENT_PROFIT', name: 'Net Profit', balancePence: 3999900 }];
    sheet.totalAssets = 5199900;
    sheet.totalLiabilities = 1200000;
    sheet.totalEquity = 3999900;
    mocks.sheet.mockResolvedValue(sheet);
    const html = renderToStaticMarkup(await Page({}));
    expect(html.indexOf('Figures may be incomplete')).toBeLessThan(html.indexOf('What the business owns'));
    expect(html).toContain('View missing product costs');
    for (const name of ['Cash on hand', 'Money customers owe us', 'Stock value', 'Money owed to suppliers and other creditors', 'Other recorded asset', 'Recorded profit to date']) expect(html).toContain(name);
    for (const code of ['1000', '1100', '1200', '9999', '2000', 'CURRENT_PROFIT']) expect(html).toContain(`account=${code}&amp;asOf=2026-04-02&amp;cutoff=2026-04-02T10%3A00%3A00.000Z`);
    for (const id of ['assets', 'liabilities', 'equity']) {
      expect(html).toContain(`id="${id}"`);
      expect(html).not.toContain(`href="#${id}"`);
    }
    expect(html).toContain('-GH₵1.00');
    expect(html).toContain('GH₵51,999.00');
    expect(html).toContain('GH₵39,999.00');
    expect(html).toContain('not cash available to withdraw');
  });
  it('uses one compact statement, date chips and an optional custom date form', async () => {
    const today = renderToStaticMarkup(await Page({}));
    expect(today.match(/data-balance-sheet-statement/g)).toHaveLength(1);
    expect(today.match(/What the business owns/g)).toHaveLength(2); // one heading, one accessible section label
    expect(today).not.toContain('type="date"');
    expect(today).toContain('asOf=2026-03-31&amp;dateChip=last-month-end');
    expect(today).toContain('asOf=2026-04-02&amp;dateChip=custom');
    expect(today).toContain('Export CSV');
    const custom = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ asOf: '2026-03-30', dateChip: 'custom' }) }));
    expect(custom).toContain('type="date"');
    expect(custom).toContain('name="asOf"');
    expect(custom).toContain('value="2026-03-30"');
    expect(custom).toContain('max="2026-04-02"');
  });
  it('excludes future-dated entries from today even before the local day ends', async () => {
    await Page({});
    expect(mocks.sheet).toHaveBeenCalledWith('biz', new Date('2026-04-02T10:00:00Z'));
  });
  it('does not describe net credits as positive amounts owed, or an unbalanced equity figure as the residual', async () => {
    const sheet = await mocks.sheet();
    sheet.assets = [{ accountCode: '1100', name: 'Receivables', balancePence: -500 }];
    sheet.liabilities = [{ accountCode: '2000', name: 'Payables', balancePence: -700 }];
    sheet.totalAssets = -500;
    sheet.totalLiabilities = -700;
    sheet.totalEquity = -300;
    sheet.reconciliation.equationDifferencePence = 500;
    const html = renderToStaticMarkup(await Page({}));
    expect(html).toContain('Customer balances (net credit)');
    expect(html).toContain('Supplier and other creditor balances (net credit to us)');
    expect(html).not.toContain('Money customers owe us');
    expect(html).toContain('-GH₵5.00');
    expect(html).toContain('-GH₵7.00');
    expect(html).toContain('In a balanced report');
    expect(html).toContain('Entry difference:');
    expect(html).toContain('Review missing costs');
    expect(html.match(/href="\/reports\/balance-sheet\/entries\?account=1100/g)).toHaveLength(1);
  });
  it('keeps the exact earlier cutoff when returning from supporting entries', async () => {
    const cutoff = '2026-04-02T08:30:00.000Z';
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ asOf: '2026-04-02', cutoff }) }));
    expect(mocks.sheet).toHaveBeenCalledWith('biz', new Date(cutoff));
    expect(html).toContain(`cutoff=${encodeURIComponent(cutoff)}`);
    expect(html).toContain('not a historical stock-cost snapshot');
  });
  it('does not load figures when access is denied', async () => {
    mocks.open.mockResolvedValue({ ok: false, denial: <p>Access denied</p> });
    expect(renderToStaticMarkup(await Page({}))).toContain('Access denied');
    expect(mocks.sheet).not.toHaveBeenCalled();
  });
  it('rejects invalid and future statement dates before loading figures', async () => {
    for (const asOf of ['2026-02-30', '2026-04-03']) {
      expect(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ asOf }) }))).toContain('Choose a valid statement date');
    }
    expect(mocks.sheet).not.toHaveBeenCalled();
  });
});
