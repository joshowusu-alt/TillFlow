import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), notFound: vi.fn(),
  db: { purchaseInvoice: { findFirst: vi.fn(), findMany: vi.fn() }, inventoryBalance: { findMany: vi.fn() }, till: { findMany: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.db }));
vi.mock('@/lib/auth', () => ({ requireBusinessAndOptionalStore: mocks.auth }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/components/purchases/PartialPurchaseReturnForm', () => ({ default: () => <div>Return form available</div> }));
vi.mock('@/components/purchases/SupplierCreditSettlementForm', () => ({ default: () => <div>Settlement form available</div> }));
import PartialReturnPage from '@/app/(protected)/purchases/partial-return/[id]/page';
import CreditSettlementPage from '@/app/(protected)/purchases/credit-settlement/[id]/page';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VERCEL_ENV', 'production');
  mocks.notFound.mockImplementation(() => { throw new Error('NOT_FOUND'); });
  mocks.auth.mockResolvedValue({ business: { id: 'business', isDemo: false, currency: 'GHS' }, store: { id: 'store', name: 'Main' } });
  mocks.db.purchaseInvoice.findFirst.mockResolvedValue({ id: 'invoice', supplierId: 'supplier', supplier: { name: 'Supplier' }, totalPence: 12000, returnCreditPence: 4800, creditAppliedPence: 0, creditSettledPence: 0, paymentStatus: 'PAID', lines: [], returnCredits: [], creditSettlements: [], appliedCreditSettlements: [], payments: [{ amountPence: 12000 }], purchaseReturn: null });
  mocks.db.purchaseInvoice.findMany.mockResolvedValue([]);
  mocks.db.inventoryBalance.findMany.mockResolvedValue([]);
  mocks.db.till.findMany.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

it('offers selected-item returns to an ordinary production business within its selected branch', async () => {
  const html = renderToStaticMarkup(await PartialReturnPage({ params: { id: 'invoice' } }));
  expect(html).toContain('Return form available');
  expect(html).not.toContain('Preview pilot');
  expect(mocks.auth).toHaveBeenCalledWith(['OWNER', 'MANAGER']);
  expect(mocks.db.purchaseInvoice.findFirst.mock.calls[0][0].where).toEqual({ id: 'invoice', businessId: 'business', storeId: 'store' });
});

it('offers explicit credit settlement to an ordinary production business', async () => {
  const html = renderToStaticMarkup(await CreditSettlementPage({ params: { id: 'invoice' } }));
  expect(html).toContain('Settlement form available');
  expect(html).toContain('GH₵48.00');
  expect(html).not.toContain('Preview only');
  expect(mocks.auth).toHaveBeenCalledWith(['OWNER', 'MANAGER']);
  expect(mocks.db.purchaseInvoice.findFirst.mock.calls[0][0].where).toEqual({ id: 'invoice', businessId: 'business', storeId: 'store' });
});

it.each([PartialReturnPage, CreditSettlementPage])('does not expose a purchase outside the authorised business and branch', async page => {
  mocks.db.purchaseInvoice.findFirst.mockResolvedValue(null);
  await expect(page({ params: { id: 'foreign' } })).rejects.toThrow('NOT_FOUND');
});
