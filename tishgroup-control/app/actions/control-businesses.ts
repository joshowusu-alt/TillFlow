'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import {
  canManageStaff,
  canManageSubscriptions,
  canRecordPayments,
  canWriteNotes,
  MIN_CONTROL_PASSWORD_LENGTH,
  nextSessionVersion,
  parseControlStaffRole,
  requireControlStaff,
} from '@/lib/control-auth';
import { planRates, type ManagedPlan } from '@/lib/control-data';
import {
  computeSubscriptionPricing,
  controlIntervalChargeGhs,
  controlMonthlyValueGhs,
  resolveControlPaymentAmounts,
  resolveAddonForPlan,
} from '@/lib/vendor/plan-pricing';
import {
  businessPlanStatusFromCanonical,
  businessSubscriptionStatusFromCanonical,
  coerceExistingStoredStatus,
  isCancelledStatus,
  isPaidAccessStatus,
  isTrialStatus,
  paidActivationAllowed,
  shouldRevokeMerchantSessions,
  type CanonicalStoredStatus,
} from '@/lib/vendor/control-commercial-status';
import { recordAudit, recordAuditInTransaction } from '@/lib/audit';
import { captureError } from '@/lib/error-monitor';
import { notifyStateTransition, notifyPaymentRecorded } from '@/lib/notify';
import { activateSubscriptionAfterPayment, calculateNextBillingDate } from '@/lib/subscription-lifecycle';
import { safeReturnPath, withRedirectParam } from '@/lib/safe-return-path';
import {
  hasQualifyingPaidSettlement,
  parseExplicitPaymentAmountGhs,
  parseRequiredCurrency,
  parseRequiredIdempotencyKey,
  parseSubscriptionEditorStatus,
  preserveStatusWhenAssigningSoldPlan,
  settleControlPayment,
} from '@/lib/commercial-mutations';

type BillingCadence = 'MONTHLY' | 'ANNUAL';
type SubscriptionStatus = CanonicalStoredStatus;

function readRequired(formData: FormData, name: string) {
  return String(formData.get(name) ?? '').trim();
}

function readOptional(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function parseOptionalDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOptionalInteger(value: string | null, fallback = 0) {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function normalizePlan(value: string): ManagedPlan {
  const plan = value.trim().toUpperCase();
  if (plan === 'STARTER' || plan === 'GROWTH' || plan === 'PRO') return plan;
  throw new Error('Unknown plan. The existing plan was not changed.');
}

function normalizeCadence(value: string): BillingCadence {
  return value === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
}

function normalizeSubscriptionStatus(value: string): SubscriptionStatus {
  return parseSubscriptionEditorStatus(value);
}

function readReturnPath(formData: FormData, fallback: string) {
  return safeReturnPath(readOptional(formData, 'returnPath'), fallback);
}

function customerFacingBillingPatch(existing: string | null | undefined, customerFacingNote: string | null) {
  if (!customerFacingNote) return undefined;
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] Billing update\n${customerFacingNote}`;
  return [existing?.trim(), entry].filter(Boolean).join('\n\n');
}

function addBillingInterval(startDate: Date, cadence: BillingCadence) {
  const nextDueDate = new Date(startDate);
  if (cadence === 'ANNUAL') {
    nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
  } else {
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
  }
  return nextDueDate;
}

function resolveSubscriptionDates(args: {
  billingCadence: BillingCadence;
  startDate?: Date | null;
  nextDueDate?: Date | null;
  fallbackStartDate?: Date | null;
  fallbackNextDueDate?: Date | null;
}) {
  const startDate = args.startDate ?? args.fallbackStartDate ?? new Date();
  const nextDueDate = args.nextDueDate ?? args.fallbackNextDueDate ?? addBillingInterval(startDate, args.billingCadence);
  return { startDate, nextDueDate };
}

function normalizeGhanaPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).replace(/[^\d]/g, '');
  let national: string | null = null;
  if (digits.startsWith('00233') && digits.length === 14) national = digits.slice(5);
  else if (digits.startsWith('233') && digits.length === 12) national = digits.slice(3);
  else if (digits.startsWith('0') && digits.length === 10) national = digits.slice(1);
  else if (digits.length === 9) national = digits;
  return national && national.length === 9 ? `+233${national}` : null;
}

async function enqueuePaymentConfirmedReminder(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      phone: true,
      currentPeriodStartedAt: true,
      nextBillingDate: true,
      nextPaymentDueAt: true,
      subscriptionStatus: true,
      planStatus: true,
    },
  });
  if (!business) return;
  if (['CANCELLED', 'INACTIVE', 'DEACTIVATED'].includes(String(business.subscriptionStatus ?? business.planStatus).toUpperCase())) return;

  const recipient = normalizeGhanaPhone(business.phone);
  if (!recipient) return;

  const activeUntil = business.nextBillingDate ?? business.nextPaymentDueAt;
  const periodKey = business.currentPeriodStartedAt?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const idempotencyKey = `${business.id}:SUBSCRIPTION_PAYMENT_CONFIRMED:paid:${periodKey}`;
  const body = `Payment confirmed. Your TillFlow subscription is active until ${activeUntil?.toLocaleDateString('en-GB') ?? 'your renewal date'}. Thank you.`;

  try {
    await prisma.messageOutbox.create({
      data: {
        businessId: business.id,
        eventType: 'SUBSCRIPTION_PAYMENT_CONFIRMED',
        idempotencyKey,
        channel: 'SMS',
        recipient,
        body,
        status: 'PENDING',
        nextAttemptAt: new Date(),
        payloadJson: JSON.stringify({
          source: 'SUBSCRIPTION_LIFECYCLE',
          businessId: business.id,
          businessName: business.name,
          reminderType: 'SUBSCRIPTION_PAYMENT_CONFIRMED',
          periodKey,
          nextBillingDate: activeUntil?.toISOString() ?? null,
        }),
      },
    });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'P2002') return;
    throw error;
  }
}

function businessStatusFromSubscription(status: SubscriptionStatus) {
  return businessPlanStatusFromCanonical(status);
}

function billingStatusFromSubscription(status: SubscriptionStatus) {
  return businessSubscriptionStatusFromCanonical(status);
}

async function applySoldPlanUpdate(tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>, args: {
  profileId: string;
  businessId: string;
  currentBusinessPlan: string;
  currentBusinessPlanStatus?: string | null;
  purchasedPlan: ManagedPlan;
  billingCadence?: BillingCadence | null;
  startDate?: Date | null;
  nextDueDate?: Date | null;
}) {
  const existingSubscription = await tx.controlSubscription.findUnique({
    where: { controlBusinessId: args.profileId },
    select: {
      status: true,
      billingCadence: true,
      nextDueDate: true,
      lastPaymentDate: true,
      outstandingAmountPence: true,
      startDate: true,
    },
  });

  const billingCadence = args.billingCadence ?? normalizeCadence(existingSubscription?.billingCadence ?? 'MONTHLY');
  const { startDate, nextDueDate } = resolveSubscriptionDates({
    billingCadence,
    startDate: args.startDate,
    nextDueDate: args.nextDueDate,
    fallbackStartDate: existingSubscription?.startDate ?? null,
    fallbackNextDueDate: existingSubscription?.nextDueDate ?? null,
  });
  const status = preserveStatusWhenAssigningSoldPlan(existingSubscription?.status ?? args.currentBusinessPlanStatus);
  const businessAddon = await tx.business.findUnique({
    where: { id: args.businessId },
    select: { addonOnlineStorefront: true },
  });
  const addonOnlineStorefront = resolveAddonForPlan(
    args.purchasedPlan,
    businessAddon?.addonOnlineStorefront ?? false,
  );
  const monthlyValuePence = controlMonthlyValueGhs(
    computeSubscriptionPricing({
      plan: args.purchasedPlan,
      addonOnlineStorefront,
      billingInterval: billingCadence,
    }),
  );
  const intervalPricing = computeSubscriptionPricing({
    plan: args.purchasedPlan,
    addonOnlineStorefront,
    billingInterval: billingCadence,
  });

  await tx.controlSubscription.upsert({
    where: { controlBusinessId: args.profileId },
    update: {
      purchasedPlan: args.purchasedPlan,
      status,
      billingCadence,
      startDate,
      nextDueDate,
      monthlyValuePence,
    },
    create: {
      controlBusinessId: args.profileId,
      purchasedPlan: args.purchasedPlan,
      status,
      billingCadence,
      startDate,
      nextDueDate,
      lastPaymentDate: existingSubscription?.lastPaymentDate ?? null,
      outstandingAmountPence: existingSubscription?.outstandingAmountPence ?? 0,
      monthlyValuePence,
      gracePolicyVersion: '2026-04-08',
    },
  });

  await tx.business.update({
    where: { id: args.businessId },
    data: {
      plan: args.purchasedPlan,
      addonOnlineStorefront,
      billingAmount: intervalPricing.totalBillingAmount,
      billingInterval: billingCadence,
      planStatus: businessStatusFromSubscription(status),
      subscriptionStatus: billingStatusFromSubscription(status),
      planSetAt: startDate,
      currentPeriodStartedAt: isCancelledStatus(status) || isTrialStatus(status) ? null : startDate,
      nextPaymentDueAt: isCancelledStatus(status) ? null : nextDueDate,
      nextBillingDate: isCancelledStatus(status) ? null : nextDueDate,
      currentPeriodEndsAt: isCancelledStatus(status) ? null : nextDueDate,
    },
  });
}

async function ensureControlBusinessProfile(tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>, businessId: string) {
  const business = await tx.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      plan: true,
      planSetAt: true,
      planStatus: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodStartedAt: true,
      currentPeriodEndsAt: true,
      nextBillingDate: true,
      nextPaymentDueAt: true,
      firstPaymentAt: true,
      lastPaymentAt: true,
      phone: true,
      billingNotes: true,
      addonOnlineStorefront: true,
      users: {
        where: { role: 'OWNER' },
        take: 1,
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!business) {
    throw new Error('The selected Tillflow business does not exist.');
  }

  const owner = business.users[0];

  const profile = await tx.controlBusinessProfile.upsert({
    where: { businessId },
    update: {},
    create: {
      businessId,
      ownerName: owner?.name ?? business.name,
      ownerPhone: business.phone,
      ownerEmail: owner?.email,
    },
  });

  return { business, profile };
}

function revalidateControlViews(businessId: string) {
  revalidateTag('control-portfolio');
  revalidatePath('/');
  revalidatePath('/businesses');
  revalidatePath(`/businesses/${businessId}`);
  revalidatePath('/staff');
  revalidatePath('/collections');
  revalidatePath('/revenue');
  revalidatePath('/subscriptions');
}

async function resolveAssignedManagerId(rawValue: string | null, fallbackStaffId: string) {
  if (!rawValue || rawValue === 'UNASSIGNED') {
    return null;
  }

  const managerId = rawValue === 'SELF' ? fallbackStaffId : rawValue;
  const manager = await prisma.controlStaff.findUnique({
    where: { id: managerId },
    select: { id: true, active: true },
  });

  if (!manager?.active) {
    throw new Error('The selected manager is not active in Tishgroup Control.');
  }

  return manager.id;
}

function ensureRole(condition: boolean, fallbackMessage: string, businessId: string | null) {
  if (!condition) {
    const path = businessId ? `/businesses/${businessId}` : '/';
    redirect(`${path}?error=${encodeURIComponent(fallbackMessage)}`);
  }
}

export async function updateControlSubscriptionAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  const returnPath = readReturnPath(formData, `/businesses/${businessId}`);
  ensureRole(canManageSubscriptions(staff.role), 'Your Control role cannot change subscriptions.', businessId);

  let status: SubscriptionStatus;
  try {
    status = normalizeSubscriptionStatus(readRequired(formData, 'status').toUpperCase());
  } catch (error) {
    redirect(withRedirectParam(returnPath, 'error', error instanceof Error ? error.message : 'Unknown commercial status.'));
  }

  let purchasedPlan: ManagedPlan;
  try {
    purchasedPlan = normalizePlan(readRequired(formData, 'purchasedPlan').toUpperCase());
  } catch (error) {
    redirect(withRedirectParam(returnPath, 'error', error instanceof Error ? error.message : 'Unknown plan. The existing plan was not changed.'));
  }
  const billingCadence = normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase());
  const requestedStartDate = parseOptionalDate(readOptional(formData, 'startDate'));
  const nextDueDate = parseOptionalDate(readOptional(formData, 'nextDueDate'));
  const trialEndsAt = parseOptionalDate(readOptional(formData, 'trialEndsAt'));
  const customerFacingNote = readOptional(formData, 'customerFacingNote');
  const addonOnlineStorefront = resolveAddonForPlan(purchasedPlan, formData.get('addonOnlineStorefront') === 'on');
  const pricing = computeSubscriptionPricing({
    plan: purchasedPlan,
    addonOnlineStorefront,
    billingInterval: billingCadence,
  });
  const recommendedMonthlyGhs = controlMonthlyValueGhs(pricing);
  const submittedMonthlyGhs = parseOptionalInteger(readOptional(formData, 'monthlyValuePence'), recommendedMonthlyGhs);
  const submittedOutstanding = readOptional(formData, 'outstandingAmountPence');
  const now = new Date();
  let monthlyValuePence = recommendedMonthlyGhs;
  let outstandingAmountPence = 0;

  try {
    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);
      const existingSubscription = await tx.controlSubscription.findUnique({
        where: { controlBusinessId: profile.id },
        select: { startDate: true, nextDueDate: true, monthlyValuePence: true, outstandingAmountPence: true, status: true },
      });
      const recordedPayments = await tx.controlPayment.findMany({
        where: { controlBusinessId: profile.id },
        select: { amountPence: true },
      });
      const recommendedIntervalChargeGhs = controlIntervalChargeGhs(pricing);
      if (!paidActivationAllowed({
        requestedStatus: status,
        hasQualifyingPaidSettlement: hasQualifyingPaidSettlement({
          firstPaymentAt: business.firstPaymentAt,
          paymentAmountsGhs: recordedPayments.map((payment) => payment.amountPence),
          recommendedIntervalChargeGhs,
        }),
      })) {
        throw new Error('Paid access requires a full qualifying payment. Partial payments, plan, date, or note changes do not activate paid access.');
      }

      const previousStatus = existingSubscription?.status ?? business.subscriptionStatus;
      const existingMonthlyGhs = existingSubscription?.monthlyValuePence ?? planRates[purchasedPlan];
      monthlyValuePence =
        submittedMonthlyGhs !== recommendedMonthlyGhs && submittedMonthlyGhs === existingMonthlyGhs
          ? submittedMonthlyGhs
          : recommendedMonthlyGhs;
      outstandingAmountPence = submittedOutstanding
        ? parseOptionalInteger(submittedOutstanding, existingSubscription?.outstandingAmountPence ?? 0)
        : (existingSubscription?.outstandingAmountPence ?? 0);
      const { startDate, nextDueDate: resolvedNextDueDate } = resolveSubscriptionDates({
        billingCadence,
        startDate: requestedStartDate,
        nextDueDate,
        fallbackStartDate: existingSubscription?.startDate ?? business.planSetAt,
        fallbackNextDueDate: existingSubscription?.nextDueDate ?? business.nextBillingDate ?? business.nextPaymentDueAt ?? business.currentPeriodEndsAt,
      });
      const paidAccess = isPaidAccessStatus(status);
      const firstPaymentConfirmedAt = paidAccess ? (business.firstPaymentAt ?? null) : null;
      const shouldResetPaidCycle = paidAccess && resolvedNextDueDate && resolvedNextDueDate < now;
      const paidCycleAnchorDate = shouldResetPaidCycle
        ? (requestedStartDate ?? now)
        : (business.lastPaymentAt ?? requestedStartDate ?? startDate ?? now);
      const effectiveNextDueDate =
        shouldResetPaidCycle
          ? calculateNextBillingDate(paidCycleAnchorDate, billingCadence)
          : resolvedNextDueDate;
      const billingNotes = customerFacingBillingPatch(business.billingNotes, customerFacingNote);

      await tx.controlSubscription.upsert({
        where: { controlBusinessId: profile.id },
        update: {
          purchasedPlan,
          status,
          billingCadence,
          startDate,
          nextDueDate: effectiveNextDueDate,
          lastPaymentDate: status === 'PAID_ACTIVE' ? existingSubscription?.nextDueDate : undefined,
          readOnlyAt: status === 'READ_ONLY' ? now : null,
          effectivePlanOverride: null,
          gracePolicyVersion: '2026-04-08',
          monthlyValuePence,
          outstandingAmountPence: isCancelledStatus(status) ? 0 : outstandingAmountPence,
        },
        create: {
          controlBusinessId: profile.id,
          purchasedPlan,
          status,
          billingCadence,
          startDate,
          nextDueDate: effectiveNextDueDate,
          lastPaymentDate: null,
          readOnlyAt: status === 'READ_ONLY' ? now : null,
          gracePolicyVersion: '2026-04-08',
          monthlyValuePence,
          outstandingAmountPence: isCancelledStatus(status) ? 0 : outstandingAmountPence,
        },
      });

      await tx.business.update({
        where: { id: businessId },
        data: {
          plan: purchasedPlan,
          planStatus: businessStatusFromSubscription(status),
          subscriptionStatus: billingStatusFromSubscription(status),
          trialEndsAt: isTrialStatus(status) ? trialEndsAt : business.trialEndsAt,
          firstPaymentAt: paidAccess ? firstPaymentConfirmedAt : (isTrialStatus(status) ? null : business.firstPaymentAt),
          lastPaymentAt: business.lastPaymentAt,
          planSetAt: startDate,
          currentPeriodStartedAt: isCancelledStatus(status) || isTrialStatus(status) ? business.currentPeriodStartedAt : (paidAccess ? (business.currentPeriodStartedAt ?? startDate) : startDate),
          nextPaymentDueAt: isCancelledStatus(status) ? null : effectiveNextDueDate,
          nextBillingDate: isCancelledStatus(status) ? null : effectiveNextDueDate,
          currentPeriodEndsAt: isCancelledStatus(status) ? null : effectiveNextDueDate,
          paymentGraceEndsAt: status === 'PAID_ACTIVE' ? null : undefined,
          suspendedAt: status === 'READ_ONLY' ? now : status === 'PAID_ACTIVE' ? null : undefined,
          cancelledAt: isCancelledStatus(status) ? now : null,
          addonOnlineStorefront,
          billingAmount: pricing.totalBillingAmount,
          billingInterval: billingCadence,
          ...(billingNotes ? { billingNotes } : {}),
        },
      });

      if (shouldRevokeMerchantSessions(status)) {
        await tx.$executeRaw`
          DELETE FROM "Session"
          WHERE "userId" IN (
            SELECT "id" FROM "User" WHERE "businessId" = ${businessId}
          )
        `;
      }

      await recordAuditInTransaction(tx, {
        staff,
        action: 'SUBSCRIPTION_UPDATED',
        businessId,
        summary: `Subscription set to ${purchasedPlan} · ${status} · ${billingCadence}`,
        metadata: {
          previousStatus,
          newStatus: status,
          purchasedPlan,
          billingCadence,
          monthlyValuePence,
          outstandingAmountPence,
          addonOnlineStorefront,
        },
      });
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    await captureError({ context: 'updateControlSubscriptionAction', error, staffId: staff.id, staffEmail: staff.email, staffRole: staff.role, businessId });
    redirect(withRedirectParam(returnPath, 'error', error instanceof Error ? error.message : 'Unable to update the subscription.'));
  }

  if (isCancelledStatus(status) || status === 'READ_ONLY') {
    const businessName = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }).then((b) => b?.name ?? 'Unknown');
    await notifyStateTransition({
      businessId,
      businessName,
      fromState: 'ACTIVE',
      toState: isCancelledStatus(status) ? 'CANCELLED' : status,
      monthlyValuePence,
      outstandingPence: outstandingAmountPence,
      triggeredBy: { name: staff.name, email: staff.email, role: staff.role },
    });
  }

  revalidateControlViews(businessId);
  redirect(withRedirectParam(returnPath, 'updated', 'subscription'));
}

export async function recordControlPaymentAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  ensureRole(canRecordPayments(staff.role), 'Your Control role cannot record payments.', businessId);

  let recordedAmountGhs = 0;
  let method = '';
  let reference: string | null = null;
  let note: string | null = null;
  let paidAt = new Date();
  let billingCadence: BillingCadence = 'MONTHLY';
  let nextDueDate = new Date();
  let customerFacingNote: string | null = null;
  let idempotencyKey = '';
  let grantsPaidAccess = false;

  try {
    recordedAmountGhs = parseExplicitPaymentAmountGhs(readOptional(formData, 'amountPence'));
    parseRequiredCurrency(readOptional(formData, 'currency') ?? 'GHS');
    method = readRequired(formData, 'method');
    reference = readOptional(formData, 'reference');
    note = readOptional(formData, 'note');
    customerFacingNote = readOptional(formData, 'customerFacingNote');
    idempotencyKey = parseRequiredIdempotencyKey(readOptional(formData, 'idempotencyKey') ?? reference);
    paidAt = parseOptionalDate(readOptional(formData, 'paidAt')) ?? new Date();
    billingCadence = normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase());
    const explicitNextDueDate = parseOptionalDate(readOptional(formData, 'nextDueDate'));
    nextDueDate =
      explicitNextDueDate && explicitNextDueDate.getTime() > paidAt.getTime()
        ? explicitNextDueDate
        : calculateNextBillingDate(paidAt, billingCadence);

    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);
      const existingSubscription = await tx.controlSubscription.findUnique({
        where: { controlBusinessId: profile.id },
        select: { purchasedPlan: true, startDate: true, outstandingAmountPence: true, status: true },
      });
      const duplicate = await tx.controlPayment.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (duplicate) {
        throw new Error('This payment reference was already recorded. Duplicate submission was ignored.');
      }
      const purchasedPlan = normalizePlan(existingSubscription?.purchasedPlan ?? business.plan);
      const addonOnlineStorefront = business.addonOnlineStorefront ?? false;
      const pricing = computeSubscriptionPricing({
        plan: purchasedPlan,
        addonOnlineStorefront,
        billingInterval: billingCadence,
      });
      const recommendedMonthlyGhs = controlMonthlyValueGhs(pricing);
      const recommendedIntervalChargeGhs = controlIntervalChargeGhs(pricing);
      const paymentAmounts = resolveControlPaymentAmounts(pricing, recordedAmountGhs);
      recordedAmountGhs = paymentAmounts.recordedAmountGhs;
      const settlement = settleControlPayment({
        amountGhs: recordedAmountGhs,
        recommendedIntervalChargeGhs,
        currentOutstandingGhs: existingSubscription?.outstandingAmountPence ?? 0,
      });
      grantsPaidAccess = settlement.grantsPaidAccess;
      const previousStatus = existingSubscription?.status ?? business.subscriptionStatus;
      const activation = grantsPaidAccess
        ? activateSubscriptionAfterPayment({
          selectedPlan: purchasedPlan,
          plan: purchasedPlan,
          addonOnlineStorefront,
          firstPaymentAt: business.firstPaymentAt,
          billingInterval: billingCadence,
          paymentDate: paidAt,
          amountPence: recordedAmountGhs,
        })
        : null;

      await tx.controlPayment.create({
        data: {
          controlBusinessId: profile.id,
          amountPence: recordedAmountGhs,
          paidAt,
          method,
          reference,
          idempotencyKey,
          note,
          receivedByStaffId: staff.id,
        },
      });

      await tx.controlSubscription.upsert({
        where: { controlBusinessId: profile.id },
        update: {
          purchasedPlan,
          status: grantsPaidAccess ? 'PAID_ACTIVE' : coerceExistingStoredStatus(existingSubscription?.status ?? business.subscriptionStatus),
          billingCadence,
          nextDueDate: grantsPaidAccess ? nextDueDate : undefined,
          lastPaymentDate: paidAt,
          readOnlyAt: grantsPaidAccess ? null : undefined,
          monthlyValuePence: recommendedMonthlyGhs,
          outstandingAmountPence: settlement.outstandingAfterGhs,
          gracePolicyVersion: '2026-04-08',
        },
        create: {
          controlBusinessId: profile.id,
          purchasedPlan,
          status: grantsPaidAccess ? 'PAID_ACTIVE' : 'TRIAL_ACTIVE',
          billingCadence,
          startDate: existingSubscription?.startDate ?? paidAt,
          nextDueDate,
          lastPaymentDate: paidAt,
          monthlyValuePence: recommendedMonthlyGhs,
          outstandingAmountPence: settlement.outstandingAfterGhs,
          gracePolicyVersion: '2026-04-08',
        },
      });

      const billingNotes = customerFacingBillingPatch(business.billingNotes, customerFacingNote);
      await tx.business.update({
        where: { id: businessId },
        data: grantsPaidAccess && activation
          ? {
            planStatus: activation.planStatus,
            subscriptionStatus: activation.subscriptionStatus,
            trialEndsAt: null,
            firstPaymentAt: activation.firstPaymentAt,
            currentPeriodStartedAt: activation.currentPeriodStartedAt,
            currentPeriodEndsAt: nextDueDate,
            nextBillingDate: nextDueDate,
            lastPaymentAt: activation.lastPaymentAt,
            nextPaymentDueAt: nextDueDate,
            paymentGraceEndsAt: null,
            suspendedAt: null,
            cancelledAt: null,
            billingAmount: paymentAmounts.businessBillingAmountPence,
            billingCurrency: activation.billingCurrency,
            billingInterval: activation.billingInterval,
            ...(billingNotes ? { billingNotes } : {}),
          }
          : {
            lastPaymentAt: paidAt,
            ...(billingNotes ? { billingNotes } : {}),
          },
      });

      await recordAuditInTransaction(tx, {
        staff,
        action: 'PAYMENT_RECORDED',
        businessId,
        summary: `Payment GHS ${recordedAmountGhs.toLocaleString('en-GH')} via ${method}${grantsPaidAccess ? '' : ' (partial — paid access not granted)'}`,
        metadata: {
          amountGhs: recordedAmountGhs,
          method,
          reference,
          idempotencyKey,
          paidAt: paidAt.toISOString(),
          grantsPaidAccess,
          previousStatus,
          outstandingAfterGhs: settlement.outstandingAfterGhs,
        },
        idempotencyKey: `payment:${idempotencyKey}`,
      });
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    await captureError({ context: 'recordControlPaymentAction', error, staffId: staff.id, staffEmail: staff.email, staffRole: staff.role, businessId, metadata: { method } });
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to record the payment.')}`);
  }

  if (grantsPaidAccess) {
    const businessName = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }).then((b) => b?.name ?? 'Unknown');
    await notifyPaymentRecorded({
      businessId,
      businessName,
      amountGhs: recordedAmountGhs,
      method,
      recordedBy: { name: staff.name, email: staff.email },
    });
    await enqueuePaymentConfirmedReminder(businessId).catch((error) => {
      captureError({ context: 'payment:sms_enqueue_failed', error, staffId: staff.id, staffEmail: staff.email, staffRole: staff.role, businessId });
    });
  }

  revalidateControlViews(businessId);
  redirect(`/businesses/${businessId}?updated=payment`);
}
export async function addControlNoteAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  ensureRole(canWriteNotes(staff.role), 'Your Control role cannot add internal notes.', businessId);

  const category = readRequired(formData, 'category').toUpperCase() || 'GENERAL';
  const note = readRequired(formData, 'note');

  try {
    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);

      await tx.controlNote.create({
        data: {
          controlBusinessId: profile.id,
          category,
          note,
          createdByStaffId: staff.id,
        },
      });

      await tx.controlBusinessProfile.update({
        where: { id: profile.id },
        data: {
          notes: note,
          lastActivityAt: new Date(),
        },
      });

      const billingNotes = customerFacingBillingPatch(business.billingNotes, readOptional(formData, 'customerFacingNote'));
      if (billingNotes) {
        await tx.business.update({
          where: { id: businessId },
          data: { billingNotes },
        });
      }

      await recordAuditInTransaction(tx, {
        staff,
        action: 'NOTE_ADDED',
        businessId,
        summary: `Note added (${category}): ${note.slice(0, 80)}${note.length > 80 ? '…' : ''}`,
        metadata: { category },
      });
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to save the note.')}`);
  }

  revalidateControlViews(businessId);
  redirect(`/businesses/${businessId}?updated=note`);
}

export async function resendSubscriptionReminderAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  const reminderId = readRequired(formData, 'reminderId');
  ensureRole(canRecordPayments(staff.role) || canManageSubscriptions(staff.role), 'Your Control role cannot resend subscription reminders.', businessId);

  try {
    const reminder = await prisma.messageOutbox.findFirst({
      where: {
        id: reminderId,
        businessId,
        eventType: { startsWith: 'SUBSCRIPTION_' },
        channel: 'SMS',
      },
      select: { id: true, eventType: true, status: true },
    });

    if (!reminder) {
      throw new Error('Subscription reminder not found.');
    }

    await prisma.messageOutbox.update({
      where: { id: reminder.id },
      data: {
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        lockedAt: null,
        nextAttemptAt: new Date(),
        sentAt: null,
      },
    });

    await recordAudit({
      staff,
      action: 'SUBSCRIPTION_REMINDER_RESENT',
      businessId,
      summary: `Subscription SMS reminder queued for resend: ${reminder.eventType}`,
      metadata: { reminderId, previousStatus: reminder.status },
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?tab=billing&error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to queue reminder resend.')}`);
  }

  revalidateControlViews(businessId);
  redirect(`/businesses/${businessId}?tab=billing&updated=reminder`);
}

export async function reviewControlBusinessAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  ensureRole(canWriteNotes(staff.role), 'Your Control role cannot review businesses.', businessId);

  const requestedManager = readOptional(formData, 'assignedManagerId');
  const reviewNote = readOptional(formData, 'reviewNote');
  const soldPlanRaw = readOptional(formData, 'purchasedPlan');

  try {
    const soldPlan = soldPlanRaw && soldPlanRaw !== 'KEEP_CURRENT' ? normalizePlan(soldPlanRaw.toUpperCase()) : null;
    const billingCadence = soldPlan ? normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase()) : null;
    const startDate = soldPlan ? parseOptionalDate(readOptional(formData, 'startDate')) : undefined;
    const nextDueDate = soldPlan ? parseOptionalDate(readOptional(formData, 'nextDueDate')) : undefined;
    const assignedManagerId = await resolveAssignedManagerId(requestedManager, staff.id);

    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);

      await tx.controlBusinessProfile.update({
        where: { id: profile.id },
        data: {
          assignedManagerId,
          reviewedByStaffId: staff.id,
          reviewedAt: new Date(),
          supportStatus: 'HEALTHY',
          notes: reviewNote ?? profile.notes,
          lastActivityAt: new Date(),
        },
      });

      if (soldPlan) {
        await applySoldPlanUpdate(tx, {
          profileId: profile.id,
          businessId,
          currentBusinessPlan: business.plan,
          currentBusinessPlanStatus: business.subscriptionStatus ?? business.planStatus,
          purchasedPlan: soldPlan,
          billingCadence,
          startDate,
          nextDueDate,
        });
      }

      if (reviewNote) {
        await tx.controlNote.create({
          data: {
            controlBusinessId: profile.id,
            category: 'REVIEW',
            note: reviewNote,
            createdByStaffId: staff.id,
          },
        });
      }

      await recordAuditInTransaction(tx, {
        staff,
        action: 'REVIEW_COMPLETED',
        businessId,
        summary: soldPlan ? `Review completed · sold plan set to ${soldPlan}` : 'Review completed',
        metadata: { soldPlan, billingCadence, requestedManager },
      });
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to review the business.')}`);
  }

  revalidateControlViews(businessId);
  redirect(`/businesses/${businessId}?updated=review`);
}

export async function reopenControlBusinessReviewAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  ensureRole(canWriteNotes(staff.role), 'Your Control role cannot reopen business reviews.', businessId);

  const reviewNote = readOptional(formData, 'reviewNote');

  try {
    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);

      await tx.controlBusinessProfile.update({
        where: { id: profile.id },
        data: {
          supportStatus: 'UNREVIEWED',
          reviewedByStaffId: null,
          reviewedAt: null,
          lastActivityAt: new Date(),
        },
      });

      const resolvedNote = reviewNote ?? 'Returned to the TG review queue for follow-up.';

      await tx.controlNote.create({
        data: {
          controlBusinessId: profile.id,
          category: 'REVIEW',
          note: resolvedNote,
          createdByStaffId: staff.id,
        },
      });

      await recordAuditInTransaction(tx, {
        staff,
        action: 'REVIEW_REOPENED',
        businessId,
        summary: 'Returned to review queue',
        metadata: { reviewNote: reviewNote ?? null },
      });
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to return the business to the review queue.')}`);
  }

  revalidateControlViews(businessId);
  redirect(`/businesses/${businessId}?updated=reopened`);
}

export async function createControlStaffAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  if (!canManageStaff(staff.role)) {
    redirect('/staff?error=Only TG control admins can manage staff accounts.');
  }

  const name = readRequired(formData, 'name');
  const email = readRequired(formData, 'email').toLowerCase();
  const role = parseControlStaffRole(readRequired(formData, 'role'));
  const password = String(formData.get('password') ?? '');

  if (!name || !email || !role) {
    redirect('/staff?error=Name, email, and an allowlisted role are required.');
  }
  if (password.length < MIN_CONTROL_PASSWORD_LENGTH) {
    redirect(`/staff?error=New staff need a personal password of at least ${MIN_CONTROL_PASSWORD_LENGTH} characters.`);
  }

  try {
    const existing = await prisma.controlStaff.findUnique({ where: { email } });
    if (existing) {
      redirect('/staff?error=A staff account with that email already exists. Re-submitting an email does not reactivate or change role.');
    }

    const hash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (tx) => {
      const created = await tx.controlStaff.create({
        data: {
          name,
          email,
          role,
          active: true,
          passwordHash: hash,
          passwordSetAt: new Date(),
          sessionVersion: 0,
        },
      });
      await recordAuditInTransaction(tx, {
        staff,
        action: 'STAFF_CREATED',
        businessId: null,
        summary: `Staff account created: ${name} (${role})`,
        metadata: { targetStaffId: created.id, role },
      });
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    redirect(`/staff?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to save the staff account.')}`);
  }

  revalidateTag('control-portfolio');
  revalidatePath('/staff');
  redirect('/staff?updated=staff-created');
}

export async function toggleControlStaffAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  if (!canManageStaff(staff.role)) {
    redirect('/staff?error=Only TG control admins can manage staff accounts.');
  }

  const staffId = readRequired(formData, 'staffId');
  const makeActive = readRequired(formData, 'makeActive') === 'true';

  try {
    await prisma.$transaction(async (tx) => {
      const target = await tx.controlStaff.findUnique({
        where: { id: staffId },
        select: { id: true, role: true, active: true, sessionVersion: true },
      });
      if (!target) {
        throw new Error('Staff member was not found.');
      }
      if (!makeActive && target.role === 'CONTROL_ADMIN') {
        const remainingAdmins = await tx.controlStaff.count({
          where: { active: true, role: 'CONTROL_ADMIN', id: { not: staffId } },
        });
        if (remainingAdmins === 0) {
          throw new Error('The last active Control admin cannot be deactivated.');
        }
      }
      await tx.controlStaff.update({
        where: { id: staffId },
        data: {
          active: makeActive,
          sessionVersion: nextSessionVersion(target.sessionVersion),
        },
      });
      await recordAuditInTransaction(tx, {
        staff,
        action: makeActive ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED',
        businessId: null,
        summary: `Staff ${makeActive ? 'activated' : 'deactivated'} (id ${staffId})`,
        metadata: { targetStaffId: staffId, makeActive, previousActive: target.active },
      });
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    redirect(`/staff?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to update the staff account.')}`);
  }

  revalidateTag('control-portfolio');
  revalidatePath('/staff');
  redirect(`/staff?updated=${makeActive ? 'staff-activated' : 'staff-deactivated'}`);
}

export async function bulkReviewControlBusinessesAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const returnPath = readReturnPath(formData, '/businesses?filter=unreviewed');
  if (!canWriteNotes(staff.role)) {
    redirect(withRedirectParam(returnPath, 'error', 'Your TG role cannot bulk review businesses.'));
  }

  const requestedManager = readOptional(formData, 'assignedManagerId');
  const reviewNote = readOptional(formData, 'reviewNote');
  const soldPlanRaw = readOptional(formData, 'purchasedPlan');
  // Accept either the legacy comma-separated `businessIds` (filled by the
  // server-rendered form for "review the whole page") or the new
  // multi-value `selectedId` (filled by the mobile bulk-select bar).
  const multiSelected = formData.getAll('selectedId').map((value) => String(value).trim()).filter(Boolean);
  const legacyCsv = String(formData.get('businessIds') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const businessIds = multiSelected.length > 0 ? multiSelected : legacyCsv;

  if (businessIds.length === 0) {
    redirect(withRedirectParam(returnPath, 'error', 'No businesses were selected for bulk review.'));
  }

  try {
    const soldPlan = soldPlanRaw && soldPlanRaw !== 'KEEP_CURRENT' ? normalizePlan(soldPlanRaw.toUpperCase()) : null;
    const billingCadence = soldPlan ? normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase()) : null;
    const startDate = soldPlan ? parseOptionalDate(readOptional(formData, 'startDate')) : undefined;
    const nextDueDate = soldPlan ? parseOptionalDate(readOptional(formData, 'nextDueDate')) : undefined;
    const assignedManagerId = await resolveAssignedManagerId(requestedManager, staff.id);

    await prisma.$transaction(async (tx) => {
      for (const businessId of businessIds) {
        const { business, profile } = await ensureControlBusinessProfile(tx, businessId);

        await tx.controlBusinessProfile.update({
          where: { id: profile.id },
          data: {
            assignedManagerId,
            reviewedByStaffId: staff.id,
            reviewedAt: new Date(),
            supportStatus: 'HEALTHY',
            notes: reviewNote ?? profile.notes,
            lastActivityAt: new Date(),
          },
        });

        if (soldPlan) {
          await applySoldPlanUpdate(tx, {
            profileId: profile.id,
            businessId,
            currentBusinessPlan: business.plan,
            currentBusinessPlanStatus: business.subscriptionStatus ?? business.planStatus,
            purchasedPlan: soldPlan,
            billingCadence,
            startDate,
            nextDueDate,
          });
        }

        if (reviewNote) {
          await tx.controlNote.create({
            data: {
              controlBusinessId: profile.id,
              category: 'REVIEW',
              note: reviewNote,
              createdByStaffId: staff.id,
            },
          });
        }
      }

      await recordAuditInTransaction(tx, {
        staff,
        action: 'BULK_REVIEW',
        businessId: null,
        summary: `Bulk review: ${businessIds.length} businesses${soldPlan ? ` · sold plan ${soldPlan}` : ''}`,
        metadata: { count: businessIds.length, soldPlan, billingCadence },
      });
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    redirect(withRedirectParam(returnPath, 'error', error instanceof Error ? error.message : 'Unable to bulk review the selected businesses.'));
  }

  revalidateTag('control-portfolio');
  revalidatePath('/');
  revalidatePath('/businesses');
  redirect(withRedirectParam(returnPath, 'updated', 'bulk-review'));
}

export async function bulkRemindDueSoonAction(): Promise<void> {
  const staff = await requireControlStaff();
  ensureRole(canRecordPayments(staff.role) || canManageSubscriptions(staff.role), 'Your Control role cannot send subscription reminders.', null);

  const DUE_SOON_STATES = ['RENEWAL_DUE_SOON', 'PAYMENT_DUE_TODAY', 'TRIAL_DUE_SOON', 'TRIAL_DUE_TODAY'];

  try {
    const dueSoonBusinesses = await prisma.business.findMany({
      where: { subscriptionStatus: { in: DUE_SOON_STATES } },
      select: {
        id: true,
        name: true,
        phone: true,
        currentPeriodStartedAt: true,
        nextBillingDate: true,
        nextPaymentDueAt: true,
      },
    });

    if (dueSoonBusinesses.length === 0) {
      redirect('/collections?toast_error=No due-soon accounts found to remind.');
    }

    const queued = await Promise.all(dueSoonBusinesses.map(async (business) => {
      const recipient = normalizeGhanaPhone(business.phone);
      if (!recipient) return null;

      const dueDate = business.nextBillingDate ?? business.nextPaymentDueAt;
      const periodKey = dueDate?.toISOString().slice(0, 10)
        ?? business.currentPeriodStartedAt?.toISOString().slice(0, 10)
        ?? new Date().toISOString().slice(0, 10);
      const idempotencyKey = `${business.id}:SUBSCRIPTION_RENEWAL_REMINDER:bulk:${periodKey}`;
      const dueText = dueDate?.toLocaleDateString('en-GB') ?? 'your renewal date';

      return prisma.messageOutbox.upsert({
        where: { idempotencyKey },
        update: {
          status: 'PENDING',
          attempts: 0,
          lastError: null,
          lockedAt: null,
          nextAttemptAt: new Date(),
          sentAt: null,
        },
        create: {
          businessId: business.id,
          eventType: 'SUBSCRIPTION_RENEWAL_REMINDER',
          idempotencyKey,
          channel: 'SMS',
          recipient,
          body: `Reminder: your TillFlow subscription payment is due on ${dueText}. Please pay to keep access active.`,
          status: 'PENDING',
          nextAttemptAt: new Date(),
          payloadJson: JSON.stringify({
            source: 'TISHGROUP_CONTROL_BULK_REMIND',
            businessId: business.id,
            businessName: business.name,
            periodKey,
            dueDate: dueDate?.toISOString() ?? null,
          }),
        },
      });
    }));

    const queuedCount = queued.filter(Boolean).length;

    if (queuedCount === 0) {
      redirect('/collections?toast_error=No due-soon accounts have valid SMS recipients.');
    }

    await recordAudit({
      staff,
      action: 'BULK_REMINDER_SENT',
      businessId: null,
      summary: `Bulk SMS reminder queued for ${queuedCount} reminder${queuedCount === 1 ? '' : 's'} across ${dueSoonBusinesses.length} due-soon account${dueSoonBusinesses.length === 1 ? '' : 's'}.`,
      metadata: { businessCount: dueSoonBusinesses.length, reminderCount: queuedCount },
    });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw error;
    redirect(`/collections?toast_error=${encodeURIComponent(error instanceof Error ? error.message : 'Bulk remind failed.')}`);
  }

  revalidateTag('control-portfolio');
  revalidatePath('/collections');
  redirect('/collections?updated=bulk');
}
