import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), review: vi.fn(), entries: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/entitlements/live-report', () => ({ openLiveReport: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/reports/monthly-balance-review', async () => ({
  ...await vi.importActual('@/lib/reports/monthly-balance-review'),
  getMonthlyBalanceReview: mocks.review, getMonthlyAccountEntries: mocks.entries,
}));
import MonthlyBalanceReviewPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  mocks.auth.mockResolvedValue({ ok: true, business: { id: 'business-a', timezone: 'Africa/Accra', currency: 'GHS' } });
  mocks.transaction.mockImplementation(async fn => fn({}));
  mocks.review.mockResolvedValue({
    window: { start: new Date('2026-03-01'), partial: false }, throughLocalDate: '2026-03-31', legacyCapitalPence: 50000,
    movementDifferencePence: 100, closingDifferencePence: -100,
    rows: [{ id: 'bank', name: 'Bank', code: '1010', openingPence: 1000, debitPence: 500, creditPence: 2000, closingPence: -500 }],
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('monthly balance review page', () => {
  it('shows missing evidence, signed amounts and legacy warning without a sign-off control', async () => {
    render(await MonthlyBalanceReviewPage({ searchParams: { month: '2026-03' } }));
    expect(mocks.auth).toHaveBeenCalledWith(expect.objectContaining({ surfaceId: 'monthly_balance_review' }));
    expect(screen.getByText(/Awaiting evidence/)).toBeInTheDocument();
    expect(screen.getByText(/legacy opening-capital field/)).toBeInTheDocument();
    expect(screen.getByText(/end of 2026-02-28/)).toBeInTheDocument();
    expect(screen.getByText(/separate balance for each bank account or wallet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View recorded entries' })).toHaveAttribute('href', '/payments/reconciliation/balances?month=2026-03&account=1010#account-entries');
    expect(screen.queryByRole('button', { name: /reconciled|approve|post/i })).not.toBeInTheDocument();
    expect(mocks.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: 'Serializable' });
  });
  it('rejects future dates without reading the ledger', async () => {
    render(await MonthlyBalanceReviewPage({ searchParams: { month: '2026-11' } }));
    expect(screen.getByRole('heading', { name: 'Choose a valid month' })).toBeInTheDocument();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('returns access denial before reading any ledger or transaction data', async () => {
    mocks.auth.mockResolvedValue({ ok: false, denial: <p>Report access denied</p> });
    render(await MonthlyBalanceReviewPage({ searchParams: { month: '2026-03' } }));
    expect(screen.getByText('Report access denied')).toBeInTheDocument();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it('does not query a foreign account passed in the URL', async () => {
    render(await MonthlyBalanceReviewPage({ searchParams: { month: '2026-03', account: '9999' } }));
    expect(mocks.entries).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an account');
  });
  it('shows paginated details without treating the page as the complete month', async () => {
    mocks.entries.mockResolvedValue({ account: { name: 'Bank', code: '1010' }, total: 101, page: 2, pageSize: 50, rows: [{ id: 'line', debitPence: 250, creditPence: 0, memo: null, journalEntry: { entryDate: new Date('2026-03-10'), description: 'Recorded receipt', referenceType: 'SALE', referenceId: 'invoice-a' } }] });
    render(await MonthlyBalanceReviewPage({ searchParams: { month: '2026-03', account: '1010', page: '2' } }));
    expect(screen.getByText(/totals above include all entries/)).toBeInTheDocument();
    expect(screen.getByText('Recorded receipt')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next entries' })).toHaveAttribute('href', expect.stringContaining('page=3'));
    expect(screen.getByRole('link', { name: 'Previous entries' })).toHaveAttribute('href', expect.stringContaining('page=1'));
  });
});
