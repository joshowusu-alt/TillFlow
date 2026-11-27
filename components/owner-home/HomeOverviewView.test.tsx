import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeAttentionList, HomeFigures, HomeTills } from './HomeOverviewView';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/actions/operational-store', () => ({ switchOperationalStoreAction: vi.fn() }));

describe('Owner Home presentation', () => {
  it('keeps credit separate from confirmed receipts and never truncates figures', () => {
    render(<HomeFigures scope="Main branch" figures={[
      { label: 'Sales', value: 'GH₵1,234,567.89', href: '/reports/dashboard?storeId=main' },
      { label: 'Money received', value: 'GH₵12.00', note: 'GH₵35.00 on credit today', href: '/reports/money-received?storeId=main' },
      { label: 'Profit', value: null, incomplete: true, href: '/reports/income-statement/entries?issues=1' },
    ]} />);
    expect(screen.getByText('GH₵1,234,567.89')).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.getByText('GH₵35.00 on credit today')).toBeVisible();
    expect(screen.getByRole('link', { name: /Profit incomplete — Fix now/ })).toHaveAttribute('href', expect.stringContaining('issues=1'));
  });

  it('shows only a short upgrade line for Starter', () => {
    render(<HomeFigures scope="Main branch" figures={[{ label: 'Profit', value: null, upgrade: true }]} />);
    expect(screen.getByText('Profit · on Growth')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps normal open tills neutral', () => {
    render(<HomeTills count={2} expected="GH₵350.00" />);
    expect(screen.getByText('2 tills open · Expected cash GH₵350.00')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('never claims all clear after failure', () => {
    render(<HomeAttentionList rows={null} reportsHref="/reports?storeId=main" />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't check right now — Retry");
    expect(screen.getByRole('button', { name: /Retry/ })).toBeVisible();
    expect(screen.queryByText('Nothing needs attention right now.')).not.toBeInTheDocument();
  });

  it('shows three rows before the collapsed list', () => {
    const rows = [1, 2, 3, 4].map(rank => ({ rank, title: 'Issue '+rank, detail: 'Review records', action: 'Review', href: '/reports?storeId=main' }));
    render(<HomeAttentionList rows={rows} reportsHref="/reports?storeId=main" />);
    const panel = screen.getByRole('region', { name: 'Needs your attention' });
    const [preview, remaining] = within(panel).getAllByRole('list');
    expect(within(preview).getAllByRole('listitem')).toHaveLength(3);
    expect(within(preview).queryByText('Issue 4')).not.toBeInTheDocument();
    const summary = screen.getByText('View all', { exact: true });
    expect(summary).toBeVisible();
    const disclosure = summary.closest('details');
    expect(disclosure).toBeInTheDocument();
    expect(disclosure).not.toHaveAttribute('open');
    expect(disclosure).toContainElement(remaining);
    expect(within(remaining).getAllByRole('listitem')).toHaveLength(1);
    expect(within(remaining).getByText('Issue 4')).toBeInTheDocument();
  });
});
