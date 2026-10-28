import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), redirect: vi.fn(),
  db: { purchaseInvoice: { findFirst: vi.fn() }, shift: { findMany: vi.fn() } },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.db }));
vi.mock('@/lib/auth', () => ({ requireBusinessAndOptionalStore: mocks.auth }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/app/actions/returns', () => ({ createPurchaseReturnAction: '/unused' }));
vi.mock('@/components/SubmitButton', () => ({ default: ({ children }: { children: ReactNode }) => <button>{children}</button> }));
import PurchaseReturnPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation(() => { throw new Error('PILOT_REDIRECT'); });
  mocks.auth.mockResolvedValue({ business: { id: 'biz', currency: 'GHS', isDemo: false }, store: { id: 'store' } });
  mocks.db.purchaseInvoice.findFirst.mockResolvedValue({ id: 'invoice', createdAt: new Date('2026-01-01Z'), totalPence: 4800, returnCreditPence: 0, creditSettledPence: 0, creditAppliedPence: 0, paymentStatus: 'UNPAID', storeId: 'store', store: { name: 'Main' }, supplier: { name: 'Supplier' }, payments: [], purchaseReturn: null });
  mocks.db.shift.findMany.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

it('distinguishes full reversal and offers item selection on the legacy screen', async () => {
  vi.stubEnv('VERCEL_ENV', 'production');
  const html = renderToStaticMarkup(await PurchaseReturnPage({ params: { id: 'invoice' } }));
  expect(html).toContain('Return full purchase');
  expect(html).toContain('This screen reverses the entire purchase.');
  expect(html).toContain('href="/purchases/partial-return/invoice"');
  expect(html).toContain('Return selected items');
});

it('opens credit-aware history instead of a second whole-invoice reversal when credits exist', async () => {
  vi.stubEnv('VERCEL_ENV', 'production');
  const invoice = await mocks.db.purchaseInvoice.findFirst();
  mocks.db.purchaseInvoice.findFirst.mockResolvedValue({ ...invoice, returnCreditPence: 1800 });
  await expect(PurchaseReturnPage({ params: { id: 'invoice' } })).rejects.toThrow('PILOT_REDIRECT');
  expect(mocks.redirect).toHaveBeenCalledWith('/purchases/partial-return/invoice');
});

it.each(['preview', 'production', 'development'])('preserves whole-invoice returns for ordinary businesses in %s', async environment => {
  vi.stubEnv('VERCEL_ENV', environment);
  const html = renderToStaticMarkup(await PurchaseReturnPage({ params: { id: 'invoice' } }));
  expect(html).toContain('Void Purchase');
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it('routes only preview demo purchases into the partial-return pilot', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  mocks.auth.mockResolvedValue({ business: { id: 'biz', currency: 'GHS', isDemo: true }, store: { id: 'store' } });
  await expect(PurchaseReturnPage({ params: { id: 'invoice' } })).rejects.toThrow('PILOT_REDIRECT');
  expect(mocks.redirect).toHaveBeenCalledWith('/purchases/partial-return/invoice');
});

it('keeps production demo businesses on the existing full-return form', async () => {
  vi.stubEnv('VERCEL_ENV', 'production');
  mocks.auth.mockResolvedValue({ business: { id: 'biz', currency: 'GHS', isDemo: true }, store: { id: 'store' } });
  expect(renderToStaticMarkup(await PurchaseReturnPage({ params: { id: 'invoice' } }))).toContain('Void Purchase');
  expect(mocks.redirect).not.toHaveBeenCalled();
});
