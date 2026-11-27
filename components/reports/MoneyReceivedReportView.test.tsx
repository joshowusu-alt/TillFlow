import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MoneyReceivedReportView from './MoneyReceivedReportView';
import { moneyFixture } from '@/lib/reviews/owner-money-fixture';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function view(scenario = 'normal', periodChip?: string) {
  return render(<MoneyReceivedReportView {...moneyFixture(scenario)} metric="money_received" from="2026-11-27" to="2026-11-27"
    storeId="main" scopeLabel="Main branch" choices={[{ id:'main', name:'Main branch' }]} offerAll={false} pageSize={25} periodChip={periodChip} />);
}

describe('Owner Money received presentation', () => {
  it('leads with the authoritative confirmed amount, separates refunds and pending MoMo, and keeps details collapsed', () => {
    view();
    const hero = screen.getByRole('region', { name:'Confirmed payments' });
    expect(within(hero).getByText('GH₵1,539.50')).toBeVisible();
    expect(screen.getByRole('link', { name:/Refunds paid/ })).toHaveTextContent('GH₵20.00');
    expect(screen.getByRole('link', { name:/MoMo awaiting confirmation/ })).toHaveTextContent('GH₵248.00');
    expect(screen.getByRole('link', { name:/MoMo awaiting confirmation/ })).toHaveAttribute('href', expect.stringContaining('storeId=main'));
    const disclosure = screen.getByText('More options').closest('details')!;
    expect(disclosure).not.toHaveAttribute('open');
    expect(disclosure).toHaveTextContent('Method check: Balances');
    expect(hero.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name:'Today' })).toHaveAttribute('aria-current','page');
    const cash = screen.getByRole('link', { name:/^Cash GH/ });
    expect(cash).toHaveAttribute('href', expect.stringContaining('metric=money_received_cash'));
    expect(cash).toHaveAttribute('href', expect.stringContaining('storeId=main'));
    expect(screen.getAllByText('Sale amend (money out)', { exact:false }).length).toBeGreaterThan(0);
  });
  it('opens custom options only when requested and retains the same branch', () => {
    view('normal','custom');
    expect(screen.getByText('More options').closest('details')).toHaveAttribute('open');
    expect(screen.getByLabelText('From')).toHaveValue('2026-11-27');
    expect(screen.getByRole('button', { name:'Apply' })).toHaveClass('min-h-11');
    expect(document.querySelector('input[name="storeId"]')).toHaveAttribute('value','main');
  });
  it('does not show zero or a balances claim when loading figures failed', () => {
    view('failed');
    const hero = screen.getByRole('region', { name:'Confirmed payments' });
    expect(within(hero).getByText('Unavailable')).toBeVisible();
    expect(screen.queryByText('GH₵0.00')).not.toBeInTheDocument();
    expect(screen.queryByText('Method check: Balances')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name:'Refresh' })).toBeVisible();
    expect(screen.getByText('Payment records could not be loaded. Please refresh.')).toBeVisible();
  });
  it('shows genuine zero only after a successful empty query and warns on mismatch', () => {
    const first = view('empty');
    expect(within(screen.getByRole('region', {name:'Confirmed payments'})).getByText('GH₵0.00')).toBeVisible();
    expect(screen.getByText('No transactions for this period and selection.')).toBeVisible();
    first.unmount();
    view('mismatch');
    expect(screen.getByText('Payment totals need checking. See More options for details.')).toBeVisible();
    expect(screen.getByText('These records need checking. See More options for details.')).toBeVisible();
  });
});
