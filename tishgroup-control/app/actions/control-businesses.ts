'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { canManageStaff, canManageSubscriptions, canRecordPayments, canWriteNotes, requireControlStaff } from '@/lib/control-auth';
import { planRates, type ManagedPlan } from '@/lib/control-data';
import { recordAudit } from '@/lib/audit';
import { notifyStateTransition, notifyPaymentRecorded } from '@/lib/notify';
import { activateSubscriptionAfterPayment, calculateNextBillingDate } from '../../../lib/subscription-lifecycle';

type BillingCadence = 'MONTHLY' | 'ANNUAL';
type SubscriptionStatus = 'PAID_ACTIVE' | 'TRIAL_ACTIVE' | 'TRIAL_DUE_SOON' | 'TRIAL_DUE_TODAY' | 'TRIAL_EXPIRED_GRACE' | 'TRIAL_RESTRICTED' | 'RENEWAL_DUE_SOON' | 'PAYMENT_DUE_TODAY' | 'PAYMENT_OVERDUE_GRACE' | 'PAYMENT_RESTRICTED' | 'CANCELLED' | 'READ_ONLY';

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
  return value === 'PRO' || value === 'GROWTH' ? value : 'STARTER';
}

function normalizeCadence(value: string): BillingCadence {
  return value === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
}

function normalizeSubscriptionStatus(value: string): SubscriptionStatus {
  switch (value) {
    case 'TRIAL_ACTIVE':
    case 'TRIAL_DUE_SOON':
    case 'TRIAL_DUE_TODAY':
    case 'TRIAL_EXPIRED_GRACE':
    case 'TRIAL_RESTRICTED':
    case 'PAID_ACTIVE':
    case 'RENEWAL_DUE_SOON':
    case 'PAYMENT_DUE_TODAY':
    case 'PAYMENT_OVERDUE_GRACE':
    case 'PAYMENT_RESTRICTED':
    case 'READ_ONLY':
      return value;
    case 'INACTIVE':
    case 'DEACTIVATED':
    case 'CANCELLED':
      return 'CANCELLED';
    case 'ACTIVE':
    default:
      return 'PAID_ACTIVE';
  }
}

function readReturnPath(formData: FormData, fallback: string) {
  const value = String(formData.get('returnPath') ?? '').trim();
  return value.startsWith('/') ? value : fallback;
}

function withRedirectParam(path: string, key: string, value: string) {
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set(key, value);
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
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

function appendBillingEntry(existing: string | null | undefined, heading: string, lines: Array<string | null>) {
  const timestamp = new Date().toISOString();
  const entry = [`[${timestamp}] ${heading}`, ...lines.filter(Boolean)].join('\n');
  return [existing?.trim(), entry].filter(Boolean).join('\n\n');
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
  switch (status) {
    case 'TRIAL_ACTIVE':
    case 'TRIAL_DUE_SOON':
    case 'TRIAL_DUE_TODAY':
    case 'TRIAL_EXPIRED_GRACE':
    case 'TRIAL_RESTRICTED':
      return 'TRIAL_ACTIVE';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'READ_ONLY':
      return 'READ_ONLY';
    case 'PAID_ACTIVE':
    case 'RENEWAL_DUE_SOON':
    case 'PAYMENT_DUE_TODAY':
    case 'PAYMENT_OVERDUE_GRACE':
    case 'PAYMENT_RESTRICTED':
    default:
      return 'PAID_ACTIVE';
  }
}

function billingStatusFromSubscription(status: SubscriptionStatus) {
  switch (status) {
    case 'TRIAL_ACTIVE':
    case 'TRIAL_DUE_SOON':
    case 'TRIAL_DUE_TODAY':
    case 'TRIAL_EXPIRED_GRACE':
    case 'TRIAL_RESTRICTED':
      return status;
    case 'CANCELLED':
      return 'CANCELLED';
    case 'READ_ONLY':
      return 'READ_ONLY';
    case 'PAID_ACTIVE':
    case 'RENEWAL_DUE_SOON':
    case 'PAYMENT_DUE_TODAY':
    case 'PAYMENT_OVERDUE_GRACE':
    case 'PAYMENT_RESTRICTED':
    default:
      return 'PAID_ACTIVE';
  }
}

function isTrialStatus(status: SubscriptionStatus) {
  return status.startsWith('TRIAL_');
}

function isCancelledStatus(status: SubscriptionStatus) {
  return status === 'CANCELLED';
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
  const status = normalizeSubscriptionStatus(existingSubscription?.status ?? args.currentBusinessPlanStatus ?? 'ACTIVE');

  await tx.controlSubscription.upsert({
    where: { controlBusinessId: args.profileId },
    update: {
      purchasedPlan: args.purchasedPlan,
      status,
      billingCadence,
      startDate,
      nextDueDate,
      monthlyValuePence: planRates[args.purchasedPlan],
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
      monthlyValuePence: planRates[args.purchasedPlan],
      gracePolicyVersion: '2026-04-08',
    },
  });

  await tx.business.update({
    where: { id: args.businessId },
    data: {
      plan: args.purchasedPlan,
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
      currentPeriodEndsAt: true,
      nextBillingDate: true,
      nextPaymentDueAt: true,
      firstPaymentAt: true,
      phone: true,
      billingNotes: true,
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

function ensureRole(condition: boolean, fallbackMessage: string, businessId: string) {
  if (!condition) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(fallbackMessage)}`);
  }
}

export async function updateControlSubscriptionAction(formData: FormData): Promise<void> {
  const staff = await requireControlStaff();
  const businessId = readRequired(formData, 'businessId');
  const returnPath = readReturnPath(formData, `/businesses/${businessId}`);
  ensureRole(canManageSubscriptions(staff.role), 'Your Control role cannot change subscriptions.', businessId);

  const purchasedPlan = normalizePlan(readRequired(formData, 'purchasedPlan').toUpperCase());
  const billingCadence = normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase());
  const status = normalizeSubscriptionStatus(readRequired(formData, 'status').toUpperCase());
  const requestedStartDate = parseOptionalDate(readOptional(formData, 'startDate'));
  const nextDueDate = parseOptionalDate(readOptional(formData, 'nextDueDate'));
  const trialEndsAt = parseOptionalDate(readOptional(formData, 'trialEndsAt'));
  const monthlyValuePence = parseOptionalInteger(readOptional(formData, 'monthlyValuePence'), planRates[purchasedPlan]);
  const outstandingAmountPence = parseOptionalInteger(readOptional(formData, 'outstandingAmountPence'), 0);
  const addonOnlineStorefront = formData.get('addonOnlineStorefront') === 'on';
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);
      const existingSubscription = await tx.controlSubscription.findUnique({
        where: { controlBusinessId: profile.id },
        select: { startDate: true, nextDueDate: true },
      });
      const { startDate, nextDueDate: resolvedNextDueDate } = resolveSubscriptionDates({
        billingCadence,
        startDate: requestedStartDate,
        nextDueDate,
        fallbackStartDate: existingSubscription?.startDate ?? business.planSetAt,
        fallbackNextDueDate: existingSubscription?.nextDueDate ?? business.nextBillingDate ?? business.nextPaymentDueAt ?? business.currentPeriodEndsAt,
      });

      await tx.controlSubscription.upsert({
        where: { controlBusinessId: profile.id },
        update: {
          purchasedPlan,
          status,
          billingCadence,
          startDate,
          nextDueDate: resolvedNextDueDate,
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
          nextDueDate: resolvedNextDueDate,
          readOnlyAt: status === 'READ_ONLY' ? now : null,
          gracePolicyVersion: '2026-04-08',
          monthlyValuePence,
          outstandingAmountPence: isCancelledStatus(status) ? 0 : outstandingAmountPence,
        },
      });

      if (profile.supportStatus === 'UNREVIEWED') {
        await tx.controlBusinessProfile.update({
          where: { id: profile.id },
          data: { supportStatus: 'HEALTHY' },
        });
      }

      await tx.business.update({
        where: { id: businessId },
        data: {
          plan: purchasedPlan,
          planStatus: businessStatusFromSubscription(status),
          subscriptionStatus: billingStatusFromSubscription(status),
          trialEndsAt: isTrialStatus(status) ? trialEndsAt : null,
          planSetAt: startDate,
          currentPeriodStartedAt: isCancelledStatus(status) || isTrialStatus(status) ? null : startDate,
          nextPaymentDueAt: isCancelledStatus(status) ? null : resolvedNextDueDate,
          nextBillingDate: isCancelledStatus(status) ? null : resolvedNextDueDate,
          currentPeriodEndsAt: isCancelledStatus(status) ? null : resolvedNextDueDate,
          addonOnlineStorefront,
          billingNotes: appendBillingEntry(business.billingNotes, 'Control subscription updated', [
            `Updated by: ${staff.name} (${staff.role})`,
            `Plan: ${purchasedPlan}`,
            `Status: ${status}`,
            `Cadence: ${billingCadence}`,
            `Start date: ${startDate.toISOString().slice(0, 10)}`,
            `Next due: ${resolvedNextDueDate ? resolvedNextDueDate.toISOString().slice(0, 10) : 'Not set'}`,
            `Online storefront add-on: ${addonOnlineStorefront ? 'Enabled' : 'Disabled'}`,
          ]),
        },
      });

      if (isCancelledStatus(status)) {
        await tx.$executeRaw`
          DELETE FROM "Session"
          WHERE "userId" IN (
            SELECT "id" FROM "User" WHERE "businessId" = ${businessId}
          )
        `;
      }
    });
  } catch (error) {
    redirect(withRedirectParam(returnPath, 'error', error instanceof Error ? error.message : 'Unable to update the subscription.'));
  }

  await recordAudit({
    staff,
    action: 'SUBSCRIPTION_UPDATED',
    businessId,
    summary: `Subscription set to ${purchasedPlan} · ${status} · ${billingCadence}`,
    metadata: { purchasedPlan, status, billingCadence, monthlyValuePence, outstandingAmountPence, addonOnlineStorefront },
  });

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

  const amountPence = parseOptionalInteger(readOptional(formData, 'amountPence'), 0);
  const method = readRequired(formData, 'method');
  const reference = readOptional(formData, 'reference');
  const note = readOptional(formData, 'note');
  const paidAt = parseOptionalDate(readOptional(formData, 'paidAt')) ?? new Date();
  const billingCadence = normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase());
  const explicitNextDueDate = parseOptionalDate(readOptional(formData, 'nextDueDate'));
  const nextDueDate = explicitNextDueDate ?? calculateNextBillingDate(paidAt, billingCadence);

  try {
    await prisma.$transaction(async (tx) => {
      const { business, profile } = await ensureControlBusinessProfile(tx, businessId);
      const existingSubscription = await tx.controlSubscription.findUnique({
        where: { controlBusinessId: profile.id },
        select: { purchasedPlan: true, startDate: true },
      });
      const purchasedPlan = normalizePlan(existingSubscription?.purchasedPlan ?? business.plan);
      const activation = activateSubscriptionAfterPayment({
        selectedPlan: purchasedPlan,
        plan: purchasedPlan,
        firstPaymentAt: (business as any).firstPaymentAt,
        billingInterval: billingCadence,
        paymentDate: paidAt,
        amountPence,
      });

      await tx.controlPayment.create({
        data: {
          controlBusinessId: profile.id,
          amountPence,
          paidAt,
          method,
          reference,
          note,
          receivedByStaffId: staff.id,
        },
      });

      await tx.controlSubscription.upsert({
        where: { controlBusinessId: profile.id },
        update: {
          purchasedPlan,
          status: 'PAID_ACTIVE',
          billingCadence,
          nextDueDate,
          lastPaymentDate: paidAt,
          readOnlyAt: null,
          monthlyValuePence: planRates[purchasedPlan],
          outstandingAmountPence: 0,
          gracePolicyVersion: '2026-04-08',
        },
        create: {
          controlBusinessId: profile.id,
          purchasedPlan,
          status: 'PAID_ACTIVE',
          billingCadence,
          startDate: existingSubscription?.startDate ?? paidAt,
          nextDueDate,
          lastPaymentDate: paidAt,
          monthlyValuePence: planRates[purchasedPlan],
          outstandingAmountPence: 0,
          gracePolicyVersion: '2026-04-08',
        },
      });

      if (profile.supportStatus === 'UNREVIEWED') {
        await tx.controlBusinessProfile.update({
          where: { id: profile.id },
          data: { supportStatus: 'HEALTHY' },
        });
      }

      await tx.business.update({
        where: { id: businessId },
        data: {
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
          billingAmount: activation.billingAmount,
          billingCurrency: activation.billingCurrency,
          billingInterval: activation.billingInterval,
          billingNotes: appendBillingEntry(business.billingNotes, 'Control payment recorded', [
            `Recorded by: ${staff.name} (${staff.role})`,
            `Amount: GHc ${amountPence.toLocaleString('en-GH')}`,
            `Method: ${method}`,
            reference ? `Reference: ${reference}` : null,
            `Paid at: ${paidAt.toISOString().slice(0, 10)}`,
            `Next due: ${nextDueDate.toISOString().slice(0, 10)}`,
            note ? `Note: ${note}` : null,
          ]),
        },
      });
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to record the payment.')}`);
  }

  const businessName = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }).then((b) => b?.name ?? 'Unknown');
  await recordAudit({
    staff,
    action: 'PAYMENT_RECORDED',
    businessId,
    summary: `Payment GHc ${(amountPence / 100).toLocaleString('en-GH')} via ${method}`,
    metadata: { amountPence, method, reference, paidAt: paidAt.toISOString(), nextDueDate: nextDueDate.toISOString() },
  });
  await notifyPaymentRecorded({
    businessId,
    businessName,
    amountPence,
    method,
    recordedBy: { name: staff.name, email: staff.email },
  });
  await enqueuePaymentConfirmedReminder(businessId).catch((error) => {
    console.warn('[control-businesses] payment confirmation SMS enqueue skipped', {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

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
          supportStatus: profile.supportStatus === 'UNREVIEWED' ? 'HEALTHY' : profile.supportStatus,
          lastActivityAt: new Date(),
        },
      });

      await tx.business.update({
        where: { id: businessId },
        data: {
          billingNotes: appendBillingEntry(business.billingNotes, 'Control note added', [
            `Added by: ${staff.name} (${staff.role})`,
            `Category: ${category}`,
            note,
          ]),
        },
      });
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to save the note.')}`);
  }

  await recordAudit({
    staff,
    action: 'NOTE_ADDED',
    businessId,
    summary: `Note added (${category}): ${note.slice(0, 80)}${note.length > 80 ? '…' : ''}`,
    metadata: { category },
  });

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
  const soldPlan = soldPlanRaw && soldPlanRaw !== 'KEEP_CURRENT' ? normalizePlan(soldPlanRaw.toUpperCase()) : null;
  const billingCadence = soldPlan ? normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase()) : null;
  const startDate = soldPlan ? parseOptionalDate(readOptional(formData, 'startDate')) : undefined;
  const nextDueDate = soldPlan ? parseOptionalDate(readOptional(formData, 'nextDueDate')) : undefined;

  try {
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

      await tx.business.update({
        where: { id: businessId },
        data: {
          billingNotes: appendBillingEntry(business.billingNotes, 'Control review completed', [
            `Reviewed by: ${staff.name} (${staff.role})`,
            assignedManagerId ? `Assigned manager id: ${assignedManagerId}` : 'Assigned manager: Unassigned',
            soldPlan ? `Sold plan set: ${soldPlan}` : null,
            soldPlan && billingCadence ? `Cadence: ${billingCadence}` : null,
            soldPlan && startDate ? `Start date: ${startDate.toISOString().slice(0, 10)}` : null,
            reviewNote ? `Review note: ${reviewNote}` : null,
          ]),
        },
      });
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to review the business.')}`);
  }

  await recordAudit({
    staff,
    action: 'REVIEW_COMPLETED',
    businessId,
    summary: soldPlan ? `Review completed · sold plan set to ${soldPlan}` : 'Review completed',
    metadata: { soldPlan, billingCadence, requestedManager, reviewNote: reviewNote ?? null },
  });

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

      await tx.business.update({
        where: { id: businessId },
        data: {
          billingNotes: appendBillingEntry(business.billingNotes, 'Business returned to review queue', [
            `Reopened by: ${staff.name} (${staff.role})`,
            reviewNote ? `Reason: ${reviewNote}` : 'Reason: Returned for another commercial review.',
          ]),
        },
      });
    });
  } catch (error) {
    redirect(`/businesses/${businessId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to return the business to the review queue.')}`);
  }

  await recordAudit({
    staff,
    action: 'REVIEW_REOPENED',
    businessId,
    summary: 'Returned to review queue',
    metadata: { reviewNote: reviewNote ?? null },
  });

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
  const role = readRequired(formData, 'role').toUpperCase();

  try {
    await prisma.controlStaff.upsert({
      where: { email },
      update: {
        name,
        role,
        active: true,
      },
      create: {
        name,
        email,
        role,
        active: true,
      },
    });
  } catch (error) {
    redirect(`/staff?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to save the staff account.')}`);
  }

  await recordAudit({
    staff,
    action: 'STAFF_CREATED',
    businessId: null,
    summary: `Staff account upserted: ${name} (${role})`,
    metadata: { email, role },
  });

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
    await prisma.controlStaff.update({
      where: { id: staffId },
      data: { active: makeActive },
    });
  } catch (error) {
    redirect(`/staff?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to update the staff account.')}`);
  }

  await recordAudit({
    staff,
    action: makeActive ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED',
    businessId: null,
    summary: `Staff ${makeActive ? 'activated' : 'deactivated'} (id ${staffId})`,
    metadata: { staffId, makeActive },
  });

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
  const soldPlan = soldPlanRaw && soldPlanRaw !== 'KEEP_CURRENT' ? normalizePlan(soldPlanRaw.toUpperCase()) : null;
  const billingCadence = soldPlan ? normalizeCadence(readRequired(formData, 'billingCadence').toUpperCase()) : null;
  const startDate = soldPlan ? parseOptionalDate(readOptional(formData, 'startDate')) : undefined;
  const nextDueDate = soldPlan ? parseOptionalDate(readOptional(formData, 'nextDueDate')) : undefined;
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

        await tx.business.update({
          where: { id: businessId },
          data: {
            billingNotes: appendBillingEntry(business.billingNotes, 'Bulk TG review completed', [
              `Reviewed by: ${staff.name} (${staff.role})`,
              assignedManagerId ? `Assigned manager id: ${assignedManagerId}` : 'Assigned manager: Unassigned',
              soldPlan ? `Sold plan set: ${soldPlan}` : null,
              soldPlan && billingCadence ? `Cadence: ${billingCadence}` : null,
              soldPlan && startDate ? `Start date: ${startDate.toISOString().slice(0, 10)}` : null,
              reviewNote ? `Review note: ${reviewNote}` : null,
            ]),
          },
        });
      }
    });
  } catch (error) {
    redirect(withRedirectParam(returnPath, 'error', error instanceof Error ? error.message : 'Unable to bulk review the selected businesses.'));
  }

  await recordAudit({
    staff,
    action: 'BULK_REVIEW',
    businessId: null,
    summary: `Bulk review: ${businessIds.length} businesses${soldPlan ? ` · sold plan ${soldPlan}` : ''}`,
    metadata: { count: businessIds.length, soldPlan, billingCadence, requestedManager },
  });

  revalidateTag('control-portfolio');
  revalidatePath('/');
  revalidatePath('/businesses');
  redirect(withRedirectParam(returnPath, 'updated', 'bulk-review'));
}
