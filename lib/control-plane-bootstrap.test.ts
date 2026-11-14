import { expect, it, vi } from 'vitest';
import { ensureControlPlaneBusinessBootstrap } from './control-plane-bootstrap';

it('writes pesewas alongside the legacy whole-cedi subscription amount', async () => {
  const upsert = vi.fn(async () => undefined);
  await ensureControlPlaneBusinessBootstrap({
    controlBusinessProfile: { upsert: async () => ({ id: 'profile' }) },
    controlSubscription: { upsert },
  }, { businessId: 'business', plan: 'PRO', status: 'ACTIVE' });
  const write = (upsert.mock.calls as unknown as [Record<string, Record<string, number>>][])[0][0];
  for (const row of [write.create, write.update]) {
    expect(row.monthlyValuePence).toBeGreaterThan(0);
    expect(row.monthlyValueMinorUnits).toBe(row.monthlyValuePence * 100);
  }
});
