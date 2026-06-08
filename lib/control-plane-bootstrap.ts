import type { BusinessPlan } from './features';
import { computeSubscriptionPricing, controlMonthlyValueGhs } from './plan-pricing';

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
  referralSource?: string | null;
  referredByName?: string | null;
  referredByPhone?: string | null;
  sourceChannel?: string | null;
  referralStatus?: string | null;
  assignedAgentName?: string | null;
  addonOnlineStorefront?: boolean | null;
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
    case 'TRIAL_ACTIVE':
    case 'TRIAL_EXPIRING_SOON':
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
  const pricing = computeSubscriptionPricing({
    plan: purchasedPlan,
    addonOnlineStorefront: input.addonOnlineStorefront,
    billingInterval: billingCadence,
  });
  const monthlyValueGhs = controlMonthlyValueGhs(pricing);

  try {
    const profile = await client.controlBusinessProfile.upsert({
      where: { businessId: input.businessId },
      update: {
        ownerName: input.ownerName ?? undefined,
        ownerPhone: input.ownerPhone ?? undefined,
        ownerEmail: input.ownerEmail ?? undefined,
        supportStatus: input.supportStatus ?? undefined,
        notes: input.notes ?? undefined,
        referralSource: input.referralSource ?? undefined,
        referredByName: input.referredByName ?? undefined,
        referredByPhone: input.referredByPhone ?? undefined,
        sourceChannel: input.sourceChannel ?? undefined,
        referralStatus: input.referralStatus ?? undefined,
        assignedAgentName: input.assignedAgentName ?? undefined,
        referredBy:
          input.referredByName || input.referredByPhone
            ? [input.referredByName, input.referredByPhone].filter(Boolean).join(' · ')
            : undefined,
      },
      create: {
        businessId: input.businessId,
        ownerName: input.ownerName ?? null,
        ownerPhone: input.ownerPhone ?? null,
        ownerEmail: input.ownerEmail ?? null,
        supportStatus: input.supportStatus ?? 'UNREVIEWED',
        notes: input.notes ?? 'Awaiting first Tishgroup commercial review.',
        referralSource: input.referralSource ?? null,
        referredByName: input.referredByName ?? null,
        referredByPhone: input.referredByPhone ?? null,
        sourceChannel: input.sourceChannel ?? 'INBOUND',
        referralStatus: input.referralStatus ?? 'TRIAL_STARTED',
        assignedAgentName: input.assignedAgentName ?? null,
        referredBy:
          input.referredByName || input.referredByPhone
            ? [input.referredByName, input.referredByPhone].filter(Boolean).join(' · ')
            : null,
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
        monthlyValuePence: monthlyValueGhs,
      },
      create: {
        controlBusinessId: profile.id,
        purchasedPlan,
        status,
        billingCadence,
        startDate: startedAt,
        nextDueDate: input.nextDueDate ?? null,
        lastPaymentDate: input.lastPaymentDate ?? null,
        monthlyValuePence: monthlyValueGhs,
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
