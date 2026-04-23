import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReadinessJourney from '@/components/ReadinessJourney';
import type { ReadinessData } from '@/app/actions/onboarding';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/app/actions/onboarding', () => ({
  completeOnboarding: vi.fn(),
  toggleGuidedSetup: vi.fn(),
}));

vi.mock('@/app/actions/demo-day', () => ({
  generateDemoDay: vi.fn(),
  wipeDemoData: vi.fn(),
  clearSampleData: vi.fn(),
}));

const baseReadinessData: ReadinessData = {
  businessName: 'Demo Supermarket',
  userName: 'Ama Owner',
  currency: 'GHS',
  pct: 100,
  steps: [],
  nextStep: null,
  hasDemoData: false,
  productCount: 120,
  staffCount: 4,
  saleCount: 50,
  onboardingComplete: true,
  onboardingCompletedAt: null,
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
};

function renderDashboard(overrides: Partial<ReadinessData> = {}) {
  return render(<ReadinessJourney initial={{ ...baseReadinessData, ...overrides }} />);
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ReadinessJourney home stats', () => {
  it('shows the full revenue value on one line without truncation', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 15, 0));

    renderDashboard({ todayRevenuePence: 114_950 });

    const revenueValue = screen.getByText((_, element) =>
      element?.textContent?.replace(/\u00a0/g, ' ') === 'GHS 1,149.50'
    );
    const revenueCard = screen.getByRole('link', { name: /Today's Revenue:/ });

    expect(revenueCard.parentElement).toHaveClass('grid-cols-2');
    expect(revenueCard).toHaveClass('min-w-0');
    expect(revenueCard).toHaveClass('col-span-2');
    expect(revenueValue).toHaveClass('whitespace-nowrap');
    expect(revenueValue).toHaveClass('tabular-nums');
    expect(revenueValue).toHaveClass('text-base');
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
    const issuesLabel = screen.getByText('Issues');
    const transactionsCard = screen.getByRole('link', { name: /Today's Transactions:/ });
    const issuesCard = screen.getByRole('link', { name: /Open Issues:/ });

    for (const label of [revenueLabel, transactionsLabel, issuesLabel]) {
      expect(label).toHaveClass('text-xs');
      expect(label).toHaveClass('uppercase');
      expect(label).toHaveClass('tracking-wider');
      expect(label).toHaveClass('opacity-70');
      expect(label).toHaveClass('whitespace-nowrap');
    }

    expect(screen.queryByText("Today's Revenue")).not.toBeInTheDocument();
    expect(screen.queryByText("Today's Transactions")).not.toBeInTheDocument();
    expect(screen.queryByText('Open Issues')).not.toBeInTheDocument();
    expect(transactionsCard).not.toHaveClass('col-span-2');
    expect(issuesCard).not.toHaveClass('col-span-2');
  });

  it('drops very long revenue values to the smallest stat size', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 15, 0));

    renderDashboard({ todayRevenuePence: 123_456_789 });

    const revenueValue = screen.getByText((_, element) =>
      element?.textContent?.replace(/\u00a0/g, ' ') === 'GHS 1,234,567.89'
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
    expect(transactionValue).toHaveClass('text-base');
    expect(transactionValue).not.toHaveClass('truncate');
  });

  it('shows a neutral in-progress message before 14:00 when fewer than 20 transactions are recorded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 9, 30));

    renderDashboard();

    const deltas = screen.getAllByText('Day in progress');
    expect(deltas).toHaveLength(1);
    for (const delta of deltas) {
      expect(delta).toHaveClass('text-slate-300/75');
    }
    expect(within(screen.getByRole('link', { name: /Today's Revenue:/ })).getByText('Day in progress')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Today's Transactions:/ })).queryByText('Day in progress')).not.toBeInTheDocument();
    expect(screen.queryByText('-93% vs yesterday')).not.toBeInTheDocument();
  });

  it('shows the actual delta after 14:00', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 14, 0));

    renderDashboard();

    expect(screen.getAllByText('-93% vs yesterday')).toHaveLength(1);
    expect(within(screen.getByRole('link', { name: /Today's Revenue:/ })).getByText('-93% vs yesterday')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Today's Transactions:/ })).queryByText(/vs yesterday/)).not.toBeInTheDocument();
    expect(screen.queryByText('Day in progress')).not.toBeInTheDocument();
  });

  it('shows the actual delta before 14:00 once 20 transactions are recorded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 9, 30));

    renderDashboard({ todayTransactionCount: 20 });

    expect(screen.getByText('-93% vs yesterday')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Today's Transactions:/ })).queryByText('-80% vs yesterday')).not.toBeInTheDocument();
    expect(screen.queryByText('Day in progress')).not.toBeInTheDocument();
  });
});
