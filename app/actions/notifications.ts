'use server';

import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/format';
import { audit } from '@/lib/audit';
import { withBusinessContext } from '@/lib/action-utils';

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
};

async function resolveSummaryStore(businessId: string, branchScope: string) {
  if (branchScope !== 'MAIN') {
    return null;
  }

  return prisma.store.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true }
  });
}

async function _buildEodSummaryPayload(
  businessId: string,
  options: EodSummaryOptions = {}
): Promise<EodSummaryPayload> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      currency: true,
      whatsappPhone: true,
      whatsappEnabled: true,
      whatsappBranchScope: true
    }
  });

  if (!business) {
    return { text: '', deepLink: '', recipient: null };
  }

  const requireEnabled = options.requireEnabled ?? true;
  if (requireEnabled && !business.whatsappEnabled) {
    return { text: '', deepLink: '', recipient: null };
  }

  const effectiveBranchScope = options.branchScopeOverride ?? business.whatsappBranchScope ?? 'ALL';
  const scopedStore = await resolveSummaryStore(businessId, effectiveBranchScope);
  const scopeLabel =
    effectiveBranchScope === 'MAIN' && scopedStore
      ? `Main branch (${scopedStore.name})`
      : 'All branches';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const salesInvoiceWhere = {
    businessId,
    ...(scopedStore ? { storeId: scopedStore.id } : {}),
    createdAt: { gte: today, lte: todayEnd }
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
          receivedAt: { gte: today, lte: todayEnd },
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
          createdAt: { gte: today, lte: todayEnd },
          ...(scopedStore ? { storeId: scopedStore.id } : { store: { businessId } })
        }
      }),
      prisma.shift.findMany({
        where: {
          closedAt: { gte: today, lte: todayEnd },
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
  const dateLabel = today.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short'
  });

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
  const phone = (options.phoneOverride ?? business.whatsappPhone ?? '').replace(/\D/g, '');
  const deepLink = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  return { text, deepLink, recipient: phone || null };
}

export async function buildEodSummaryPayload(): Promise<EodSummaryPayload> {
  const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
  return _buildEodSummaryPayload(businessId);
}

export async function buildEodSummaryPreviewForBusiness(
  businessId: string,
  options: Pick<EodSummaryOptions, 'phoneOverride' | 'branchScopeOverride'> = {}
): Promise<EodSummaryPayload> {
  return _buildEodSummaryPayload(businessId, {
    ...options,
    requireEnabled: false
  });
}

export async function _sendEodSummaryForBusiness(businessId: string, triggeredBy = 'CRON') {
  const startedAt = new Date();
  let jobId: string | null = null;

  try {
    const job = await prisma.scheduledJob.create({
      data: {
        businessId,
        jobName: 'EOD_WHATSAPP_SUMMARY',
        status: 'RUNNING',
        triggeredBy,
        startedAt
      }
    });
    jobId = job.id;

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

    await prisma.messageLog.create({
      data: {
        businessId,
        channel: 'WHATSAPP',
        recipient: recipient ?? 'unknown',
        messageType: 'EOD_SUMMARY',
        payload: text,
        status: 'SENT',
        deepLink
      }
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
        details: { recipient, channel: 'WHATSAPP', messageType: 'EOD_SUMMARY' }
      });
    }

    await prisma.scheduledJob.update({
      where: { id: jobId },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        resultJson: JSON.stringify({ recipient, deepLinkGenerated: !!deepLink })
      }
    });

    return { ok: true, deepLink, recipient };
  } catch (err: any) {
    if (jobId) {
      await prisma.scheduledJob.update({
        where: { id: jobId },
        data: {
          status: 'ERROR',
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
  const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
  return _sendEodSummaryForBusiness(businessId, 'MANUAL');
}

export async function updateWhatsappSettingsAction(formData: FormData): Promise<void> {
  const { requireBusiness } = await import('@/lib/auth');
  const { business } = await requireBusiness(['OWNER']);
  if (!business) return;

  const whatsappEnabled = formData.get('whatsappEnabled') === 'on';
  const whatsappPhone = String(formData.get('whatsappPhone') ?? '').trim() || null;
  const whatsappScheduleTime = String(formData.get('whatsappScheduleTime') ?? '20:00').trim();
  const whatsappBranchScope = String(formData.get('whatsappBranchScope') ?? 'ALL').trim();

  await prisma.business.update({
    where: { id: business.id },
    data: { whatsappEnabled, whatsappPhone, whatsappScheduleTime, whatsappBranchScope }
  });

  const { revalidatePath } = await import('next/cache');
  revalidatePath('/settings/notifications');
}
