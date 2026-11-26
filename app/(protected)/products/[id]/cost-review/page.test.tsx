import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireBusiness: mocks.auth }));
vi.mock('@/lib/services/product-cost-review', () => ({ getProductCostReview: mocks.load, COST_REVIEW_PAGE_SIZE: 25 }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
import ProductCostReviewPage from './page';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ business: { id: 'authenticated-business', currency: 'GHS', timezone: 'Africa/Accra' } });
  mocks.load.mockResolvedValue(null);
});
it('requires owner or manager and resolves the exact product within that business', async () => {
  await expect(ProductCostReviewPage({ params: Promise.resolve({ id: 'selected-product' }), searchParams: Promise.resolve({ page: '2' }) })).rejects.toThrow('NOT_FOUND');
  expect(mocks.auth).toHaveBeenCalledWith(['OWNER', 'MANAGER']);
  expect(mocks.load).toHaveBeenCalledWith('authenticated-business', 'selected-product', 2);
});
it('shows purchase evidence first, distinguishes stock and earlier sales, and preserves the report period', async () => {
  mocks.load.mockResolvedValue({
    product:{id:'rice',name:'Rice',defaultCostBasePence:12800,inventoryBalances:[{qtyOnHandBase:3,knownValuePence:null,unvaluedQtyBase:3,store:{id:'main',name:'Main'}}]},
    saleCount:2,page:1,sales:[{id:'sale-line',qtyBase:1,salesInvoice:{id:'sale',transactionNumber:'INV-1',createdAt:new Date('2026-11-16'),store:{id:'main',name:'Main'}}}],receipts:[],
  });
  const html=renderToStaticMarkup(await ProductCostReviewPage({params:Promise.resolve({id:'rice'}),searchParams:Promise.resolve({from:'2026-11-01',to:'2026-11-26',metric:'grossProfit'})}));
  expect(html.indexOf('1. Check purchase records')).toBeLessThan(html.indexOf('2. Check stock value by branch'));
  expect(html).toContain('No qualifying purchase receipt is recorded');
  expect(html).toContain('Do not guess a cost');
  expect(html).toContain('Not established');
  expect(html).toContain('3. Check earlier sale costs (2 lines)');
  expect(html).toContain('GH₵128.00');
  expect(html).toContain('/products/rice/cost-review/preview?from=2026-11-01&amp;to=2026-11-26&amp;metric=grossProfit&amp;storeId=main');
  expect(html).toContain('/reports/income-statement/entries?from=2026-11-01&amp;to=2026-11-26&amp;metric=grossProfit&amp;issues=1');
});
