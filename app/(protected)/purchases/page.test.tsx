import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PurchasesPage from './page';

const { auth, count, findMany } = vi.hoisted(() => ({ auth: vi.fn(), count: vi.fn(async (_args: unknown) => 0), findMany: vi.fn(async (_args: unknown): Promise<unknown[]> => []) }));
vi.mock('@/lib/auth', () => ({ requireBusinessAndOptionalStore: auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findMany: async () => [] }, supplier: { findMany: async () => [] },
    purchaseInvoice: { count, findMany },
    shift: { findMany: async () => [] }, user: { findMany: async () => [] },
  },
}));
vi.mock('@/lib/services/stores', () => ({
  getBusinessStores: async () => ({ stores: [{ id: 'main', name: 'Main shop' }] }),
}));
vi.mock('@/lib/units/list-selectable-units', () => ({ listSelectableUnits: async () => [] }));
vi.mock('./PurchaseFormClient', () => ({
  default: () => <p>Purchase form</p>,
}));

const getContext = (businessCategory: string) => ({
  business: { id: 'business', businessCategory, currency: 'GHS', requirePurchasePhoto: false },
  store: { id: 'main', name: 'Main shop' },
  stores: [{ id: 'main', name: 'Main shop' }],
  user: { role: 'OWNER' },
});

it('keeps retail on the Receive stock form without required documents', async () => {
  auth.mockResolvedValue(getContext('RETAIL'));
  render(await PurchasesPage({}));
  expect(screen.getByRole('button', { name: 'Record purchase' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Record purchase' })).not.toBeInTheDocument();
  expect(screen.getByText('Receive stock')).toBeInTheDocument();
  expect(screen.getByText('Purchase form')).toBeInTheDocument();
});

it('links only food businesses to Quick purchase and keeps a full-form fallback', async () => {
  auth.mockResolvedValue(getContext('FOOD_DISHES'));
  const { unmount } = render(await PurchasesPage({}));
  expect(screen.getByRole('link', { name: 'Record purchase' })).toHaveAttribute('href', '/purchases/quick');
  expect(screen.queryByText('Receive stock')).not.toBeInTheDocument();
  unmount();
  render(await PurchasesPage({ searchParams: Promise.resolve({ full: '1' }) }));
  expect(screen.getByText('Receive stock').closest('details')).toHaveAttribute('open');
  expect(screen.getByText('Purchase form')).toBeVisible();
});

it('searches the full matching set before pagination and counts outstanding purchases across pages', async () => {
  auth.mockResolvedValue(getContext('RETAIL'));
  count.mockResolvedValueOnce(60);
  findMany.mockImplementation(async (args: any) => args.take ? [] : Array.from({length: 60}, (_, i) => ({paymentStatus: 'UNPAID', totalPence: 100, payments: i < 30 ? [] : [{amountPence:100}]})));
  render(await PurchasesPage({searchParams: Promise.resolve({q: 'PUR-000099', page: '2'})}));
  const where = expect.objectContaining({businessId: 'business', OR: [{supplier: {name: expect.objectContaining({contains:'PUR-000099'})}}, {transactionNumber: expect.objectContaining({contains:'PUR-000099'})}]});
  expect(count).toHaveBeenCalledWith({where});
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({where, skip: expect.any(Number), take: expect.any(Number)}));
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({where, select: expect.objectContaining({payments: expect.anything()})}));
  expect(screen.getByText('Awaiting payment').parentElement).toHaveTextContent('30');
  findMany.mockReset().mockResolvedValue([]);
});
