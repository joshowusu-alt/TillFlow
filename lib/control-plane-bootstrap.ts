import type { BusinessPlan } from './features';
import { PLAN_MONTHLY_PRICES } from './plan-pricing';

type ControlPlaneClient = {
  controlBusinessProfile: {
    upsert: (args: Record<string, unknown>) => Promise<{ id: string }>;
  };
  controlSubscription: {
    upsert: (args: Record<string, unknown>) => Promise<unknown>;
  };
};

type BootstrapInput = {
  businessId: string;
  ownerName?: string | null;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  plan?: string | null;
  status?: string | null;
  billingCadence?: string | null;
  nextDueDate?: Date | null;
  lastPaymentDate?: Date | null;
  supportStatus?: string | null;
  notes?: string | null;
  startedAt?: Date | null;
};

function isMissingControlPlaneSchemaError(error: unknown) {
  return error instanceof Error && (
    error.message.includes('ControlBusinessProfile')
    || error.message.includes('ControlSubscription')
    || error.message.includes('no such table')
    || error.message.includes('does not exist in the current database')
  );
}

function normalizePlan(value?: string | null): BusinessPlan {
  return value === 'PRO' || value === 'GROWTH' ? value : 'STARTER';
}

function normalizeSubscriptionStatus(value?: string | null) {
  switch (String(value ?? '').toUpperCase()) {
    case 'TRIAL':
      return 'TRIAL';
    case 'READ_ONLY':
      return 'READ_ONLY';
    case 'SUSPENDED':
      return 'SUSPENDED';
    case 'ACTIVE':
    default:
      return 'ACTIVE';
  }
}

function normalizeBillingCadence(value?: string | null) {
  return String(value ?? '').toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
}

export async function ensureControlPlaneBusinessBootstrap(client: ControlPlaneClient, input: BootstrapInput) {
  const purchasedPlan = normalizePlan(input.plan);
  const status = normalizeSubscriptionStatus(input.status);
  const billingCadence = normalizeBillingCadence(input.billingCadence);
  const startedAt = input.startedAt ?? new Date();

  try {
    const profile = await client.controlBusinessProfile.upsert({
      where: { businessId: input.businessId },
      update: {
        ownerName: input.ownerName ?? undefined,
        ownerPhone: input.ownerPhone ?? undefined,
        ownerEmail: input.ownerEmail ?? undefined,
        supportStatus: input.supportStatus ?? undefined,
        notes: input.notes ?? undefined,
      },
      create: {
        businessId: input.businessId,
        ownerName: input.ownerName ?? null,
        ownerPhone: input.ownerPhone ?? null,
        ownerEmail: input.ownerEmail ?? null,
        supportStatus: input.supportStatus ?? 'UNREVIEWED',
        notes: input.notes ?? 'Awaiting first Tishgroup commercial review.',
      },
    });

    await client.controlSubscription.upsert({
      where: { controlBusinessId: profile.id },
      update: {
        purchasedPlan,
        status,
        billingCadence,
        nextDueDate: input.nextDueDate ?? null,
        lastPaymentDate: input.lastPaymentDate ?? null,
        monthlyValuePence: PLAN_MONTHLY_PRICES[purchasedPlan],
      },
      create: {
        controlBusinessId: profile.id,
        purchasedPlan,
        status,
        billingCadence,
        startDate: startedAt,
        nextDueDate: input.nextDueDate ?? null,
        lastPaymentDate: input.lastPaymentDate ?? null,
        monthlyValuePence: PLAN_MONTHLY_PRICES[purchasedPlan],
      },
    });

    return { ok: true as const };
  } catch (error) {
    if (isMissingControlPlaneSchemaError(error)) {
      return { ok: false as const, reason: 'schema-missing' as const };
    }
    throw error;
  }
}