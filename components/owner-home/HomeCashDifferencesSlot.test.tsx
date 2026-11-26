import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/app/actions/operational-store', () => ({ switchOperationalStoreAction: vi.fn() }));
vi.mock('@/lib/owner-home/cash-differences', () => ({ getUnreviewedHomeCashDifferences: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
import { HomeCashDifferencesCard } from './HomeCashDifferencesSlot';

describe('cash differences on Owner Home', () => {
  const row = { id: 'review-a', storeId: 'store-b', storeName: 'Branch B', cashier: 'Fictional Cashier', cashierId: 'cashier-a', date: new Date('2026-11-26T12:00:00Z'), variancePence: -8000, reason: 'Missing cash', large: true };
  it('shows signed cash, date, cashier, reason, Large tag and the correct branch review destination', () => {
    render(<HomeCashDifferencesCard rows={[row]} currency="GHS" />);
    expect(screen.getByRole('heading', { name: 'Needs your attention' })).toBeVisible();
    expect(screen.getByText('-GH₵80.00')).toBeVisible();
    expect(screen.getByText('Fictional Cashier')).toBeVisible();
    expect(screen.getByText(/26 Nov 2026/)).toBeVisible();
    expect(screen.getByText('Missing cash')).toBeVisible();
    expect(screen.getByText('Large')).toHaveClass('text-rose-800');
    const form = screen.getByRole('button', { name: /Fictional Cashier/ }).closest('form')!;
    expect(new FormData(form).get('storeId')).toBe('store-b');
    expect(new FormData(form).get('returnTo')).toBe('/shifts/variance/review-a?storeId=store-b');
  });
  it('hides the entire card when no differences need review', () => {
    render(<HomeCashDifferencesCard rows={[]} currency="GHS" />);
    expect(screen.queryByRole('heading', { name: 'Needs your attention' })).not.toBeInTheDocument();
  });
  it('prioritises the largest differences and keeps every branch record accessible', () => {
    const rows = [100, 200, 9000, 500, 8000].map((amount, i) => ({ ...row, id: String(i), cashier: `Cashier ${i}`, cashierId: String(i), variancePence: -amount, large: amount > 5000 }));
    render(<HomeCashDifferencesCard rows={rows} currency="GHS" />);
    const lists = screen.getAllByRole('list', { hidden: true });
    expect(lists[0].textContent).toMatch(/Cashier 2.*Cashier 4.*Cashier 3/);
    expect(screen.getByText('View all 5 cash differences')).toBeVisible();
    expect(lists[1].textContent).toContain('Cashier 0');
    expect(lists[1].textContent).toContain('Cashier 1');
  });
  it('counts repeated reviews using cashier identity, not the displayed name', () => {
    render(<HomeCashDifferencesCard rows={[row, { ...row, id: 'second' }, { ...row, id: 'third', cashierId: 'another-person' }]} currency="GHS" />);
    expect(screen.getAllByText('2 outstanding reviews for this cashier')).toHaveLength(2);
  });
});
