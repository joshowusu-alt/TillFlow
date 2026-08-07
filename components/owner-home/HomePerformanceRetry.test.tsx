import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePerformanceSlot from '@/components/owner-home/HomePerformanceSlot';
import { HomePerformanceUnavailable } from '@/components/owner-home/section-errors';
import { formatMoney } from '@/lib/format';
import type { HomePerformanceSummary } from '@/lib/reports/home-performance-kpis';

// next/link → plain anchor so the success path renders in jsdom.
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

// Controllable useTransition so the retry pending/disabled UI is deterministic
// (a real transition around a synchronous router.refresh() resolves instantly
// in jsdom, which would make the loading/disabled state impossible to observe).
let mockPending = false;
const startTransitionMock = vi.fn((cb: () => void) => cb());
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useTransition: () => [mockPending, startTransitionMock] as const,
  };
});

const zeroSummary: HomePerformanceSummary = {
  todayRevenuePence: 0,
  todayTransactionCount: 0,
  yesterdayRevenuePence: 0,
  yesterdayTransactionCount: 0,
  expectedCashPence: 0,
  openShiftCount: 0,
  productCount: 812,
  timeZone: 'Africa/Accra',
  todayScope: {
    periodKey: 'today',
    fromInputValue: '2026-08-07',
    toInputValue: '2026-08-07',
    storeId: 'ALL',
  },
  tradingReportHref: '/reports/dashboard?period=today&from=2026-08-07&to=2026-08-07&storeId=ALL',
};

const dataSummary: HomePerformanceSummary = {
  todayRevenuePence: 1_234_56,
  todayTransactionCount: 37,
  yesterdayRevenuePence: 980_00,
  yesterdayTransactionCount: 30,
  expectedCashPence: 2_000_00,
  openShiftCount: 1,
  productCount: 812,
  timeZone: 'Africa/Accra',
  todayScope: {
    periodKey: 'today',
    fromInputValue: '2026-08-07',
    toInputValue: '2026-08-07',
    storeId: 'ALL',
  },
  tradingReportHref: '/reports/dashboard?period=today&from=2026-08-07&to=2026-08-07&storeId=ALL',
};

afterEach(() => {
  vi.clearAllMocks();
  mockPending = false;
});

describe('Home retry control — appearance & semantics', () => {
  it('failure state is compact, alerts assistive tech, and never fabricates a zero value', () => {
    render(<HomePerformanceUnavailable />);
    const region = screen.getByRole('alert');
    expect(within(region).getByText(/could not load today's figures/i)).toBeTruthy();
    // Reassures that selling is unaffected.
    expect(within(region).getByText(/open pos still works/i)).toBeTruthy();
    // Crucially: no fabricated GH₵0.00 / 0 TXNS shown as if it were real.
    expect(region.textContent).not.toMatch(/GH₵/);
    expect(region.textContent).not.toMatch(/\b0 TXN/i);
  });

  it('exposes a real button with an accessible, descriptive name', () => {
    render(<HomePerformanceUnavailable />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toMatch(/try again/i);
    expect(button.getAttribute('aria-label')).toMatch(/reload this section/i);
  });

  it('uses on-dark tone classes so it is visible on the hero gradient', () => {
    render(<HomePerformanceUnavailable />);
    const button = screen.getByRole('button');
    // High-contrast light-on-dark treatment (was previously near-invisible).
    expect(button.className).toMatch(/text-white/);
    expect(button.className).toMatch(/border-white\/40/);
    expect(button.className).toMatch(/bg-white\/15/);
  });
});

describe('Home retry control — activation, loading & overlap protection', () => {
  it('activating the control triggers a single router.refresh() via a transition', () => {
    mockPending = false;
    render(<HomePerformanceUnavailable />);
    fireEvent.click(screen.getByRole('button'));
    expect(startTransitionMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('while retrying: shows a loading label + spinner, is disabled, and cannot start an overlapping retry', () => {
    mockPending = true;
    render(<HomePerformanceUnavailable />);
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-label')).toMatch(/retrying/i);
    expect(within(button).getByText(/refreshing/i)).toBeTruthy();
    expect(button.querySelector('svg.animate-spin')).toBeTruthy();

    // A disabled button cannot fire onClick, so overlapping retries are impossible.
    fireEvent.click(button);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe('HomePerformanceSlot — failure / recovery / genuine-zero contract', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  beforeEach(() => errorSpy.mockClear());

  it('failure → renders the recoverable failure state (not real figures, not a fake zero)', async () => {
    const jsx = await HomePerformanceSlot({
      performancePromise: Promise.reject(new Error('db unavailable')),
      currency: 'GHS',
      saleCount: 5,
    });
    render(jsx);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/could not load today's figures/i)).toBeTruthy();
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/try again/i);
    // The failure was logged for observability and NOT masked as GH₵0.00.
    expect(errorSpy).toHaveBeenCalled();
    expect(screen.queryByText(/GH₵/)).toBeNull();
  });

  it('success (recovery) → replaces the error with real figures', async () => {
    const jsx = await HomePerformanceSlot({
      performancePromise: Promise.resolve(dataSummary),
      currency: 'GHS',
      saleCount: 37,
    });
    render(jsx);
    expect(screen.queryByText(/could not load today's figures/i)).toBeNull();
    expect(screen.getByText(formatMoney(dataSummary.todayRevenuePence, 'GHS'))).toBeTruthy();
    expect(screen.getByText('37')).toBeTruthy();
  });

  it('genuine zero-sales day → shows a truthful zero value, distinct from a failure', async () => {
    const jsx = await HomePerformanceSlot({
      performancePromise: Promise.resolve(zeroSummary),
      currency: 'GHS',
      saleCount: 0,
    });
    render(jsx);
    // No error UI.
    expect(screen.queryByText(/could not load today's figures/i)).toBeNull();
    // Real GH₵0.00 expected-cash value is rendered as a legitimate figure.
    expect(screen.getAllByText(formatMoney(0, 'GHS')).length).toBeGreaterThan(0);
    // Product count is shown (zero-sales layout), proving this is the live path.
    expect(screen.getByText(zeroSummary.productCount.toLocaleString())).toBeTruthy();
  });
});
