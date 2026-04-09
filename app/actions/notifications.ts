'use server';

import { Prisma } from '@prisma/client';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/format';
import { audit } from '@/lib/audit';
import { buildWhatsAppDeepLink, getWhatsAppProvider, sendWhatsAppMessage } from '@/lib/notifications/providers';
import {
  COMMON_AFRICAN_TIMEZONE_VALUES,
  DEFAULT_BUSINESS_TIMEZONE,
  formatBusinessDateLabel,
  getBusinessDayBounds,
  normalizeWhatsappPhone,
  resolveBusinessTimeZone,
  WHATSAPP_PHONE_PATTERN,
  WHATSAPP_TIME_PATTERN,
} from '@/lib/notifications/utils';
import {
  buildEodCronRunKey,
  EOD_SUMMARY_JOB_NAME,
  shouldUseEodRunKey,
} from '@/lib/notifications/eod';

function fmt(pence: number, currency: string) {
  return formatMoney(pence, currency);
}

type EodSummaryPayload = {
  text: string;
  deepLink: string;
  recipient: string | null;
};

type EodSummaryOptions = {
  requireEnabled?: boolean;
  phoneOverride?: string | null;
  branchScopeOverride?: string | null;
  timezoneOverride?: string | null;
};

async function resolveSummaryStore(businessId: string, branchScope: string) {
  if (branchScope !== 'MAIN') {
    return null;
  }

  const mainStore = await prisma.store.findFirst({
    where: { businessId, isMainStore: true } as any,
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true }
  });

  if (mainStore) {
    return mainStore;
  }

  return prisma.store.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true }
  });
}

const WhatsAppSettingsSchema = z.object({
  whatsappEnabled: z.boolean(),
  whatsappPhone: z.string().regex(WHATSAPP_PHONE_PATTERN, 'Invalid phone number').optional().or(z.literal('')),
  whatsappScheduleTime: z.string().regex(WHATSAPP_TIME_PATTERN, 'Use HH:mm format').optional().or(z.literal('')),
  whatsappBranchScope: z.enum(['ALL', 'MAIN']).optional(),
  timezone: z.enum(COMMON_AFRICAN_TIMEZONE_VALUES).optional(),
});

async function createMessageLogSafe(data: Record<string, unknown>) {
  try {
    return await prisma.messageLog.create({ data: data as Prisma.MessageLogUncheckedCreateInput });
  } catch (error) {
    console.error('[notifications] failed to create MessageLog', {
      businessId: data.businessId,
      recipient: data.recipient,
      messageType: data.messageType,
      error,
    });
    return null;
  }
}

function getScheduledJobStatus(messageStatus: string) {
  if (messageStatus === 'ACCEPTED' || messageStatus === 'DELIVERED' || messageStatus === 'READ') {
    return 'SUCCESS';
  }

  return 'REVIEW_REQUIRED';
}

function isConfirmedWhatsAppDelivery(status: string | null | undefined) {
  return status === 'DELIVERED' || status === 'READ';
}

async function revalidateNotificationsSettingsPage() {
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/settings/notifications');
}

async function _buildEodSummaryPayload(
  businessId: string,
  options: EodSummaryOptions = {}
): Promise<EodSummaryPayload> {
  const business = (await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      currency: true,
      whatsappPhone: true,
      whatsappEnabled: true,
      whatsappBranchScope: true,
      timezone: true
    } as any
  })) as {
    name: string;
    currency: string;
    whatsappPhone: string | null;
    whatsappEnabled: boolean;
    whatsappBranchScope: string | null;
    timezone: string | null;
  } | null;

  if (!business) {
    return { text: '', deepLink: '', recipient: null };
  }

  const requireEnabled = options.requireEnabled ?? true;
  if (requireEnabled && !business.whatsappEnabled) {
    return { text: '', deepLink: '', recipient: null };
  }

  const effectiveBranchScope = options.branchScopeOverride ?? business.whatsappBranchScope ?? 'ALL';
  const effectiveTimeZone = resolveBusinessTimeZone(options.timezoneOverride ?? business.timezone);
  const scopedStore = await resolveSummaryStore(businessId, effectiveBranchScope);
  const scopeLabel =
    effectiveBranchScope === 'MAIN' && scopedStore
      ? `Main branch (${scopedStore.name})`
      : 'All branches';
  const now = new Date();
  const { dayStart, dayEndExclusive } = getBusinessDayBounds(now, effectiveTimeZone);

  const salesInvoiceWhere = {
    businessId,
    ...(scopedStore ? { storeId: scopedStore.id } : {}),
    createdAt: { gte: dayStart, lt: dayEndExclusive }
  };
  const currency = business.currency;

  const [salesInvoices, paymentsToday, outstandingAr, lowStock, voids, returns, cashVarShifts] =
    await Promise.all([
      prisma.salesInvoice.findMany({
        where: {
          ...salesInvoiceWhere,
          paymentStatus: { notIn: ['RETURNED', 'VOID'] }
        },
        select: { totalPence: true, grossMarginPence: true }
      }),
      prisma.salesPayment.findMany({
        where: {
          receivedAt: { gte: dayStart, lt: dayEndExclusive },
          salesInvoice: {
            businessId,
            ...(scopedStore ? { storeId: scopedStore.id } : {})
          }
        },
        select: { method: true, amountPence: true }
      }),
      prisma.salesInvoice.aggregate({
        where: {
          businessId,
          ...(scopedStore ? { storeId: scopedStore.id } : {}),
          paymentStatus: { in: ['UNPAID', 'PART_PAID'] }
        },
        _sum: { totalPence: true }
      }),
      prisma.inventoryBalance.count({
        where: {
          ...(scopedStore ? { storeId: scopedStore.id } : { store: { businessId } }),
          qtyOnHandBase: { lte: 0 },
          product: { reorderPointBase: { gt: 0 } }
        }
      }),
      prisma.salesInvoice.count({
        where: {
          ...salesInvoiceWhere,
          paymentStatus: 'VOID'
        }
      }),
      prisma.salesReturn.count({
        where: {
          createdAt: { gte: dayStart, lt: dayEndExclusive },
          ...(scopedStore ? { storeId: scopedStore.id } : { store: { businessId } })
        }
      }),
      prisma.shift.findMany({
        where: {
          closedAt: { gte: dayStart, lt: dayEndExclusive },
          variance: { not: null },
          till: scopedStore ? { storeId: scopedStore.id } : { store: { businessId } }
        },
        select: { variance: true }
      })
    ]);

  const totalSales = salesInvoices.reduce((sum, invoice) => sum + invoice.totalPence, 0);
  const totalGrossProfit = salesInvoices.reduce(
    (sum, invoice) => sum + (invoice.grossMarginPence ?? 0),
    0
  );
  const transactionCount = salesInvoices.length;
  const paymentSplit = paymentsToday.reduce((acc, payment) => {
    acc[payment.method] = (acc[payment.method] ?? 0) + payment.amountPence;
    return acc;
  }, {} as Record<string, number>);
  const arTotal = outstandingAr._sum.totalPence ?? 0;
  const cashVariance = cashVarShifts.reduce((sum, shift) => sum + Math.abs(shift.variance ?? 0), 0);
  const gpPct = totalSales > 0 ? Math.round((totalGrossProfit / totalSales) * 100) : 0;
  const dateLabel = formatBusinessDateLabel(now, effectiveTimeZone);

  const lines: string[] = [
    `${business.name} - EOD Summary`,
    `Date: ${dateLabel}`,
    `Scope: ${scopeLabel}`,
    '',
    `Sales: ${fmt(totalSales, currency)} (${transactionCount} tx)`,
    `Gross Profit: ${fmt(totalGrossProfit, currency)} (${gpPct}%)`,
    '',
    'Payment Split:',
    `- Cash: ${fmt(paymentSplit.CASH ?? 0, currency)}`,
    `- MoMo: ${fmt(paymentSplit.MOBILE_MONEY ?? 0, currency)}`,
    `- Card: ${fmt(paymentSplit.CARD ?? 0, currency)}`,
    `- Transfer: ${fmt(paymentSplit.TRANSFER ?? 0, currency)}`,
    '',
    `Debtors (AR): ${fmt(arTotal, currency)}`
  ];

  if (voids > 0) lines.push(`Voids: ${voids}`);
  if (returns > 0) lines.push(`Returns: ${returns}`);
  if (lowStock > 0) lines.push(`Low Stock Items: ${lowStock}`);
  if (cashVariance > 0) lines.push(`Cash Variance: ${fmt(cashVariance, currency)}`);
  lines.push('', 'Sent by TillFlow POS');

  const text = lines.join('\n');
  const phone = normalizeWhatsappPhone(options.phoneOverride ?? business.whatsappPhone);
  const deepLink = buildWhatsAppDeepLink(phone ?? '', text);

  return { text, deepLink, recipient: phone || null };
}

export async function buildEodSummaryPayload(): Promise<EodSummaryPayload> {
  const { withBusinessContext } = await import('@/lib/action-utils');
  const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
  return _buildEodSummaryPayload(businessId);
}

export async function buildEodSummaryPreviewForBusiness(
  businessId: string,
  options: Pick<EodSummaryOptions, 'phoneOverride' | 'branchScopeOverride' | 'timezoneOverride'> = {}
): Promise<EodSummaryPayload> {
  return _buildEodSummaryPayload(businessId, {
    ...options,
    requireEnabled: false
  });
}

export async function _sendEodSummaryForBusiness(businessId: string, triggeredBy = 'CRON') {
  const startedAt = new Date();
  let jobId: string | null = null;
  const runKey = shouldUseEodRunKey(triggeredBy)
    ? buildEodCronRunKey(businessId, startedAt)
    : null;

  try {
    try {
      const job = await prisma.scheduledJob.create({
        data: {
          businessId,
          jobName: EOD_SUMMARY_JOB_NAME,
          runKey,
          status: 'RUNNING',
          triggeredBy,
          startedAt
        } as any
      });
      jobId = job.id;
    } catch (error) {
      if (
        runKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existingJob = await prisma.scheduledJob.findFirst({
          where: { runKey } as any,
          select: { id: true, status: true, startedAt: true },
        });

        return {
          ok: true,
          skipped: true,
          reason: 'duplicate_cron',
          existingJobId: existingJob?.id ?? null,
          existingStatus: existingJob?.status ?? null,
          startedAt: existingJob?.startedAt ?? null,
        };
      }
      throw error;
    }

    const { text, deepLink, recipient } = await _buildEodSummaryPayload(businessId);

    if (!text) {
      await prisma.scheduledJob.update({
        where: { id: jobId },
        data: {
          status: 'SKIPPED',
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          resultJson: JSON.stringify({ reason: 'WhatsApp not enabled or business not found' })
        }
      });
      return { ok: false, reason: 'disabled' };
    }

    if (!recipient) {
      const missingRecipientMessage = 'Owner WhatsApp phone is missing or invalid.';

      await createMessageLogSafe({
        businessId,
        channel: 'WHATSAPP',
        provider: 'WHATSAPP_DEEPLINK',
        recipient: 'missing_recipient',
        messageType: 'EOD_SUMMARY',
        payload: text,
        status: 'FAILED',
        providerStatus: 'MISSING_RECIPIENT',
        errorMessage: missingRecipientMessage,
        deepLink,
        deliveredAt: null,
      });

      await prisma.scheduledJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          errorMessage: missingRecipientMessage,
          resultJson: JSON.stringify({
            status: 'FAILED',
            provider: 'WHATSAPP_DEEPLINK',
            providerStatus: 'MISSING_RECIPIENT',
            deepLinkGenerated: !!deepLink,
          }),
        },
      });

      return { ok: false, reason: 'missing_recipient', error: missingRecipientMessage };
    }

    const delivery = await sendWhatsAppMessage({
      recipient,
      text,
      messageType: 'EOD_SUMMARY',
    });

    await createMessageLogSafe({
      businessId,
      channel: 'WHATSAPP',
      provider: delivery.provider,
      recipient,
      messageType: 'EOD_SUMMARY',
      payload: text,
      status: delivery.status,
      providerStatus: delivery.providerStatus,
      providerMessageId: delivery.providerMessageId ?? null,
      errorMessage: delivery.errorMessage ?? null,
      deepLink: delivery.deepLink ?? deepLink,
      deliveredAt: null,
    });

    const owner = await prisma.user.findFirst({
      where: { businessId, role: 'OWNER' },
      select: { id: true, name: true, role: true }
    });

    if (owner) {
      audit({
        businessId,
        userId: owner.id,
        userName: owner.name,
        userRole: owner.role,
        action: 'WHATSAPP_EOD_SENT',
        entity: 'MessageLog',
        details: {
          recipient,
          channel: 'WHATSAPP',
          messageType: 'EOD_SUMMARY',
          provider: delivery.provider,
          providerStatus: delivery.providerStatus,
          providerMessageId: delivery.providerMessageId ?? null,
          attemptedProvider: delivery.attemptedProvider ?? null,
          status: delivery.status,
        }
      });
    }

    const scheduledJobStatus = getScheduledJobStatus(delivery.status);

    await prisma.scheduledJob.update({
      where: { id: jobId },
      data: {
        status: scheduledJobStatus,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        errorMessage: scheduledJobStatus === 'SUCCESS' ? null : delivery.errorMessage ?? 'Manual review required',
        resultJson: JSON.stringify({
          recipient,
          status: delivery.status,
          provider: delivery.provider,
          providerStatus: delivery.providerStatus,
          providerMessageId: delivery.providerMessageId ?? null,
          attemptedProvider: delivery.attemptedProvider ?? null,
          deepLinkGenerated: !!(delivery.deepLink ?? deepLink),
          errorMessage: delivery.errorMessage ?? null,
        })
      }
    });

    return {
      ok: delivery.ok,
      status: delivery.status,
      provider: delivery.provider,
      deepLink: delivery.deepLink ?? deepLink,
      recipient,
      error: delivery.errorMessage ?? null,
    };
  } catch (err: any) {
    if (jobId) {
      await prisma.scheduledJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          errorMessage: err?.message ?? 'Unknown error'
        }
      });
    }
    return { ok: false, error: err?.message };
  }
}

export async function sendEodSummaryAction() {
  const { withBusinessContext } = await import('@/lib/action-utils');
  const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
  return _sendEodSummaryForBusiness(businessId, 'MANUAL');
}

export async function retryNotificationAction(messageLogId: string) {
  const { withBusinessContext } = await import('@/lib/action-utils');
  const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

  const messageLog = await prisma.messageLog.findFirst({
    where: {
      id: messageLogId,
      businessId,
      channel: 'WHATSAPP',
    },
    select: {
      id: true,
      recipient: true,
      payload: true,
      messageType: true,
      deepLink: true,
    },
  });

  if (!messageLog) {
    return { ok: false, status: 'FAILED', error: 'Message log not found.' };
  }

  if (!messageLog.recipient || messageLog.recipient === 'missing_recipient') {
    return {
      ok: false,
      status: 'FAILED',
      error: 'This message is missing a valid recipient phone number.',
    };
  }

  const metaProvider = getWhatsAppProvider('META_WHATSAPP');

  if (!metaProvider.isConfigured()) {
    await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: {
        provider: 'META_WHATSAPP',
        status: 'FAILED',
        providerStatus: 'META_NOT_CONFIGURED',
        errorMessage: 'Meta WhatsApp delivery is not configured for retries.',
        sentAt: new Date(),
      } as any,
    });

    await revalidateNotificationsSettingsPage();

    return {
      ok: false,
      status: 'FAILED',
      error: 'Meta WhatsApp delivery is not configured for retries.',
    };
  }

  const fallbackDeepLink = messageLog.deepLink ?? buildWhatsAppDeepLink(messageLog.recipient, messageLog.payload);
  const delivery = await metaProvider.sendMessage({
    recipient: messageLog.recipient,
    text: messageLog.payload,
    messageType: messageLog.messageType,
  });

  const nextStatus = delivery.ok ? delivery.status : 'FAILED';

  await prisma.messageLog.update({
    where: { id: messageLog.id },
    data: {
      provider: 'META_WHATSAPP',
      status: nextStatus,
      providerStatus: delivery.providerStatus,
      providerMessageId: delivery.providerMessageId ?? null,
      errorMessage: delivery.errorMessage ?? null,
      deepLink: delivery.deepLink ?? fallbackDeepLink,
      sentAt: new Date(),
      deliveredAt: isConfirmedWhatsAppDelivery(nextStatus) ? new Date() : null,
    } as any,
  });

  await revalidateNotificationsSettingsPage();

  return {
    ok: delivery.ok,
    status: nextStatus,
    provider: 'META_WHATSAPP',
    deepLink: delivery.deepLink ?? fallbackDeepLink,
    error: delivery.errorMessage ?? null,
  };
}

export async function markNotificationSentAction(messageLogId: string) {
  const { withBusinessContext } = await import('@/lib/action-utils');
  const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

  const messageLog = await prisma.messageLog.findFirst({
    where: {
      id: messageLogId,
      businessId,
      channel: 'WHATSAPP',
    },
    select: { id: true },
  });

  if (!messageLog) {
    return { ok: false, error: 'Message log not found.' };
  }

  const deliveredAt = new Date();

  await prisma.messageLog.update({
    where: { id: messageLog.id },
    data: {
      status: 'DELIVERED',
      providerStatus: 'MANUALLY_CONFIRMED',
      errorMessage: null,
      deliveredAt,
    } as any,
  });

  await revalidateNotificationsSettingsPage();

  return {
    ok: true,
    status: 'DELIVERED',
    deliveredAt: deliveredAt.toISOString(),
  };
}

export async function updateWhatsappSettingsAction(formData: FormData): Promise<void> {
  const { requireBusiness } = await import('@/lib/auth');
  const { business } = await requireBusiness(['OWNER']);
  if (!business) return;
  if (!(business as any).billingCanWrite) {
    redirect('/settings/notifications?error=This business is read-only until payment is recorded in Billing %26 Plans.');
  }

  const parsed = WhatsAppSettingsSchema.safeParse({
    whatsappEnabled: formData.get('whatsappEnabled') === 'on',
    whatsappPhone: String(formData.get('whatsappPhone') ?? '').trim(),
    whatsappScheduleTime: String(formData.get('whatsappScheduleTime') ?? '20:00').trim(),
    whatsappBranchScope: String(formData.get('whatsappBranchScope') ?? 'ALL').trim() || 'ALL',
    timezone: String(formData.get('timezone') ?? DEFAULT_BUSINESS_TIMEZONE).trim() || DEFAULT_BUSINESS_TIMEZONE,
  });

  if (!parsed.success) {
    redirect(
      `/settings/notifications?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? 'Invalid WhatsApp settings')}`
    );
  }

  const { whatsappEnabled, whatsappPhone, whatsappScheduleTime, whatsappBranchScope, timezone } = parsed.data;

  await prisma.business.update({
    where: { id: business.id },
    data: {
      whatsappEnabled,
      whatsappPhone: whatsappPhone || null,
      whatsappScheduleTime: whatsappScheduleTime || '20:00',
      whatsappBranchScope: whatsappBranchScope ?? 'ALL',
      timezone: timezone ?? DEFAULT_BUSINESS_TIMEZONE,
    } as any
  });

  await revalidateNotificationsSettingsPage();
}
