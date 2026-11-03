import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), sales: vi.fn(), products: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireBusiness: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { salesInvoice: { count: mocks.sales }, product: { count: mocks.products } } }));
vi.mock('@/lib/performance/home-perf-instrumentation', () => ({ measureHomePerf: (_: string, fn: () => Promise<unknown>) => fn() }));
import { getOwnerHomeCriticalShell } from './critical-shell';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { name: 'Owner' }, business: { id: 'business', name: 'Shop', currency: 'GHS', plan: 'GROWTH', storeMode: 'SINGLE_STORE', onboardingCompletedAt: null, guidedSetup: true } });
});
describe('useful Home critical path', () => {
  it('opens established Home without waiting for product or stock counts', async () => {
    mocks.sales.mockResolvedValue(12);
    expect(await getOwnerHomeCriticalShell()).toMatchObject({ saleCount: 12, onboardingComplete: true, needsFullReadiness: false });
    expect(mocks.auth).toHaveBeenCalledWith(['OWNER']);
    expect(mocks.products).not.toHaveBeenCalled();
    expect(mocks.sales).toHaveBeenCalledWith({ where: { businessId: 'business', paymentStatus: { notIn: ['RETURNED', 'VOID'] }, OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }] } });
  });
  it('still sends a business without a genuine sale to the full readiness checklist', async () => {
    mocks.sales.mockResolvedValue(0);
    expect(await getOwnerHomeCriticalShell()).toMatchObject({ onboardingComplete: false, needsFullReadiness: true });
    expect(mocks.products).not.toHaveBeenCalled();
  });
});
