import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), business: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getUser: mocks.user }));
vi.mock('@/lib/prisma', () => ({ prisma: { business: { findUnique: mocks.business } } }));
import { storefrontPreviewOwner, QA_BUSINESS } from './storefront-preview-guard';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'fix/storefront-reliability-alerts');
  vi.stubEnv('POSTGRES_PRISMA_URL', 'postgresql://fictional:unused@ep-raspy-cell-za73nd28-pooler.c-2.eu-west-2.aws.neon.tech/tillflow_preview');
  mocks.user.mockResolvedValue({ role: 'OWNER', businessId: QA_BUSINESS });
  mocks.business.mockResolvedValue({ storefrontSlug: 'storefront-preview-134', smsNotificationsEnabled: false });
});
afterEach(() => vi.unstubAllEnvs());
it('allows only the isolated fictional shop owner', async () => { expect(await storefrontPreviewOwner()).toMatchObject({ role: 'OWNER', businessId: QA_BUSINESS }); });
it.each(['production', 'development'])('rejects %s before reading an account', async environment => {
  vi.stubEnv('VERCEL_ENV', environment); expect(await storefrontPreviewOwner()).toBeNull(); expect(mocks.user).not.toHaveBeenCalled();
});
it('rejects another branch', async () => { vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'master'); expect(await storefrontPreviewOwner()).toBeNull(); });
it.each([
  'postgresql://fictional:unused@production.neon.tech/tillflow_preview',
  'postgresql://fictional:unused@ep-raspy-cell-za73nd28-pooler.attacker.example/tillflow_preview',
  'postgresql://fictional:unused@ep-raspy-cell-za73nd28-pooler.c-2.eu-west-2.aws.neon.tech/another_database',
])('rejects an unmatched database identity', async url => { vi.stubEnv('POSTGRES_PRISMA_URL', url); expect(await storefrontPreviewOwner()).toBeNull(); });
it('rejects a cashier or another business owner', async () => {
  mocks.user.mockResolvedValue({ role: 'CASHIER', businessId: QA_BUSINESS }); expect(await storefrontPreviewOwner()).toBeNull();
  mocks.user.mockResolvedValue({ role: 'OWNER', businessId: 'another-shop' }); expect(await storefrontPreviewOwner()).toBeNull();
});
it('rejects SMS-enabled or renamed fixture businesses', async () => {
  mocks.business.mockResolvedValue({ storefrontSlug: 'storefront-preview-134', smsNotificationsEnabled: true }); expect(await storefrontPreviewOwner()).toBeNull();
  mocks.business.mockResolvedValue({ storefrontSlug: 'merchant-shop', smsNotificationsEnabled: false }); expect(await storefrontPreviewOwner()).toBeNull();
});
