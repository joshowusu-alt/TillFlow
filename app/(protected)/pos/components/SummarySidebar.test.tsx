import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SummarySidebar from './SummarySidebar';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const baseProps = {
  business: { currency: 'GBP', vatEnabled: true },
  store: { name: 'Adabraka Branch' },
  cartItemCount: 3,
  totals: { subtotal: 1200, lineDiscount: 100, promoDiscount: 0, netSubtotal: 1100, vat: 150 },
  orderDiscount: 50,
  vatTotal: 143,
  totalDue: 1243,
  totalPaid: 1300,
  balanceRemaining: 0,
  cashTenderedValue: 1300,
  changeDue: 57,
  hasCash: true,
  lastReceiptId: 'receipt-1',
  parkedCarts: [
    { id: 'park-1', label: 'Counter hold', itemCount: 4, parkedAt: '2026-03-12T09:30:00.000Z' },
    { id: 'park-2', label: 'Mrs Mensah', itemCount: 2, parkedAt: '2026-03-12T09:55:00.000Z' },
  ],
  showParkedPanel: true,
  onToggleParkedPanel: vi.fn(),
  onRecallParked: vi.fn(),
  onDeleteParked: vi.fn(),
};

describe('SummarySidebar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows parked-sales hold context with relative age and actions', () => {
    render(<SummarySidebar {...baseProps} />);

    expect(screen.getByText('2 sales on hold')).toBeInTheDocument();
    expect(screen.getByText(/Oldest parked 30 min ago/i)).toBeInTheDocument();
    expect(screen.getByText('Counter hold')).toBeInTheDocument();
    expect(screen.getByText('Mrs Mensah')).toBeInTheDocument();
    expect(screen.getByText('30 min ago')).toBeInTheDocument();
  });

  it('calls recall and delete handlers for parked baskets', () => {
    render(<SummarySidebar {...baseProps} />);

    const recallButtons = screen.getAllByRole('button', { name: 'Recall' });
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });

    fireEvent.click(recallButtons[1]);
    fireEvent.click(deleteButtons[0]);

    expect(baseProps.onRecallParked).toHaveBeenCalledWith('park-2');
    expect(baseProps.onDeleteParked).toHaveBeenCalledWith('park-1');
  });

  it('toggles the parked-sales panel from the header button', () => {
    render(<SummarySidebar {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Parked Sales \(2\)/i }));

    expect(baseProps.onToggleParkedPanel).toHaveBeenCalledTimes(1);
  });
});