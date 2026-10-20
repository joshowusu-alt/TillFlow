import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({
  db: { supplier: { findFirst: vi.fn() }, product: { findMany: vi.fn() }, purchaseInvoice: { findMany: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.db }));
vi.mock('@/lib/auth', () => ({ requireBusiness: async () => ({ business: { id: 'business', currency: 'GHS', timezone: 'Africa/Accra' } }) }));
vi.mock('@/lib/features', () => ({ getFeatures: () => ({ advancedReports: false }) }));
vi.mock('@/app/actions/suppliers', () => ({ updateSupplierAction: '/unused' }));
vi.mock('@/components/DownloadLink', () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/components/SubmitButton', () => ({ default: ({ children }: { children: ReactNode }) => <button>{children}</button> }));
vi.mock('@/components/SetPurchaseDueDateButton', () => ({ default: () => null }));
import SupplierDetailPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.supplier.findFirst.mockResolvedValue({ id: 'supplier', name: 'Supplier', creditLimitPence: 10000, purchaseInvoices: [] });
  mocks.db.product.findMany.mockResolvedValue([]);
  mocks.db.purchaseInvoice.findMany.mockResolvedValue([{ createdAt: new Date('2025-01-01'), paymentStatus: 'UNPAID', totalPence: 7000, payments: [] }]);
});
it('keeps the full balance and credit availability visible when filtered history is empty', async () => {
  const html = renderToStaticMarkup(await SupplierDetailPage({ params: { id: 'supplier' }, searchParams: { from: '2026-10-01', to: '2026-10-31' } }));
  const root = document.createElement('div'); root.innerHTML = html;
  const hero = root.querySelector('section')!;
  expect(hero.textContent).toContain('GH₵70.00');
  expect(hero.textContent).toContain('History filters do not change this balance');
  expect(root.textContent).toContain('GH₵30.00 remaining');
  expect(root.textContent).toContain('Balance on selected purchases: GH₵0.00');
  expect(root.textContent).toContain('Showing 0–0 of 0 matching purchases');
});
it('labels an excess payment as supplier credit rather than an amount owed', async () => {
  mocks.db.purchaseInvoice.findMany.mockResolvedValue([{ createdAt: new Date('2025-01-01'), paymentStatus: 'PAID', totalPence: 1000, payments: [{ amountPence: 1500, paidAt: new Date('2026-01-01') }] }]);
  const html = renderToStaticMarkup(await SupplierDetailPage({ params: { id: 'supplier' } }));
  expect(html).toContain('Supplier credit balance');
  expect(html).toContain('review excess payments');
});
it('starts the long sections collapsed and limits purchases to a paged history', async () => {
  const html = renderToStaticMarkup(await SupplierDetailPage({ params: { id: 'supplier' } }));
  const root = document.createElement('div'); root.innerHTML = html;
  for (const id of ['purchase-history', 'supplier-statement', 'products-supplied']) expect(root.querySelector(`details#${id}`)?.hasAttribute('open')).toBe(false);
  expect(mocks.db.supplier.findFirst.mock.calls[0][0].include.purchaseInvoices).toMatchObject({ skip: 0, take: 25 });
});
it('keeps filtered and paged history open without changing the account query', async () => {
  const html = renderToStaticMarkup(await SupplierDetailPage({ params: { id: 'supplier' }, searchParams: { historyPage: '2' } }));
  const root = document.createElement('div'); root.innerHTML = html;
  expect(root.querySelector('details#purchase-history')?.hasAttribute('open')).toBe(true);
  expect(mocks.db.supplier.findFirst.mock.calls[0][0].include.purchaseInvoices).toMatchObject({ skip: 25, take: 25 });
  expect(root.querySelector('section')?.textContent).toContain('GH₵70.00');
});
