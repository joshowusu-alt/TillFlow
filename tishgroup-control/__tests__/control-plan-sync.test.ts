import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBillingEntitlement } from '../../lib/billing-entitlements';
import { getFeatures, type BusinessPlan } from '../../lib/features';
import { paymentPlanChangeNotice, planAfterPayment } from '@/lib/payment-plan';
import {
  bulkReviewControlBusinessesAction,
  recordControlPaymentAction,
  reviewControlBusinessAction,
  updateControlSubscriptionAction,
} from '@/app/actions/control-businesses';

const fixture = vi.hoisted(() => {
  const businesses = new Map<string, {
    id: string; name: string; plan: 'STARTER' | 'GROWTH' | 'PRO';
    selectedPlan: 'STARTER' | 'GROWTH' | 'PRO';
    addonOnlineStorefront: boolean; users: unknown[];
  }>();
  const subscriptions = new Map<string, Record<string, unknown>>();
  const tx = {
    business: {
      findUnique: async ({ where }: { where: { id: string } }) => businesses.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const business = businesses.get(where.id);
        if (!business) throw Error('Missing business fixture');
        Object.assign(business, data);
        return business;
      },
    },
    controlBusinessProfile: {
      upsert: async ({ where }: { where: { businessId: string } }) => ({ id: where.businessId, supportStatus: 'HEALTHY' }),
      update: async () => ({}),
    },
    controlSubscription: {
      findUnique: async ({ where }: { where: { controlBusinessId: string } }) => subscriptions.get(where.controlBusinessId) ?? null,
      upsert: async ({ where, update, create }: { where: { controlBusinessId: string }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
        const id = where.controlBusinessId;
        subscriptions.set(id, subscriptions.has(id) ? { ...subscriptions.get(id), ...update } : create);
      },
    },
    controlPayment: { create: vi.fn() },
  };
  return { businesses, subscriptions, tx };
});
vi.mock('@/lib/prisma', () => ({
  prisma: { ...fixture.tx, $transaction: async (work: (tx: typeof fixture.tx) => unknown) => work(fixture.tx) },
}));
vi.mock('@/lib/control-auth', () => ({
  requireControlStaff: async () => ({ id: 'staff', name: 'Test staff', email: 'staff@example.invalid', role: 'CONTROL_ADMIN' }),
  canManageSubscriptions: () => true,
  canRecordPayments: () => true,
  canWriteNotes: () => true,
  canManageStaff: () => false,
}));
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('@/lib/error-monitor', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notifyStateTransition: vi.fn(), notifyPaymentRecorded: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(url); } }));

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

function expectPlan(id: string, plan: BusinessPlan) {
  const business = fixture.businesses.get(id)!;
  expect(business).toMatchObject({ plan, selectedPlan: plan });
  expect(fixture.subscriptions.get(id)).toMatchObject({ purchasedPlan: plan });
  expect(getBillingEntitlement(business)).toMatchObject({ purchasedPlan: plan, effectivePlan: plan });
}

beforeEach(() => {
  fixture.businesses.clear();
  fixture.subscriptions.clear();
  vi.clearAllMocks();
  for (const id of ['cafe', 'grill']) {
    fixture.businesses.set(id, {
      id, name: id, plan: 'STARTER', selectedPlan: 'STARTER', addonOnlineStorefront: false, users: [],
    });
  }
});

describe('Control plan changes propagate to TillFlow', () => {
  it('saves a subscription upgrade with the online storefront add-on', async () => {
    await expect(updateControlSubscriptionAction(form({
      businessId: 'cafe', purchasedPlan: 'GROWTH', status: 'PAID_ACTIVE', billingCadence: 'MONTHLY',
      addonOnlineStorefront: 'on',
    }))).rejects.toThrow('updated=subscription');
    expectPlan('cafe', 'GROWTH');
    const business = fixture.businesses.get('cafe')!;
    expect(getFeatures(getBillingEntitlement(business).effectivePlan, 'SINGLE_STORE', {
      onlineStorefront: business.addonOnlineStorefront,
    }).onlineStorefront).toBe(true);
  });

  it('syncs a sold plan saved during an individual review', async () => {
    await expect(reviewControlBusinessAction(form({
      businessId: 'cafe', purchasedPlan: 'PRO', billingCadence: 'MONTHLY',
    }))).rejects.toThrow('updated=review');
    expectPlan('cafe', 'PRO');
  });

  it('syncs every selected business in a bulk sold-plan review', async () => {
    const data = form({ purchasedPlan: 'GROWTH', billingCadence: 'MONTHLY' });
    data.append('selectedId', 'cafe');
    data.append('selectedId', 'grill');
    await expect(bulkReviewControlBusinessesAction(data)).rejects.toThrow('updated=bulk-review');
    expectPlan('cafe', 'GROWTH');
    expectPlan('grill', 'GROWTH');
  });

  it('reconciles the plan on payment and previews the same resulting plan', async () => {
    fixture.subscriptions.set('cafe', { purchasedPlan: 'PRO' });
    const business = fixture.businesses.get('cafe')!;
    const target = planAfterPayment('PRO', business.plan);
    expect(paymentPlanChangeNotice(target)).toBe('Recording this payment will set the TillFlow plan to Pro.');
    expect(paymentPlanChangeNotice(null)).toBeNull();
    await expect(recordControlPaymentAction(form({
      businessId: 'cafe', billingCadence: 'MONTHLY', amountPence: '699', method: 'MOMO',
    }))).rejects.toThrow('updated=payment');
    expect(fixture.tx.controlPayment.create).toHaveBeenCalledOnce();
    expectPlan('cafe', target);
  });
});
