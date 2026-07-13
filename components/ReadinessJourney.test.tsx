import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReadinessJourney from '@/components/ReadinessJourney';
import type { ReadinessData } from '@/app/actions/onboarding';

vi.mock('@/hooks/useRouterRefreshOnVisibility', () => ({
  useRouterRefreshOnVisibility: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/app/actions/onboarding', () => ({
  markOnboardingCompleteAfterFirstSale: vi.fn(),
  toggleGuidedSetup: vi.fn(),
  updateOnboardingBusinessProfile: vi.fn(),
}));

vi.mock('@/app/actions/nav-kpis', () => ({
  getNavTodaySales: vi.fn(),
}));

vi.mock('@/app/actions/demo-day', () => ({
  generateDemoDay: vi.fn(),
  wipeDemoData: vi.fn(),
  clearSampleData: vi.fn(),
}));

const completedJourney = {
  status: 'IMPROVING_RECORDS' as const,
  statusLabel: 'Improving your records',
  stages: [
    {
      key: 'business' as const,
      title: 'Tell us about your business',
      explanation: '',
      done: true,
      href: '/onboarding#business',
    },
    {
      key: 'products' as const,
      title: 'Add or import what you sell',
      explanation: '',
      done: true,
      href: '/onboarding#products',
    },
    {
      key: 'stock' as const,
      title: 'Add stock now or later',
      explanation: '',
      done: true,
      href: '/onboarding#stock',
    },
    {
      key: 'selling' as const,
      title: 'Start selling',
      explanation: '',
      done: true,
      href: '/pos',
    },
  ],
  upNext: null,
  stockDeferredMessage: null,
  zeroStockBlockMessage: null,
  optionalImprovements: [],
  hasBusinessName: true,
  hasBusinessType: true,
  hasValidProduct: true,
  hasSellableProduct: true,
  hasFirstSale: true,
  onboardingComplete: true,
};

const baseReadinessData: ReadinessData = {
  businessName: 'Demo Supermarket',
  userName: 'Ama Owner',
  currency: 'GHS',
  pct: 100,
  activationStatus: 'ACTIVE_BUSINESS',
  activationStatusLabel: 'Improving your records',
  stuckReason: null,
  stuckMessage: null,
  ownerMessage: 'Your business is active.',
  nextAction: 'Open POS',
  businessCategory: 'SUPERMARKET',
  businessCategoryLabel: 'Supermarket',
  journey: completedJourney,
  stages: completedJourney.stages,
  upNext: null,
  optionalImprovements: [],
  steps: [],
  nextStep: null,
  hasDemoData: false,
  hasSeedData: false,
  productCount: 120,
  validProductCount: 120,
  sellableProductCount: 100,
  staffCount: 4,
  saleCount: 50,
  onboardingComplete: true,
  onboardingCompletedAt: new Date('2026-01-01'),
  guidedSetup: false,
  todayRevenuePence: 46_750,
  yesterdayRevenuePence: 700_000,
  todayTransactionCount: 7,
  yesterdayTransactionCount: 100,
  openIssueCount: 0,
  openShiftCount: 0,
  openShiftSalesCount: 0,
  reorderNeededCount: 0,
  overdueSupplierInvoiceCount: 0,
  expectedCashPence: 125_000,
  lastShiftClosedAt: null,
  lastReceiptId: 'receipt-1',
};

function renderDashboard(overrides: Partial<ReadinessData> = {}) {
  return render(<ReadinessJourney initial={{ ...baseReadinessData, ...overrides }} />);
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  pushMock.mockClear();
  refreshMock.mockClear();
});

describe('ReadinessJourney Phase 1 setup', () => {
  it('shows exactly one Start selling CTA on Ready to sell without duplicates', () => {
    const readyJourney = {
      ...completedJourney,
      status: 'READY_TO_SELL' as const,
      statusLabel: 'Ready to sell',
      onboardingComplete: false,
      hasFirstSale: false,
      upNext: {
        key: 'start-selling' as const,
        title: 'Start selling',
        explanation: 'Open POS and make your first successful sale.',
        href: '/pos',
        isStartSelling: true,
      },
      optionalImprovements: [],
    };

    renderDashboard({
      onboardingComplete: false,
      onboardingCompletedAt: null,
      saleCount: 0,
      businessName: 'Legacy Supplements',
      businessCategory: 'PHARMACY',
      businessCategoryLabel: 'Pharmacy',
      activationStatus: 'READY_TO_SELL',
      activationStatusLabel: 'Ready to sell',
      journey: readyJourney,
      stages: readyJourney.stages.map((s) => (s.key === 'selling' ? { ...s, done: false } : s)),
      upNext: readyJourney.upNext,
      optionalImprovements: [],
    });

    const startButtons = screen.getAllByRole('button', { name: /^Start selling$/i });
    expect(startButtons).toHaveLength(1);
    expect(screen.getByText(/Your business is ready\. Make your first successful sale/i)).toBeInTheDocument();
    expect(screen.getByText(/Make your first sale/i)).toBeInTheDocument();
    expect(screen.getByText(/^Up next$/i)).toBeInTheDocument();
    expect(screen.getByText(/Legacy Supplements/)).toBeInTheDocument();
    expect(screen.getByText(/Pharmacy/)).toBeInTheDocument();
    expect(
      screen.getAllByText(/Opening the POS does not finish onboarding\. Your first successful sale does\./i)
    ).toHaveLength(1);
    expect(screen.queryByText(/Skip to POS/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/% complete/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Stuck$/i)).not.toBeInTheDocument();

    fireEvent.click(startButtons[0]);
    expect(pushMock).toHaveBeenCalledWith('/pos');
  });
});

describe('ReadinessJourney home stats', () => {
  it('shows the full revenue value on one line without truncation', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 15, 0));

    renderDashboard({ todayRevenuePence: 114_950 });

    const revenueValue = screen.getByText((_, element) =>
      element?.textContent?.replace(/\u00a0/g, ' ') === 'GH₵1,149.50'
    );
    const revenueCard = screen.getByRole('link', { name: /Today's Revenue:/ });

    expect(revenueCard.parentElement).toHaveClass('grid-cols-1');
    expect(revenueCard).toHaveClass('min-w-0');
    expect(revenueCard).not.toHaveClass('col-span-2');
    expect(revenueValue).toHaveClass('whitespace-nowrap');
    expect(revenueValue).toHaveClass('tabular-nums');
    expect(revenueValue).toHaveClass('text-sm');
    expect(revenueValue).toHaveClass('leading-tight');
    expect(revenueValue).not.toHaveClass('truncate');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('uses short one-line labels in the hero stat cards', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 9, 30));

    renderDashboard();

    const revenueLabel = screen.getByText('Revenue');
    const transactionsLabel = screen.getByText('Transactions');
    const expectedCashLabel = screen.getByText('Expected Cash');
    const transactionsCard = screen.getByRole('link', { name: /Today's Transactions:/ });
    const expectedCashCard = screen.getByRole('link', { name: /Expected Cash:/ });

    for (const label of [revenueLabel, transactionsLabel, expectedCashLabel]) {
      expect(label).toHaveClass('uppercase');
      expect(label).toHaveClass('tracking-wider');
      expect(label).toHaveClass('opacity-75');
      expect(label).toHaveClass('whitespace-nowrap');
    }

    expect(screen.queryByText("Today's Revenue")).not.toBeInTheDocument();
    expect(screen.queryByText("Today's Transactions")).not.toBeInTheDocument();
    expect(screen.queryByText('Open Issues')).not.toBeInTheDocument();
    expect(transactionsCard).not.toHaveClass('col-span-2');
    expect(expectedCashCard).not.toHaveClass('col-span-2');
  });

  it('drops very long revenue values to the smallest stat size', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 15, 0));

    renderDashboard({ todayRevenuePence: 123_456_789 });

    const revenueValue = screen.getByText((_, element) =>
      element?.textContent?.replace(/\u00a0/g, ' ') === 'GH₵1,234,567.89'
    );

    expect(revenueValue).toHaveClass('text-xs');
    expect(revenueValue).toHaveClass('sm:text-sm');
    expect(revenueValue).not.toHaveClass('truncate');
  });

  it('applies the same one-line sizing to the transactions value', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 15, 0));

    renderDashboard({ todayTransactionCount: 123_456_789 });

    const transactionValue = screen.getByText('123,456,789');

    expect(transactionValue).toHaveClass('whitespace-nowrap');
    expect(transactionValue).toHaveClass('tabular-nums');
    expect(transactionValue).toHaveClass('text-sm');
    expect(transactionValue).not.toHaveClass('truncate');
  });

  it('shows a neutral in-progress message before 14:00 when fewer than 20 transactions are recorded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 9, 30));

    renderDashboard();

    expect(within(screen.getByRole('link', { name: /Today's Revenue:/ })).getByText('GH₵467.50 today / GH₵7,000.00 yesterday')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Today's Transactions:/ })).queryByText(/yesterday/)).not.toBeInTheDocument();
    expect(screen.queryByText('Day in progress')).not.toBeInTheDocument();
    expect(screen.queryByText('-93% vs yesterday')).not.toBeInTheDocument();
  });

  it('shows side-by-side today versus yesterday after 14:00', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 14, 0));

    renderDashboard();

    expect(within(screen.getByRole('link', { name: /Today's Revenue:/ })).getByText('GH₵467.50 today / GH₵7,000.00 yesterday')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Today's Transactions:/ })).queryByText(/yesterday/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vs yesterday/)).not.toBeInTheDocument();
  });

  it('shows side-by-side today versus yesterday before 14:00 once 20 transactions are recorded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 9, 30));

    renderDashboard({ todayTransactionCount: 20 });

    expect(within(screen.getByRole('link', { name: /Today's Revenue:/ })).getByText('GH₵467.50 today / GH₵7,000.00 yesterday')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Today's Transactions:/ })).queryByText(/yesterday/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vs yesterday/)).not.toBeInTheDocument();
  });

  it('shows quick access operational cards and admin links on the home dashboard', () => {
    renderDashboard();

    expect(screen.getByRole('link', { name: /Open POS/ })).toHaveAttribute('href', '/pos');
    expect(screen.getByRole('link', { name: /Purchases/ })).toHaveAttribute('href', '/purchases');
    expect(screen.getByRole('link', { name: /People/ })).toHaveAttribute('href', '/users');
    expect(screen.getByRole('link', { name: /Billing/ })).toHaveAttribute('href', '/settings/billing');
    expect(screen.getByRole('link', { name: /System Health/ })).toHaveAttribute('href', '/settings/system-health');
    expect(screen.getByText('Secure. Reliable. Built for Ghanaian businesses.')).toBeInTheDocument();
  });

  it('does not present the last closed shift as current expected cash', () => {
    renderDashboard({
      openShiftCount: 0,
      expectedCashPence: 0,
      lastShiftClosedAt: new Date(2026, 5, 13, 21, 54).toISOString(),
    });

    const expectedCashCard = screen.getByRole('link', { name: /Expected Cash:/ });

    expect(within(expectedCashCard).getByText('GH₵0.00')).toBeInTheDocument();
    expect(within(expectedCashCard).getByText('No open till')).toBeInTheDocument();
  });

  it('labels business-wide hero stats as all branches and wires visibility refresh', async () => {
    const { useRouterRefreshOnVisibility } = await import('@/hooks/useRouterRefreshOnVisibility');

    renderDashboard();

    expect(screen.getAllByText('Today · all branches').length).toBeGreaterThanOrEqual(1);
    expect(useRouterRefreshOnVisibility).toHaveBeenCalled();
  });

  it('patches stale hero revenue and transactions from the shared live nav KPI action on mount', async () => {
    const { getNavTodaySales } = await import('@/app/actions/nav-kpis');
    vi.mocked(getNavTodaySales).mockResolvedValueOnce({
      totalPence: 1_223_850,
      txCount: 114,
      currency: 'GHS',
      onlineOrdersCount: 0,
      userRole: 'OWNER',
    });

    renderDashboard({
      todayRevenuePence: 959_300,
      todayTransactionCount: 85,
      expectedCashPence: 891_900,
      openShiftCount: 1,
    });

    expect(screen.getByRole('link', { name: /Today's Revenue: GH₵9,593.00/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Today's Transactions: 85/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Today's Revenue: GH₵12,238.50/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Today's Transactions: 114/ })).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /Expected Cash: GH₵8,919.00/ })).toBeInTheDocument();
  });

  it('keeps readiness task data while live KPI refresh updates only hero sales values', async () => {
    const { getNavTodaySales } = await import('@/app/actions/nav-kpis');
    vi.mocked(getNavTodaySales).mockResolvedValueOnce({
      totalPence: 1_223_850,
      txCount: 114,
      currency: 'GHS',
      onlineOrdersCount: 0,
      userRole: 'OWNER',
    });

    renderDashboard({
      todayRevenuePence: 959_300,
      todayTransactionCount: 85,
      openIssueCount: 4,
      reorderNeededCount: 1,
      overdueSupplierInvoiceCount: 1,
      openShiftCount: 1,
      openShiftSalesCount: 85,
    });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Today's Revenue: GH₵12,238.50/ })).toBeInTheDocument();
    });

    expect(screen.getByText('4 items need attention')).toBeInTheDocument();
    expect(screen.getAllByText(/85 sales recorded/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Supplier payments due/).length).toBeGreaterThan(0);
  });

  it('keeps initial readiness values visible if the live KPI action fails', async () => {
    const { getNavTodaySales } = await import('@/app/actions/nav-kpis');
    vi.mocked(getNavTodaySales).mockRejectedValueOnce(new Error('network unavailable'));

    renderDashboard({
      todayRevenuePence: 959_300,
      todayTransactionCount: 85,
    });

    await waitFor(() => expect(getNavTodaySales).toHaveBeenCalled());

    expect(screen.getByRole('link', { name: /Today's Revenue: GH₵9,593.00/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Today's Transactions: 85/ })).toBeInTheDocument();
  });

  it('refreshes hero live KPIs when the dashboard regains focus', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_000).mockReturnValue(9_001);
    const { getNavTodaySales } = await import('@/app/actions/nav-kpis');
    vi.mocked(getNavTodaySales)
      .mockResolvedValueOnce({
        totalPence: 959_300,
        txCount: 85,
        currency: 'GHS',
        onlineOrdersCount: 0,
        userRole: 'OWNER',
      })
      .mockResolvedValueOnce({
        totalPence: 1_223_850,
        txCount: 114,
        currency: 'GHS',
        onlineOrdersCount: 0,
        userRole: 'OWNER',
      });

    renderDashboard({
      todayRevenuePence: 959_300,
      todayTransactionCount: 85,
    });

    await waitFor(() => expect(getNavTodaySales).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new FocusEvent('focus'));
    });

    await waitFor(() => {
      expect(getNavTodaySales).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('link', { name: /Today's Revenue: GH₵12,238.50/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Today's Transactions: 114/ })).toBeInTheDocument();
    });

    nowSpy.mockRestore();
  });

  it('refreshes hero live KPIs when the dashboard becomes visible again', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_000).mockReturnValue(9_001);
    const { getNavTodaySales } = await import('@/app/actions/nav-kpis');
    vi.mocked(getNavTodaySales)
      .mockResolvedValueOnce({
        totalPence: 959_300,
        txCount: 85,
        currency: 'GHS',
        onlineOrdersCount: 0,
        userRole: 'OWNER',
      })
      .mockResolvedValueOnce({
        totalPence: 1_223_850,
        txCount: 114,
        currency: 'GHS',
        onlineOrdersCount: 0,
        userRole: 'OWNER',
      });

    renderDashboard({
      todayRevenuePence: 959_300,
      todayTransactionCount: 85,
    });

    await waitFor(() => expect(getNavTodaySales).toHaveBeenCalledTimes(1));

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(getNavTodaySales).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('link', { name: /Today's Revenue: GH₵12,238.50/ })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Today's Transactions: 114/ })).toBeInTheDocument();
    });

    nowSpy.mockRestore();
  });
});
