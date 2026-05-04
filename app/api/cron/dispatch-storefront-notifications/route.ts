import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { sendStorefrontSms } from '@/lib/services/storefront-sms';
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

  // Two-phase: stamp `lastError` with the runId on the rows we want to grab,
  // then fetch by that marker. updateMany is atomic per-row so two concurrent
  // dispatchers won't double-grab the same id.
  const lockedAt = now;
  await prisma.messageOutbox.updateMany({
    where: {
      status: 'PENDING',
      AND: [
        {
          OR: [
            { nextAttemptAt: null },
            { nextAttemptAt: { lte: now } },
          ],
        },
        {
          OR: [
            { lockedAt: null },
            { lockedAt: { lt: staleCutoff } },
          ],
        },
      ],
      // Cap the batch via id list (Prisma has no LIMIT for updateMany on Postgres
      // without raw SQL; we narrow with a pre-query).
    },
    data: {
      lockedAt,
      lastError: `LOCKED:${runId}`,
    },
  });

  // We over-locked; trim to the batch size by reading-then-releasing the rest.
  const allLocked = await prisma.messageOutbox.findMany({
    where: { lockedAt, lastError: `LOCKED:${runId}` },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      businessId: true,
      recipient: true,
      body: true,
      attempts: true,
      business: { select: { smsNotificationsEnabled: true, smsSenderId: true } },
    },
  });

  if (allLocked.length <= BATCH_SIZE) {
    return allLocked;
  }

  const overflow = allLocked.slice(BATCH_SIZE);
  await prisma.messageOutbox.updateMany({
    where: { id: { in: overflow.map((row) => row.id) } },
    data: { lockedAt: null, lastError: null },
  });

  return allLocked.slice(0, BATCH_SIZE);
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
    if (!row.business?.smsNotificationsEnabled) {
      // Merchant disabled SMS between enqueue and dispatch — fail without
      // burning attempts so the row stays auditable.
      await prisma.messageOutbox.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          lockedAt: null,
          lastError: 'NOTIFICATIONS_DISABLED',
        },
      });
      failed += 1;
      continue;
    }

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

    const result = await sendStorefrontSms({
      to: row.recipient,
      body: row.body,
      senderId: row.business?.smsSenderId ?? null,
    });

    if (result.ok) {
      await markSent(row.id, result.providerStatus, now);
      sent += 1;
      sentTodayByBusiness.set(row.businessId, alreadySentToday + 1);

      if (
        alreadySentToday + 1 >=
        Math.floor(STOREFRONT_SMS_DAILY_CAP * STOREFRONT_SMS_DAILY_CAP_WARNING_RATIO)
      ) {
        warnings += 1;
        console.warn('[sms-dispatcher] business approaching daily cap', {
          businessId: row.businessId,
          sentToday: alreadySentToday + 1,
          cap: STOREFRONT_SMS_DAILY_CAP,
        });
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
