import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PurchasesPage from './page';

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireBusinessAndOptionalStore: auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findMany: async () => [] }, supplier: { findMany: async () => [] },
    purchaseInvoice: { count: async () => 0, findMany: async () => [] },
    shift: { findMany: async () => [] }, user: { findMany: async () => [] },
  },
}));
vi.mock('@/lib/services/stores', () => ({
  getBusinessStores: async () => ({ stores: [{ id: 'main', name: 'Main shop' }] }),
}));
vi.mock('@/lib/units/list-selectable-units', () => ({ listSelectableUnits: async () => [] }));
vi.mock('./PurchaseFormClient', () => ({
  default: ({ photoOptional }: { photoOptional: boolean }) =>
    <p>{photoOptional ? 'Photo optional' : 'Photo required'}</p>,
}));

const getContext = (businessCategory: string) => ({
  business: { id: 'business', businessCategory, currency: 'GHS', requirePurchasePhoto: false },
  store: { id: 'main', name: 'Main shop' },
  stores: [{ id: 'main', name: 'Main shop' }],
  user: { role: 'OWNER' },
});

it('keeps retail on the original Receive stock button and form with required documents', async () => {
  auth.mockResolvedValue(getContext('RETAIL'));
  render(await PurchasesPage({}));
  expect(screen.getByRole('button', { name: 'Record purchase' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Record purchase' })).not.toBeInTheDocument();
  expect(screen.getByText('Receive stock')).toBeInTheDocument();
  expect(screen.getByText('Photo required')).toBeInTheDocument();
});

it('links only food businesses to Quick purchase and keeps a full-form fallback', async () => {
  auth.mockResolvedValue(getContext('FOOD_DISHES'));
  const { unmount } = render(await PurchasesPage({}));
  expect(screen.getByRole('link', { name: 'Record purchase' })).toHaveAttribute('href', '/purchases/quick');
  expect(screen.queryByText('Receive stock')).not.toBeInTheDocument();
  unmount();
  render(await PurchasesPage({ searchParams: Promise.resolve({ full: '1' }) }));
  expect(screen.getByText('Receive stock').closest('details')).toHaveAttribute('open');
  expect(screen.getByText('Photo optional')).toBeVisible();
});
