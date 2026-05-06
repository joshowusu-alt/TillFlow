import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountClient from './AccountClient';

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    replace,
    refresh,
  }),
}));

const baseProps = {
  slug: 'osu-mart',
  storefrontName: 'Osu Mart',
  branding: {
    logoUrl: null,
    primaryColor: '#2563eb',
    accentColor: '#0f172a',
    tagline: null,
  },
  currency: 'GHS',
  customer: {
    name: 'Ama',
    phone: '0241234567',
    email: 'ama@example.com',
  },
};

describe('AccountClient reorder flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.scrollTo = vi.fn();
    push.mockReset();
    replace.mockReset();
    refresh.mockReset();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('shows a confirmation dialog when only some previous items are still available', () => {
    render(
      <AccountClient
        {...baseProps}
        orders={[
          {
            id: 'order-1',
            orderNumber: 'TF-1001',
            status: 'PAID',
            paymentStatus: 'PAID',
            fulfillmentStatus: 'PROCESSING',
            totalPence: 4500,
            currency: 'GHS',
            createdAt: '2026-05-05T12:00:00.000Z',
            paidAt: '2026-05-05T12:03:00.000Z',
            publicToken: 'public-token',
            lines: [
              {
                id: 'line-1',
                productId: 'prod-1',
                unitId: 'unit-1',
                productName: 'Coca-Cola',
                unitName: 'Bottle',
                imageUrl: null,
                qtyInUnit: 2,
                unitPricePence: 1200,
                lineTotalPence: 2400,
              },
              {
                id: 'line-2',
                productId: 'prod-2',
                unitId: 'unit-2',
                productName: 'Plantain Chips',
                unitName: 'Pack',
                imageUrl: null,
                qtyInUnit: 1,
                unitPricePence: 2100,
                lineTotalPence: 2100,
              },
            ],
            reorderableLines: [
              {
                productId: 'prod-1',
                unitId: 'unit-1',
                qtyInUnit: 2,
              },
            ],
          },
        ]}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Buy again' }));
    });

    const dialog = screen.getByRole('dialog', { name: 'Confirm reorder' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Available now (1)')).toBeInTheDocument();
    expect(within(dialog).getByText('No longer available (1)')).toBeInTheDocument();
    expect(within(dialog).getByText(/Coca-Cola/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Plantain Chips/i)).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Add available items (1)' }));
    });

    expect(JSON.parse(window.localStorage.getItem('tillflow_cart_osu-mart') ?? '[]')).toMatchObject([
      { productId: 'prod-1', unitId: 'unit-1', qtyInUnit: 2 },
    ]);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(push).toHaveBeenCalledWith('/shop/osu-mart');
  });

  it('reorders immediately when every previous item is still available', () => {
    render(
      <AccountClient
        {...baseProps}
        orders={[
          {
            id: 'order-2',
            orderNumber: 'TF-1002',
            status: 'PAID',
            paymentStatus: 'PAID',
            fulfillmentStatus: 'READY_FOR_PICKUP',
            totalPence: 2400,
            currency: 'GHS',
            createdAt: '2026-05-05T14:00:00.000Z',
            paidAt: '2026-05-05T14:02:00.000Z',
            publicToken: 'public-token-2',
            lines: [
              {
                id: 'line-3',
                productId: 'prod-3',
                unitId: 'unit-3',
                productName: 'Malt',
                unitName: 'Bottle',
                imageUrl: null,
                qtyInUnit: 2,
                unitPricePence: 1200,
                lineTotalPence: 2400,
              },
            ],
            reorderableLines: [
              {
                productId: 'prod-3',
                unitId: 'unit-3',
                qtyInUnit: 2,
              },
            ],
          },
        ]}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Buy again' }));
    });

    expect(screen.queryByRole('dialog', { name: 'Confirm reorder' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(push).toHaveBeenCalledWith('/shop/osu-mart');
  });
});
