import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ guard: vi.fn(), balance: vi.fn(), cashflow: vi.fn(), income: vi.fn() }));
vi.mock('@/lib/entitlements/live-report', () => ({ guardLiveReport: mocks.guard }));
vi.mock('@/lib/reports/financials', () => ({
  getBalanceSheet: mocks.balance, getCashflow: mocks.cashflow, getIncomeStatement: mocks.income,
}));
import { GET } from './route';

const request = (type: string) => new Request(`https://example.test/api/reports/financials?type=${type}&from=2026-03-01&to=2026-03-31`);

describe('financial exports preserve reconciliation limits', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.guard.mockResolvedValue({ ok: true, branch: { kind: 'label' }, business: { id: 'b1', currency: 'GHS', timezone: 'Africa/Accra' },
      decision: { appliedRange: { fromLocalDate: '2026-03-01', toLocalDate: '2026-03-31' } } });
    mocks.balance.mockResolvedValue({ assets: [{ accountCode: '1010', name: 'Bank', balancePence: -100 }, { accountCode: '1200', name: 'Inventory', balancePence: 1100 }], liabilities: [], equity: [{ accountCode: 'CURRENT_PROFIT', name: 'Net Profit to Date', balancePence: -100 }], totalAssets: 1000, totalLiabilities: 200, totalEquity: 500, legacyCapitalPence: 0,
      reconciliation: { equationDifferencePence: 300, journalProfitPence: -100, operationalProfitPence: null,
        profitDifferencePence: null, profitIncomplete: true, stockValueIncomplete: true, status: 'UNRECONCILED' } });
    mocks.cashflow.mockResolvedValue({ netProfit: null, arChange: 100, apChange: -100, invChange: 300,
      netCashFromOps: null, beginningCash: 500, endingCash: null });
  });

  it('downloads ledger figures with signed differences and incomplete-cost disclosures', async () => {
    const response = await GET(request('balance-sheet'));
    const csv = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(csv).not.toContain('Unreconciled');
    expect(csv).toContain('Recorded opening balances and transactions');
    expect(csv).toContain('Some sales have no product cost recorded');
    expect(csv).toMatch(/"Entry difference","[^"]*3\.00"/);
    expect(csv).toMatch(/"Profit to date","[^"]*-1\.00"/);
    expect(csv).not.toContain('Operational less ledger profit');
    expect(csv).toMatch(/"Total Assets","[^"]*10\.00"/);
  });

  it('keeps a complete statement free of reconciliation disclaimers and zero-difference notes', async () => {
    const fixture = await mocks.balance();
    fixture.reconciliation = { ...fixture.reconciliation, equationDifferencePence: 0, profitDifferencePence: 0,
      operationalProfitPence: -100, profitIncomplete: false, stockValueIncomplete: false };
    mocks.balance.mockResolvedValue(fixture);
    const csv = await (await GET(request('balance-sheet'))).text();
    expect(csv).not.toContain('Unreconciled');
    expect(csv).not.toContain('external evidence');
    expect(csv).not.toContain('REPORT NOTES');
    expect(csv).not.toContain('Entry difference');
  });

  it('identifies cash-flow figures as estimates without claiming bank or MoMo coverage', async () => {
    const csv = await (await GET(request('cashflow'))).text();
    expect(csv).toContain('bank and MoMo statements have not been matched');
    expect(csv).toContain('not a combined bank and MoMo balance');
    expect(csv).toContain('not a verified closing account balance');
    expect(csv).toContain('"Ending Cash","Costs incomplete"');
  });

  it('preserves access denial before loading any financial figures', async () => {
    mocks.guard.mockResolvedValue({ ok: false, body: { reason: 'FORBIDDEN' }, status: 403, headers: { 'Cache-Control': 'no-store' } });
    expect((await GET(request('balance-sheet'))).status).toBe(403);
    expect(mocks.balance).not.toHaveBeenCalled();
    expect(mocks.cashflow).not.toHaveBeenCalled();
  });
});
