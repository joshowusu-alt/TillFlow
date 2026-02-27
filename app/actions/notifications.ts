'use server';

import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/format';
import { audit } from '@/lib/audit';
import { withBusinessContext } from '@/lib/action-utils';

/** Currency-formatted with proper symbol for Ghana */
function fmt(pence: number, currency: string) {
  return formatMoney(pence, currency);
}

/** Internal helper — build the EOD WhatsApp message text for a business (no auth check). */
async function _buildEodSummaryPayload(businessId: string): Promise<{
  text: string;
  deepLink: string;
  recipient: string | null;
}> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      currency: true,
      whatsappPhone: true,
      whatsappEnabled: true,
    },
  });
  if (!business || !business.whatsappEnabled) {
    return { text: '', deepLink: '', recipient: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const currency = business.currency;

  const [salesInvoices, paymentsToday, outstandingAR, lowStock, voids, returns, cashVarShifts] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        businessId,
        createdAt: { gte: today, lte: todayEnd },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
      select: { totalPence: true, grossMarginPence: true },
    }),
    prisma.salesPayment.findMany({
      where: {
        receivedAt: { gte: today, lte: todayEnd },
        salesInvoice: { businessId },
      },
      select: { method: true, amountPence: true },
    }),
    prisma.salesInvoice.aggregate({
      where: { businessId, paymentStatus: { in: ['UNPAID', 'PART_PAID'] } },
      _sum: { totalPence: true },
    }),
    prisma.inventoryBalance.count({
      where: {
        store: { businessId },
        qtyOnHandBase: { lte: 0 },
        product: { reorderPointBase: { gt: 0 } },
      },
    }),
    prisma.salesInvoice.count({
      where: { businessId, createdAt: { gte: today, lte: todayEnd }, paymentStatus: 'VOID' },
    }),
    prisma.salesReturn.count({
      where: { store: { businessId }, createdAt: { gte: today, lte: todayEnd } },
    }),
    prisma.shift.findMany({
      where: {
        till: { store: { businessId } },
        closedAt: { gte: today, lte: todayEnd },
        variance: { not: null },
      },
      select: { variance: true },
    }),
  ]);

  const totalSales = salesInvoices.reduce((s, x) => s + x.totalPence, 0);
  const totalGP = salesInvoices.reduce((s, x) => s + (x.grossMarginPence ?? 0), 0);
  const txCount = salesInvoices.length;
  const split = paymentsToday.reduce(
    (acc, p) => { acc[p.method] = (acc[p.method] ?? 0) + p.amountPence; return acc; },
    {} as Record<string, number>
  );
  const arTotal = outstandingAR._sum.totalPence ?? 0;
  const cashVar = cashVarShifts.reduce((s, v) => s + Math.abs(v.variance ?? 0), 0);
  const gpPct = totalSales > 0 ? Math.round((totalGP / totalSales) * 100) : 0;

  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const lines: string[] = [
    `📊 *${business.name} – EOD Summary*`,
    `📅 ${dateStr}`,
    ``,
    `💰 *Sales:* ${fmt(totalSales, currency)} (${txCount} tx)`,
    `📈 *Gross Profit:* ${fmt(totalGP, currency)} (${gpPct}%)`,
    ``,
    `*Payment Split:*`,
    `  💵 Cash: ${fmt(split['CASH'] ?? 0, currency)}`,
    `  📱 MoMo: ${fmt(split['MOBILE_MONEY'] ?? 0, currency)}`,
    `  💳 Card: ${fmt(split['CARD'] ?? 0, currency)}`,
    `  🏦 Transfer: ${fmt(split['TRANSFER'] ?? 0, currency)}`,
    ``,
    `🔴 *Debtors (AR):* ${fmt(arTotal, currency)}`,
  ];

  if (voids > 0) lines.push(`⚠️ *Voids:* ${voids}`);
  if (returns > 0) lines.push(`🔄 *Returns:* ${returns}`);
  if (lowStock > 0) lines.push(`📦 *Low Stock Items:* ${lowStock}`);
  if (cashVar > 0) lines.push(`💲 *Cash Variance:* ${fmt(cashVar, currency)}`);
  lines.push(``, `_Sent by TillFlow POS_`);

  const text = lines.join('\n');
  const encoded = encodeURIComponent(text);
  const phone = (business.whatsappPhone ?? '').replace(/\D/g, '');
  const deepLink = phone
    ? `https://wa.me/${phone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  return { text, deepLink, recipient: phone || null };
}

/**
 * Authenticated server action — build EOD summary payload for the currently
 * signed-in user's business. Derives businessId from the session.
 */
export async function buildEodSummaryPayload(): Promise<{
  text: string;
  deepLink: string;
  recipient: string | null;
}> {
  const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
  return _buildEodSummaryPayload(businessId);
}

/** Internal helper — run the EOD summary send for a business (no auth check, for cron use). */
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
        startedAt,
      },
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
          resultJson: JSON.stringify({ reason: 'WhatsApp not enabled or business not found' }),
        },
      });
      return { ok: false, reason: 'disabled' };
    }

    // Log the message
    await prisma.messageLog.create({
      data: {
        businessId,
        channel: 'WHATSAPP',
        recipient: recipient ?? 'unknown',
        messageType: 'EOD_SUMMARY',
        payload: text,
        status: 'SENT',
        deepLink,
      },
    });

    // Audit log the send
    const owner = await prisma.user.findFirst({
      where: { businessId, role: 'OWNER' },
      select: { id: true, name: true, role: true },
    });
    if (owner) {
      audit({
        businessId,
        userId: owner.id,
        userName: owner.name,
        userRole: owner.role,
        action: 'WHATSAPP_EOD_SENT',
        entity: 'MessageLog',
        details: { recipient, channel: 'WHATSAPP', messageType: 'EOD_SUMMARY' },
      });
    }

    await prisma.scheduledJob.update({
      where: { id: jobId },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        resultJson: JSON.stringify({ recipient, deepLinkGenerated: !!deepLink }),
      },
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
          errorMessage: err?.message ?? 'Unknown error',
        },
      });
    }
    return { ok: false, error: err?.message };
  }
}

/**
 * Authenticated server action — send EOD summary for the currently signed-in
 * user's business. Derives businessId from the session.
 */
export async function sendEodSummaryAction() {
  const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
  return _sendEodSummaryForBusiness(businessId, 'MANUAL');
}

/** Update WhatsApp notification settings for a business */
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
    data: { whatsappEnabled, whatsappPhone, whatsappScheduleTime, whatsappBranchScope },
  });

  const { revalidatePath } = await import('next/cache');
  revalidatePath('/settings/notifications');
}
