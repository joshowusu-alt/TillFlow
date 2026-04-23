import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  it('keeps the revenue value on one line and reveals the full value on tap', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 15, 0));

    renderDashboard();

    const revenueValue = screen.getByRole('button', { name: /Today's Revenue:/ });

    expect(revenueValue).toHaveClass('truncate');
    expect(revenueValue).toHaveClass('whitespace-nowrap');
    expect(revenueValue).toHaveClass('tabular-nums');

    const fullValue = revenueValue.textContent ?? '';
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.click(revenueValue);

    expect(revenueValue).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tooltip').textContent?.replace(/\u00a0/g, ' ')).toBe(
      fullValue.replace(/\u00a0/g, ' ')
    );
  });

  it('shows a neutral in-progress message before 14:00 when fewer than 20 transactions are recorded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 9, 30));

    renderDashboard();

    const deltas = screen.getAllByText('Day in progress');
    expect(deltas).toHaveLength(2);
    for (const delta of deltas) {
      expect(delta).toHaveClass('text-slate-300/75');
    }
    expect(screen.queryByText('-93% vs yesterday')).not.toBeInTheDocument();
  });

  it('shows the actual delta after 14:00', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 14, 0));

    renderDashboard();

    expect(screen.getAllByText('-93% vs yesterday')).toHaveLength(2);
    expect(screen.queryByText('Day in progress')).not.toBeInTheDocument();
  });

  it('shows the actual delta before 14:00 once 20 transactions are recorded', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 23, 9, 30));

    renderDashboard({ todayTransactionCount: 20 });

    expect(screen.getByText('-93% vs yesterday')).toBeInTheDocument();
    expect(screen.getByText('-80% vs yesterday')).toBeInTheDocument();
    expect(screen.queryByText('Day in progress')).not.toBeInTheDocument();
  });
});
