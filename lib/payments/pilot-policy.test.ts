import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/prisma', () => ({ prisma: {
  mobileMoneyCollection: { create: vi.fn(), findFirst: vi.fn() },
  webhookDeadLetter: { create: vi.fn() }, $transaction: vi.fn(),
} }));
import { prisma } from '@/lib/prisma';
import { manualPaymentsOnly } from './pilot-policy';
import { getMomoManualGuidance } from './pos-momo';
import { initiateMobileMoneyCollection, checkMobileMoneyCollectionStatus,
  reinitiateMobileMoneyCollection, reconcileMobileMoneyCollections,
  handleMobileMoneyWebhook } from '@/lib/services/mobile-money';
import { POST } from '@/app/api/payments/momo/webhook/mtn/route';
import { NextRequest } from 'next/server';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('manual-payment pilot restriction', () => {
  it('does not change the default non-pilot policy', () => {
    vi.stubEnv('TILLFLOW_PILOT_MANUAL_PAYMENTS', '');
    expect(manualPaymentsOnly()).toBe(false);
  });
  it.each([
    ['initiate', () => initiateMobileMoneyCollection({} as never)],
    ['poll', () => checkMobileMoneyCollectionStatus({ businessId: 'fictional', collectionId: 'fictional' })],
    ['reinitiate', () => reinitiateMobileMoneyCollection({ businessId: 'fictional', collectionId: 'fictional' })],
    ['reconcile', () => reconcileMobileMoneyCollections({ businessId: 'fictional' })],
    ['webhook service', () => handleMobileMoneyWebhook({ providerKey: 'MTN_COLLECTIONS', body: {}, headers: {} })],
  ])('refuses %s before database or provider access', async (_name, action) => {
    vi.stubEnv('TILLFLOW_PILOT_MANUAL_PAYMENTS', '1');
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(action()).rejects.toThrow('Automated MoMo collections are disabled');
    expect(fetch).not.toHaveBeenCalled();
    expect(prisma.mobileMoneyCollection.create).not.toHaveBeenCalled();
    expect(prisma.mobileMoneyCollection.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('refuses webhook HTTP traffic without storing or applying its payload', async () => {
    vi.stubEnv('TILLFLOW_PILOT_MANUAL_PAYMENTS', '1');
    const result = await POST(new NextRequest('http://localhost/api/payments/momo/webhook/mtn', { method: 'POST', body: '{}' }));
    expect(result.status).toBe(503);
    expect(prisma.webhookDeadLetter.create).not.toHaveBeenCalled();
    expect(prisma.mobileMoneyCollection.create).not.toHaveBeenCalled();
  });
  it.each(['MTN', 'TELECEL', 'AIRTELTIGO', undefined])('labels %s recording as distinct from settlement', provider => {
    expect(getMomoManualGuidance(provider)).toContain('merchant account or statement');
    expect(getMomoManualGuidance(provider)).toContain('does not independently confirm provider settlement');
  });
});
