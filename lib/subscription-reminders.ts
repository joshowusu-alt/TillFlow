import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma';
import { normalizeGhanaPhone } from './storefront-phone';
import { computeBillingAccessState, getSubscriptionSnapshot, type SubscriptionInput } from './subscription-lifecycle';

type PrismaTx = Prisma.TransactionClient | PrismaClient;

export type SubscriptionReminderType =
  | 'SUBSCRIPTION_TRIAL_STARTED'
  | 'SUBSCRIPTION_TRIAL_ENDS_3_DAYS'
  | 'SUBSCRIPTION_TRIAL_ENDS_TOMORROW'
  | 'SUBSCRIPTION_TRIAL_ENDS_TODAY'
  | 'SUBSCRIPTION_TRIAL_EXPIRED'
  | 'SUBSCRIPTION_RENEWS_30_DAYS'
  | 'SUBSCRIPTION_RENEWS_14_DAYS'
  | 'SUBSCRIPTION_RENEWS_7_DAYS'
  | 'SUBSCRIPTION_RENEWS_3_DAYS'
  | 'SUBSCRIPTION_RENEWS_TOMORROW'
  | 'SUBSCRIPTION_RENEWAL_DUE_TODAY'
  | 'SUBSCRIPTION_OVERDUE'
  | 'SUBSCRIPTION_SUSPENSION_WARNING'
  | 'SUBSCRIPTION_PAYMENT_CONFIRMED';

type ReminderBusiness = SubscriptionInput & {
  id: string;
  name: string;
  phone?: string | null;
  timezone?: string | null;
  selectedPlan?: string | null;
  plan?: string | null;
  billingCurrency?: string | null;
  smsSenderId?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysUntil(date: Date | null, now: Date) {
  if (!date) return null;
  return Math.ceil((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

function dateLabel(date: Date | null) {
  return date?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) ?? 'your due date';
}

function periodKeyFor(type: SubscriptionReminderType, business: ReminderBusiness, now: Date) {
  const snapshot = getSubscriptionSnapshot(business, now);
  if (type.startsWith('SUBSCRIPTION_TRIAL')) {
    return `trial:${snapshot.trialEndsAt?.toISOString().slice(0, 10) ?? 'unknown'}`;
  }
  if (type === 'SUBSCRIPTION_PAYMENT_CONFIRMED') {
    return `paid:${snapshot.currentPeriodStartedAt?.toISOString().slice(0, 10) ?? snapshot.lastPaymentAt?.toISOString().slice(0, 10) ?? now.toISOString().slice(0, 10)}`;
  }
  return `renewal:${snapshot.nextBillingDate?.toISOString().slice(0, 10) ?? 'unknown'}`;
}

function isCancelled(business: ReminderBusiness) {
  return ['CANCELLED'].includes(String(business.subscriptionStatus ?? business.planStatus ?? '').toUpperCase());
}

function reminderCopy(type: SubscriptionReminderType, business: ReminderBusiness, now: Date) {
  const snapshot = getSubscriptionSnapshot(business, now);
  const trialEnd = dateLabel(snapshot.trialEndsAt);
  const activeUntil = dateLabel(snapshot.nextBillingDate);

  switch (type) {
    case 'SUBSCRIPTION_TRIAL_STARTED':
      return `TillFlow reminder: Your ${snapshot.selectedPlan} trial runs until ${trialEnd}. Contact Tishgroup to keep access active.`;
    case 'SUBSCRIPTION_TRIAL_ENDS_3_DAYS':
      return `TillFlow reminder: Your trial ends in 3 days. Contact Tishgroup to keep access active.`;
    case 'SUBSCRIPTION_TRIAL_ENDS_TOMORROW':
      return 'TillFlow reminder: Your trial ends tomorrow. Contact Tishgroup to keep access active.';
    case 'SUBSCRIPTION_TRIAL_ENDS_TODAY':
      return 'TillFlow reminder: Your trial ends today. Contact Tishgroup to keep access active.';
    case 'SUBSCRIPTION_TRIAL_EXPIRED':
      return 'TillFlow reminder: Your trial has ended. Access may be restricted until payment is confirmed.';
    case 'SUBSCRIPTION_RENEWS_30_DAYS':
      return `TillFlow reminder: Your ${snapshot.selectedPlan} plan renews in 30 days. Contact Tishgroup to stay active.`;
    case 'SUBSCRIPTION_RENEWS_14_DAYS':
      return `TillFlow reminder: Your ${snapshot.selectedPlan} plan renews in 14 days. Contact Tishgroup to stay active.`;
    case 'SUBSCRIPTION_RENEWS_7_DAYS':
      return `TillFlow reminder: Your ${snapshot.selectedPlan} plan renews in 7 days. Contact Tishgroup to stay active.`;
    case 'SUBSCRIPTION_RENEWS_3_DAYS':
      return `TillFlow reminder: Your ${snapshot.selectedPlan} plan renews in 3 days. Contact Tishgroup to stay active.`;
    case 'SUBSCRIPTION_RENEWS_TOMORROW':
      return `TillFlow reminder: Your ${snapshot.selectedPlan} plan renews tomorrow. Contact Tishgroup to stay active.`;
    case 'SUBSCRIPTION_RENEWAL_DUE_TODAY':
      return `TillFlow reminder: Your ${snapshot.selectedPlan} payment is due today. Contact Tishgroup to keep access active.`;
    case 'SUBSCRIPTION_OVERDUE':
      return `TillFlow reminder: Your ${snapshot.selectedPlan} payment is overdue. Contact Tishgroup now.`;
    case 'SUBSCRIPTION_SUSPENSION_WARNING':
      return 'TillFlow reminder: Payment is still pending. Contact Tishgroup to avoid restriction.';
    case 'SUBSCRIPTION_PAYMENT_CONFIRMED':
      return `TillFlow reminder: Payment confirmed. Your plan is active until ${activeUntil}.`;
  }
}

function reminderDueFor(business: ReminderBusiness, now: Date): SubscriptionReminderType | null {
  if (isCancelled(business)) return null;

  const snapshot = getSubscriptionSnapshot(business, now);
  const access = computeBillingAccessState({ ...business, timezone: business.timezone ?? 'Africa/Accra' }, now);
  const trialDays = access.daysRemaining;

  if (!snapshot.firstPaymentAt) {
    if (trialDays === 7) return 'SUBSCRIPTION_TRIAL_STARTED';
    if (trialDays === 3) return 'SUBSCRIPTION_TRIAL_ENDS_3_DAYS';
    if (trialDays === 1) return 'SUBSCRIPTION_TRIAL_ENDS_TOMORROW';
    if (trialDays === 0 && access.accessState !== 'TRIAL_RESTRICTED') return 'SUBSCRIPTION_TRIAL_ENDS_TODAY';
    if (trialDays != null && trialDays < 0) return 'SUBSCRIPTION_TRIAL_EXPIRED';
    return null;
  }

  const renewalDays = access.daysRemaining;
  if (renewalDays == null) return null;

  const interval = String(business.billingInterval ?? 'MONTHLY').toUpperCase();
  if (interval === 'ANNUAL') {
    if (renewalDays === 30) return 'SUBSCRIPTION_RENEWS_30_DAYS';
    if (renewalDays === 14) return 'SUBSCRIPTION_RENEWS_14_DAYS';
  }

  if (renewalDays === 7) return 'SUBSCRIPTION_RENEWS_7_DAYS';
  if (renewalDays === 3) return 'SUBSCRIPTION_RENEWS_3_DAYS';
  if (renewalDays === 1) return 'SUBSCRIPTION_RENEWS_TOMORROW';
  if (renewalDays === 0) return 'SUBSCRIPTION_RENEWAL_DUE_TODAY';
  if (renewalDays < 0 && access.accessState !== 'PAYMENT_RESTRICTED') return 'SUBSCRIPTION_OVERDUE';

  if (access.accessState === 'TRIAL_EXPIRED_GRACE' || access.accessState === 'PAYMENT_OVERDUE_GRACE') return 'SUBSCRIPTION_SUSPENSION_WARNING';
  return null;
}

export async function enqueueSubscriptionReminder(
  business: ReminderBusiness,
  type: SubscriptionReminderType,
  options: { now?: Date; tx?: PrismaTx } = {},
) {
  const now = options.now ?? new Date();
  const db = options.tx ?? prisma;

  if (isCancelled(business)) return { ok: false as const, reason: 'CANCELLED' as const };

  const recipient = normalizeGhanaPhone(business.phone);
  if (!recipient) return { ok: false as const, reason: 'NO_RECIPIENT' as const };

  const periodKey = periodKeyFor(type, business, now);
  const idempotencyKey = `${business.id}:${type}:${periodKey}`;
  const snapshot = getSubscriptionSnapshot(business, now);

  try {
    const created = await db.messageOutbox.create({
      data: {
        businessId: business.id,
        eventType: type,
        idempotencyKey,
        channel: 'SMS',
        recipient,
        body: reminderCopy(type, business, now),
        status: 'PENDING',
        nextAttemptAt: now,
        payloadJson: JSON.stringify({
          source: 'SUBSCRIPTION_LIFECYCLE',
          businessId: business.id,
          businessName: business.name,
          reminderType: type,
          periodKey,
          nextBillingDate: snapshot.nextBillingDate?.toISOString() ?? null,
          trialEndsAt: snapshot.trialEndsAt?.toISOString() ?? null,
        }),
      },
      select: { id: true },
    });
    return { ok: true as const, outboxId: created.id, deduped: false };
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'P2002') {
      return { ok: true as const, outboxId: null, deduped: true };
    }
    throw error;
  }
}

export async function enqueueSubscriptionPaymentConfirmed(
  businessId: string,
  options: { now?: Date; tx?: PrismaTx } = {},
) {
  const db = options.tx ?? prisma;
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      phone: true,
      timezone: true,
      plan: true,
      selectedPlan: true,
      planStatus: true,
      subscriptionStatus: true,
      firstPaymentAt: true,
      currentPeriodStartedAt: true,
      currentPeriodEndsAt: true,
      nextBillingDate: true,
      nextPaymentDueAt: true,
      lastPaymentAt: true,
      billingInterval: true,
    } as any,
  });
  if (!business) return { ok: false as const, reason: 'BUSINESS_NOT_FOUND' as const };
  return enqueueSubscriptionReminder(business as unknown as ReminderBusiness, 'SUBSCRIPTION_PAYMENT_CONFIRMED', options);
}

export async function enqueueDueSubscriptionReminders(now = new Date()) {
  const businesses = await prisma.business.findMany({
    where: {
      isDemo: false,
      subscriptionStatus: { notIn: ['CANCELLED'] },
    } as any,
    select: {
      id: true,
      name: true,
      phone: true,
      timezone: true,
      plan: true,
      selectedPlan: true,
      planStatus: true,
      subscriptionStatus: true,
      trialStartedAt: true,
      trialEndsAt: true,
      firstPaymentAt: true,
      currentPeriodStartedAt: true,
      currentPeriodEndsAt: true,
      nextBillingDate: true,
      nextPaymentDueAt: true,
      lastPaymentAt: true,
      paymentGraceEndsAt: true,
      suspendedAt: true,
      cancelledAt: true,
      billingInterval: true,
    } as any,
  });

  let queued = 0;
  let deduped = 0;
  let skipped = 0;

  for (const business of businesses as unknown as ReminderBusiness[]) {
    const type = reminderDueFor(business, now);
    if (!type) continue;

    const result = await enqueueSubscriptionReminder(business, type, { now });
    if (result.ok && result.deduped) deduped += 1;
    else if (result.ok) queued += 1;
    else skipped += 1;
  }

  return { queued, deduped, skipped };
}
