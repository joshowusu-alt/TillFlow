import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ business: vi.fn(), transaction: vi.fn(), practitioner: vi.fn(), context: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { business: { findUnique: mocked.business }, pharmacyPractitioner: { findFirst: mocked.practitioner }, $transaction: mocked.transaction } }));
vi.mock('@/lib/action-utils', () => ({ withBusinessContext: mocked.context, requireSelectedStoreContext: vi.fn(), safeAction: (work: () => unknown) => work(), formAction: (work: () => unknown) => work(), ok: () => ({ success: true }), UserError: class UserError extends Error {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
import { setPharmacyEnabledAction } from './pharmacy';

describe('pharmacy pilot activation boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.context.mockResolvedValue({ businessId: 'synthetic', user: { id: 'owner', role: 'OWNER', name: 'Owner' } });
    mocked.business.mockResolvedValue({ businessCategory: 'PHARMACY' });
  });
  it('refuses production activation before writing any settings', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const data = new FormData(); data.set('enabled', 'true'); data.set('confirm', 'on');
    try {
      await expect(setPharmacyEnabledAction(data)).rejects.toThrow('Production activation is not available yet');
      expect(mocked.transaction).not.toHaveBeenCalled();
      expect(mocked.practitioner).not.toHaveBeenCalled();
      expect(mocked.context).toHaveBeenCalledWith(['OWNER']);
    } finally { vi.unstubAllEnvs(); }
  });
  it('requires explicit confirmation in preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    const data = new FormData(); data.set('enabled', 'true');
    try {
      await expect(setPharmacyEnabledAction(data)).rejects.toThrow('Confirm the pharmacy pilot requirements');
      expect(mocked.transaction).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });
});
