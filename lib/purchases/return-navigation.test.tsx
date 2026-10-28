import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  db: { product: { findMany: vi.fn() }, supplier: { findMany: vi.fn() }, purchaseInvoice: { count: vi.fn(), findMany: vi.fn() }, shift: { findMany: vi.fn() }, user: { findMany: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.db }));
vi.mock('@/lib/auth', () => ({ requireBusinessAndOptionalStore: async () => ({ business: { id: 'business', currency: 'GHS' }, store: { id: 'store', name: 'Main' }, stores: [{ id: 'store', name: 'Main' }], user: { role: 'OWNER' } }) }));
vi.mock('@/lib/services/stores', () => ({ getBusinessStores: async () => ({ stores: [{ id: 'store', name: 'Main' }] }) }));
vi.mock('@/lib/units/list-selectable-units', () => ({ listSelectableUnits: async () => [] }));
vi.mock('@/lib/services/purchase-funding', () => ({ accountBalance: async () => 0, holdingCode: () => '' }));
vi.mock('@/lib/improve-records-load', () => ({ listPurchasesNeedingSupplier: async () => [] }));
vi.mock('@/app/(protected)/purchases/PurchaseFormClient', () => ({ default: () => null }));
vi.mock('@/app/(protected)/purchases/DeletePurchaseButton', () => ({ default: () => null }));
vi.mock('@/app/(protected)/purchases/RecordPurchaseButton', () => ({ default: () => null }));
vi.mock('@/components/InlinePaymentForm', () => ({ default: () => null }));
vi.mock('@/components/LinkPurchaseSupplierForm', () => ({ default: () => null }));
vi.mock('@/components/EffectiveStoreBanner', () => ({ default: () => null }));
import PurchasesPage from '@/app/(protected)/purchases/page';

const invoice = { id: 'invoice-1', storeId: 'store', transactionNumber: 'PUR-1', supplierInvoiceNumber: null, receiptDocumentType: 'INVOICE', invoiceReceivedAt: null, createdAt: new Date('2026-10-28Z'), paymentStatus: 'PAID', totalPence: 10000, returnCreditPence: 0, creditAppliedPence: 0, creditSettledPence: 0, payments: [{ amountPence: 10000 }], supplier: { name: 'Supplier' }, purchaseReturn: null, _count: { lines: 1 }, lines: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.product.findMany.mockResolvedValue([]);
  mocks.db.supplier.findMany.mockResolvedValue([]);
  mocks.db.shift.findMany.mockResolvedValue([]);
  mocks.db.user.findMany.mockResolvedValue([]);
  mocks.db.purchaseInvoice.count.mockResolvedValue(1);
  mocks.db.purchaseInvoice.findMany.mockResolvedValue([invoice]);
});

it('takes both mobile and desktop return actions to item selection for the chosen invoice', async () => {
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(await PurchasesPage({}));
  const links = [...root.querySelectorAll('a')].filter(link => link.textContent?.trim() === 'Return selected items');
  expect(links).toHaveLength(2);
  expect(links.map(link => link.getAttribute('href'))).toEqual(['/purchases/partial-return/invoice-1', '/purchases/partial-return/invoice-1']);
  expect(root.querySelector('a[href^="/purchases/return/"]')).toBeNull();
});

it.each(['RETURNED', 'VOID'])('keeps return actions unavailable for %s purchases', async paymentStatus => {
  mocks.db.purchaseInvoice.findMany.mockResolvedValue([{ ...invoice, paymentStatus }]);
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(await PurchasesPage({}));
  expect(root.querySelector('a[href^="/purchases/partial-return/"]')).toBeNull();
});
