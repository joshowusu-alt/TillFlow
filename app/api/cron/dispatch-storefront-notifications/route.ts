import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { sendStorefrontSms } from '@/lib/services/storefront-sms';
import { OWNER_DAILY_SUMMARY_EVENT_TYPE } from '@/lib/notifications/owner-daily-summary-sms';
import {
  STOREFRONT_SMS_DAILY_CAP,
  STOREFRONT_SMS_DAILY_CAP_WARNING_RATIO,
} from '@/lib/services/storefront-notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BATCH_SIZE = 50;
const STALE_LOCK_MS = 5 * 60 * 1000; // 5 min
const MAX_ATTEMPTS = 5;

/**
 * Backoff per attempt count (the value of `attempts` AFTER incrementing on
 * failure). Index 1 = 1 minute, 2 = 5 minutes, 3 = 15 minutes, 4 = 60
 * minutes. After attempt 5 we mark FAILED, so no further entry.
 */
const BACKOFF_MS_BY_ATTEMPT: Record<number, number> = {
  1: 60 * 1000,
  2: 5 * 60 * 1000,
  3: 15 * 60 * 1000,
  4: 60 * 60 * 1000,
};

const DAILY_CAP_ERROR = 'DAILY_CAP_REACHED';

function startOfUtcDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function nextUtcMidnightPlusJitter(date: Date): Date {
  const next = startOfUtcDay(date);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCMilliseconds(Math.floor(Math.random() * 60_000)); // up to a 1-min jitter
  return next;
}

function sanitizeError(error: string): string {
  return error.length > 240 ? error.slice(0, 240) : error;
}

function backoffFor(nextAttempts: number): Date | null {
  const delay = BACKOFF_MS_BY_ATTEMPT[nextAttempts];
  if (!delay) return null;
  return new Date(Date.now() + delay);
}

type LockedRow = {
  id: string;
  businessId: string;
  eventType: string;
  recipient: string;
  body: string;
  attempts: number;
  business: {
    smsNotificationsEnabled: boolean;
    smsSenderId: string | null;
  } | null;
};

async function lockBatch(now: Date, runId: string): Promise<LockedRow[]> {
  const staleCutoff = new Date(now.getTime() - STALE_LOCK_MS);

  // Read only a bounded ID batch. Empty queues cost one narrow read and no writes.
  const eligible = {
    status: 'PENDING',
    AND: [
      { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      { OR: [{ lockedAt: null }, { lockedAt: { lt: staleCutoff } }] },
    ],
  };
  const candidates = await prisma.messageOutbox.findMany({
    where: eligible, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: BATCH_SIZE, select: { id: true },
  });
  if (!candidates.length) return [];
  const lockedAt = now;
  // Recheck eligibility atomically: another dispatcher may have claimed these IDs.
  await prisma.messageOutbox.updateMany({
    where: { ...eligible, id: { in: candidates.map(row => row.id) } },
    data: { lockedAt, lastError: `LOCKED:${runId}` },
  });

  const allLocked = await prisma.messageOutbox.findMany({
    where: { id: { in: candidates.map(row => row.id) }, lockedAt, lastError: `LOCKED:${runId}` },
    take: BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      businessId: true,
      eventType: true,
      recipient: true,
      body: true,
      attempts: true,
      business: { select: { smsNotificationsEnabled: true, smsSenderId: true } },
    },
  });

  return allLocked;
}

async function countSentToday(businessId: string, now: Date): Promise<number> {
  return prisma.messageOutbox.count({
    where: {
      businessId,
      status: 'SENT',
      sentAt: { gte: startOfUtcDay(now) },
    },
  });
}

async function markPendingDueToCap(rowId: string, now: Date) {
  await prisma.messageOutbox.update({
    where: { id: rowId },
    data: {
      status: 'PENDING',
      lockedAt: null,
      // Daily cap doesn't burn an attempt — we just pause until tomorrow.
      lastError: DAILY_CAP_ERROR,
      nextAttemptAt: nextUtcMidnightPlusJitter(now),
    },
  });
}

async function markSent(rowId: string, providerStatus: string, now: Date) {
  await prisma.messageOutbox.update({
    where: { id: rowId },
    data: {
      status: 'SENT',
      sentAt: now,
      lockedAt: null,
      lastError: null,
      nextAttemptAt: null,
      attempts: { increment: 1 },
      payloadJson: providerStatus
        ? // append provider status note without overwriting payload
          undefined
        : undefined,
    },
  });
}

function isSubscriptionReminder(eventType: string) {
  return eventType.startsWith('SUBSCRIPTION_');
}

function isOperationalOwnerSms(eventType: string) {
  return eventType === OWNER_DAILY_SUMMARY_EVENT_TYPE;
}

async function markFailureOrRetry(
  rowId: string,
  error: string,
  retryable: boolean,
  attempts: number,
) {
  const nextAttempts = attempts + 1;
  const sanitized = sanitizeError(error);

  if (!retryable || nextAttempts >= MAX_ATTEMPTS) {
    await prisma.messageOutbox.update({
      where: { id: rowId },
      data: {
        status: 'FAILED',
        lockedAt: null,
        lastError: sanitized,
        nextAttemptAt: null,
        attempts: nextAttempts,
      },
    });
    return;
  }

  const nextAttemptAt = backoffFor(nextAttempts) ?? new Date(Date.now() + 60_000);
  await prisma.messageOutbox.update({
    where: { id: rowId },
    data: {
      status: 'PENDING',
      lockedAt: null,
      lastError: sanitized,
      nextAttemptAt,
      attempts: nextAttempts,
    },
  });
}

export async function GET(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const runId = randomUUID();
  const batch = await lockBatch(now, runId);

  if (batch.length === 0) {
    return NextResponse.json({ run: runId, processed: 0 });
  }

  const sentTodayByBusiness = new Map<string, number>();

  let sent = 0;
  let failed = 0;
  let retried = 0;
  let capped = 0;
  let warnings = 0;

  for (const row of batch) {
    if (
      !isSubscriptionReminder(row.eventType) &&
      !isOperationalOwnerSms(row.eventType) &&
      !row.business?.smsNotificationsEnabled
    ) {
      // Merchant disabled SMS between enqueue and dispatch — fail without
      // burning attempts so the row stays auditable.
      await prisma.messageOutbox.update({
        where: { id: row.id },
        data: {
          status: 'CANCELLED',
          lockedAt: null,
          lastError: 'NOTIFICATIONS_DISABLED',
        },
      });
      failed += 1;
      continue;
    }

    // Operational owner messages (e.g. EOD summary) bypass the storefront
    // daily cap — they must always be delivered regardless of order volume.
    if (!isOperationalOwnerSms(row.eventType) && !isSubscriptionReminder(row.eventType)) {
      let alreadySentToday = sentTodayByBusiness.get(row.businessId);
      if (alreadySentToday === undefined) {
        alreadySentToday = await countSentToday(row.businessId, now);
        sentTodayByBusiness.set(row.businessId, alreadySentToday);
      }

      if (alreadySentToday >= STOREFRONT_SMS_DAILY_CAP) {
        await markPendingDueToCap(row.id, now);
        capped += 1;
        continue;
      }
    }

    const result = await sendStorefrontSms({
      to: row.recipient,
      body: row.body,
      senderId: row.business?.smsSenderId ?? null,
    });

    if (result.ok) {
      await markSent(row.id, result.providerStatus, now);
      sent += 1;

      // Only track storefront SMS against the daily cap counter.
      if (!isOperationalOwnerSms(row.eventType) && !isSubscriptionReminder(row.eventType)) {
        const prevCount = sentTodayByBusiness.get(row.businessId) ?? 0;
        sentTodayByBusiness.set(row.businessId, prevCount + 1);

        if (
          prevCount + 1 >=
          Math.floor(STOREFRONT_SMS_DAILY_CAP * STOREFRONT_SMS_DAILY_CAP_WARNING_RATIO)
        ) {
          warnings += 1;
          console.warn('[sms-dispatcher] business approaching daily cap', {
            businessId: row.businessId,
            sentToday: prevCount + 1,
            cap: STOREFRONT_SMS_DAILY_CAP,
          });
        }
      }
    } else {
      if (result.retryable && row.attempts + 1 < MAX_ATTEMPTS) retried += 1;
      else failed += 1;
      await markFailureOrRetry(row.id, result.error, result.retryable, row.attempts);
    }
  }

  return NextResponse.json({
    run: runId,
    processed: batch.length,
    sent,
    failed,
    retried,
    capped,
    warnings,
  });
}
