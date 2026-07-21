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
  improveRecords: {
    primary: null,
    secondary: [],
    allClear: true,
    allClearMessage:
      'Your key records are in good shape. TillFlow will surface the next useful improvement when needed.',
  },
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
  openShiftOpenedAt: null,
  reorderNeededCount: 0,
  overdueSupplierInvoiceCount: 0,
  expectedCashPence: 125_000,
  lastShiftClosedAt: null,
  lastReceiptId: 'receipt-1',
  plan: 'GROWTH',
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

    expect(revenueCard.parentElement).toHaveClass('grid-cols-2');
    expect(revenueCard).toHaveClass('min-w-0');
    expect(revenueCard).toHaveClass('col-span-2');
    expect(revenueValue).toHaveClass('whitespace-nowrap');
    expect(revenueValue).toHaveClass('tabular-nums');
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
      expect(label).toHaveClass('text-blue-100/80');
      expect(label).toHaveClass('whitespace-nowrap');
    }

    expect(screen.queryByText("Today's Revenue")).not.toBeInTheDocument();
    expect(screen.queryByText("Today's Transactions")).not.toBeInTheDocument();
    expect(screen.queryByText('Open Issues')).not.toBeInTheDocument();
    expect(transactionsCard).not.toHaveClass('col-span-2');
    expect(expectedCashCard).not.toHaveClass('col-span-2');
    expect(screen.getByRole('link', { name: /Today's Revenue:/ })).toHaveClass('col-span-2');
  });

  it('drops very long revenue values to the smallest stat size', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 15, 0));

    renderDashboard({ todayRevenuePence: 123_456_789 });

    const revenueValue = screen.getByText((_, element) =>
      element?.textContent?.replace(/\u00a0/g, ' ') === 'GH₵1,234,567.89'
    );

    expect(revenueValue).toHaveClass('text-sm');
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

  it('keeps Open POS as the only permanent primary Home action', () => {
    renderDashboard();

    expect(screen.getByRole('link', { name: /Open POS Serve customers/i })).toHaveAttribute('href', '/pos');
    expect(screen.queryByText('Quick access')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Purchases$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^People$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Billing$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^System Health$/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Secure. Reliable. Built for Ghanaian businesses.')).toHaveLength(1);
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

    expect(screen.getAllByText('Today · All branches').length).toBeGreaterThanOrEqual(1);
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

    expect(screen.getByRole('status')).toHaveTextContent('4 actions need attention today');
    expect(screen.getAllByText('4 actions need attention today.')).toHaveLength(1); // Today's attention only
    expect(screen.getByText(/85 sales in this open shift/)).toBeInTheDocument();
    expect(screen.getByText(/Supplier payments due/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /4 issues in Command Center/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Supplier payments due/)).toHaveLength(1);
    expect(screen.queryByText('Follow up before close')).not.toBeInTheDocument();
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

describe('Improve Your Records Phase 2', () => {
  it('shows one primary improvement and compact secondary actions', () => {
    renderDashboard({
      improveRecords: {
        primary: {
          key: 'missing-costs',
          title: 'Complete your product costs',
          explanation: 'Your sales are recorded, but profit is incomplete for 12 products.',
          actionLabel: 'Review missing costs',
          href: '/products?missingCost=1',
          priority: 100,
        },
        secondary: [
          {
            key: 'opening-balances',
            title: 'Complete your starting balances',
            explanation: 'Add what the business owned and owed when TillFlow started.',
            actionLabel: 'Review opening balances',
            href: '/settings#opening-capital',
            priority: 80,
          },
          {
            key: 'purchases',
            title: 'Record your purchases',
            explanation: 'Recording purchases keeps stock and costs accurate.',
            actionLabel: 'Add a purchase',
            href: '/purchases',
            priority: 70,
          },
        ],
        allClear: false,
        allClearMessage: 'Your key records are in good shape.',
      },
    });

    expect(screen.getByText('Improve your records')).toBeInTheDocument();
    expect(screen.getByText('Top improvement')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Complete your product costs/i })).toHaveAttribute(
      'href',
      '/products?missingCost=1'
    );
    expect(screen.getByRole('link', { name: /Complete your starting balances/i })).toHaveAttribute(
      'href',
      '/settings#opening-capital'
    );
    expect(screen.queryByText('Review billing')).not.toBeInTheDocument();
    expect(screen.queryByText('View reports')).not.toBeInTheDocument();
    expect(screen.queryByText('Add staff')).not.toBeInTheDocument();
    expect(screen.queryByText(/% complete|Stuck/i)).not.toBeInTheDocument();
  });

  it('shows quiet success state when records are clear', () => {
    renderDashboard();

    expect(screen.getByText('Improve your records')).toBeInTheDocument();
    expect(
      screen.getByText(/Your key records are in good shape/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('Top improvement')).not.toBeInTheDocument();
  });

  it('keeps Command Center separate from Improve Your Records', () => {
    renderDashboard({
      openShiftCount: 1,
      openIssueCount: 2,
      improveRecords: {
        primary: {
          key: 'missing-costs',
          title: 'Complete your product costs',
          explanation: 'Profit is incomplete for 2 products.',
          actionLabel: 'Review missing costs',
          href: '/products?missingCost=1',
          priority: 100,
        },
        secondary: [],
        allClear: false,
        allClearMessage: '',
      },
    });

    // Command Center lives in WelcomeDashboard (Today's attention / operational cards).
    expect(screen.getByRole('link', { name: /Open POS Serve customers/i })).toBeInTheDocument();
    expect(screen.getByText('Improve your records')).toBeInTheDocument();
    expect(screen.getByText('Top improvement')).toBeInTheDocument();
    expect(
      screen.getByText('Optional improvements that make your records and reports more reliable.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2 issues in Command Center/i })).toBeInTheDocument();
  });
});

describe('Owner Home Phase 1 control centre', () => {
  it('removes the Home directory and admin cards', () => {
    renderDashboard();

    for (const label of [
      'Dashboard',
      'Products',
      'Sales History',
      'Inventory',
      'Purchases',
      'People',
      'Settings',
      'Billing',
      'System Health',
    ]) {
      expect(screen.queryByRole('link', { name: new RegExp(`^${label}\\b`, 'i') })).not.toBeInTheDocument();
    }
    expect(screen.queryByText('Quick access')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Today focus')).not.toBeInTheDocument();
  });

  it('renders one Today\'s attention surface and conditional actions', () => {
    renderDashboard({
      openShiftCount: 1,
      openShiftSalesCount: 3,
      openShiftOpenedAt: '2026-02-17T08:15:00.000Z',
      openIssueCount: 5,
      overdueSupplierInvoiceCount: 1,
      reorderNeededCount: 2,
      plan: 'GROWTH',
    });

    expect(screen.getAllByRole('region', { name: /Today'?s attention/i })).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('4 actions need attention today');
    expect(screen.getAllByText('4 actions need attention today.')).toHaveLength(1); // attention line only — pill is the sole hero summary
    expect(screen.getByRole('link', { name: /Close Shift/i })).toHaveAttribute('href', '/shifts');
    expect(screen.getByText(/Open since .+ · 3 sales in this open shift/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /5 issues in Command Center/i })).toHaveAttribute(
      'href',
      '/reports/command-center'
    );
    expect(screen.getByRole('link', { name: /Supplier payments due/i })).toHaveAttribute(
      'href',
      '/payments/supplier-payments'
    );
    expect(screen.getByRole('link', { name: /Reorder needed/i })).toHaveAttribute(
      'href',
      '/reports/reorder-suggestions'
    );
    expect(screen.queryByText('Follow up before close')).not.toBeInTheDocument();
  });

  it('hides reorder attention when the Growth report is unavailable', () => {
    renderDashboard({
      reorderNeededCount: 4,
      openIssueCount: 1,
      plan: 'STARTER',
    });

    expect(screen.queryByRole('link', { name: /Reorder needed/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /1 issue in Command Center/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 action needs attention today');
    expect(screen.getAllByText('1 action needs attention today.')).toHaveLength(1);
  });

  it('shows a quiet attention state without All systems active when records need work', () => {
    renderDashboard({
      openIssueCount: 0,
      improveRecords: {
        primary: {
          key: 'missing-costs',
          title: 'Complete your product costs',
          explanation: 'Profit is incomplete for 2 products.',
          actionLabel: 'Review missing costs',
          href: '/products?missingCost=1',
          priority: 100,
        },
        secondary: [],
        allClear: false,
        allClearMessage: '',
      },
    });

    expect(screen.getByText('No urgent issues need your attention today.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Records can be improved');
    expect(
      screen.queryByText('No urgent issues today. Some records can still be improved.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('All systems active')).not.toBeInTheDocument();
    expect(screen.getByText('Improve your records')).toBeInTheDocument();
    expect(screen.getByText('Top improvement')).toBeInTheDocument();
  });

  it('keeps Improve Your Records recommendation hrefs unchanged and stacks secondary actions on mobile', () => {
    const { container } = renderDashboard({
      improveRecords: {
        primary: {
          key: 'missing-costs',
          title: 'Complete your product costs',
          explanation: 'Your sales are recorded, but profit is incomplete for 12 products.',
          actionLabel: 'Review missing costs',
          href: '/products?missingCost=1',
          priority: 100,
        },
        secondary: [
          {
            key: 'stock-completeness',
            title: 'Review stock gaps',
            explanation: 'Some products need opening stock.',
            actionLabel: 'Review stock gaps',
            href: '/products?issue=STOCK_SETUP_GAP',
            priority: 90,
          },
          {
            key: 'opening-balances',
            title: 'Complete your starting balances',
            explanation: 'Add opening capital details.',
            actionLabel: 'Review opening balances',
            href: '/settings#opening-capital',
            priority: 80,
          },
          {
            key: 'purchases',
            title: 'Record your purchases',
            explanation: 'Keep stock and costs accurate.',
            actionLabel: 'Review purchases',
            href: '/purchases',
            priority: 70,
          },
        ],
        allClear: false,
        allClearMessage: '',
      },
    });

    expect(screen.getByRole('link', { name: /Complete your product costs/i })).toHaveAttribute(
      'href',
      '/products?missingCost=1'
    );
    expect(screen.getByRole('link', { name: /Review stock gaps/i })).toHaveAttribute(
      'href',
      '/products?issue=STOCK_SETUP_GAP'
    );
    expect(screen.getByRole('link', { name: /Review opening balances/i })).toHaveAttribute(
      'href',
      '/settings#opening-capital'
    );
    expect(screen.getByRole('link', { name: /Review purchases/i })).toHaveAttribute(
      'href',
      '/purchases'
    );
    expect(
      screen.getByText('Optional improvements that make your records and reports more reliable.')
    ).toBeInTheDocument();
    const secondaryLink = screen.getByRole('link', { name: /Review stock gaps/i });
    expect(secondaryLink).toHaveClass('flex-col');
    expect(container.querySelector('.min-h-screen')).toBeNull();
    expect(screen.getAllByText('Secure. Reliable. Built for Ghanaian businesses.')).toHaveLength(1);
  });

  it('keeps the status pill as the only hero attention summary and ends with the brand tagline once', () => {
    const { container } = renderDashboard({
      openShiftCount: 1,
      openIssueCount: 2,
      overdueSupplierInvoiceCount: 1,
    });

    expect(screen.getByRole('status')).toHaveTextContent('3 actions need attention today');
    expect(screen.getAllByText('3 actions need attention today.')).toHaveLength(1);
    const tagline = screen.getByText('Secure. Reliable. Built for Ghanaian businesses.');
    expect(tagline).toHaveClass('text-center');
    expect(container.textContent?.trim().endsWith('Secure. Reliable. Built for Ghanaian businesses.')).toBe(
      true
    );
  });

  it('shows Last Receipt only when a receipt id exists', () => {
    const { unmount } = renderDashboard({ lastReceiptId: 'receipt-99' });
    expect(screen.getByRole('link', { name: /Last receipt/i })).toHaveAttribute('href', '/receipts/receipt-99');
    unmount();

    renderDashboard({ lastReceiptId: null });
    expect(screen.queryByRole('link', { name: /Last receipt/i })).not.toBeInTheDocument();
  });

  it('renders live preview / demo content once without a competing Open POS', () => {
    renderDashboard({
      saleCount: 3,
      hasDemoData: true,
      hasSeedData: false,
    });

    expect(screen.getAllByText('Live preview mode')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Explore sample data/i })).toHaveAttribute(
      'href',
      '/reports/dashboard'
    );
    expect(screen.getAllByRole('link', { name: /Open POS/i })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Open POS Serve customers/i })).toHaveAttribute('href', '/pos');
  });

  it('keeps established leftover sample data as a quiet notice, not a second demo hero', () => {
    renderDashboard({
      saleCount: 40,
      hasDemoData: true,
      hasSeedData: false,
    });

    expect(screen.queryByText('Live preview mode')).not.toBeInTheDocument();
    expect(screen.getByText(/Sample trading data is still on this account/i)).toBeInTheDocument();
  });

  it('shows Growth reorder attention and hides it on Starter', () => {
    const { unmount } = renderDashboard({
      plan: 'GROWTH',
      reorderNeededCount: 3,
      openIssueCount: 1,
    });
    expect(screen.getByRole('link', { name: /Reorder needed/i })).toHaveAttribute(
      'href',
      '/reports/reorder-suggestions'
    );
    unmount();

    renderDashboard({
      plan: 'STARTER',
      reorderNeededCount: 3,
      openIssueCount: 1,
    });
    expect(screen.queryByRole('link', { name: /Reorder needed/i })).not.toBeInTheDocument();
  });

  it('uses honest operational all-clear status when records are also clear', () => {
    renderDashboard({ openIssueCount: 0, openShiftCount: 0 });

    expect(screen.getByText('No urgent issues today')).toBeInTheDocument();
    expect(screen.getByText('No urgent issues need your attention today.')).toBeInTheDocument();
    expect(screen.queryByText('All systems active')).not.toBeInTheDocument();
  });

  it('does not show Close Shift when no till is open', () => {
    renderDashboard({ openShiftCount: 0, expectedCashPence: 0 });

    expect(screen.queryByRole('link', { name: /Close Shift/i })).not.toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Expected Cash:/ })).getByText('No open till')).toBeInTheDocument();
  });
});
