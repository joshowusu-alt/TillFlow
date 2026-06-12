import { Prisma } from '@prisma/client';

import { formatMoney } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import { normalizeGhanaPhone } from '@/lib/storefront-phone';
import {
  formatBusinessDateLabel,
  formatBusinessLocalDateKey,
  getBusinessDayBounds,
  resolveBusinessTimeZone,
} from '@/lib/notifications/utils';

export const OWNER_DAILY_SUMMARY_EVENT_TYPE = 'OWNER_DAILY_SUMMARY';

type PrismaTx = Prisma.TransactionClient | typeof prisma;

type OwnerSummaryBusiness = {
  id: string;
  name: string;
  currency: string;
  phone: string | null;
  whatsappPhone: string | null;
  timezone: string | null;
  whatsappBranchScope: string | null;
};

type OwnerDailySummaryMetrics = {
  dateLabel: string;
  scopeLabel: string;
  totalSalesPence: number;
  grossProfitPence: number;
  transactionCount: number;
  cashPence: number;
  momoPence: number;
  cardPence: number;
  transferPence: number;
  outstandingArPence: number;
  lowStockCount: number;
  voidCount: number;
  returnCount: number;
  cashVariancePence: number;
};

function money(value: number, currency: string) {
  return formatMoney(value, currency).replace('GH₵', 'GHS ');
}

function resolveOwnerRecipient(business: Pick<OwnerSummaryBusiness, 'phone' | 'whatsappPhone'>) {
  return normalizeGhanaPhone(business.whatsappPhone) ?? normalizeGhanaPhone(business.phone);
}

async function resolveSummaryStore(
  db: PrismaTx,
  businessId: string,
  branchScope: string | null,
) {
  if ((branchScope ?? 'ALL') !== 'MAIN') return null;

  const mainStore = await db.store.findFirst({
    where: { businessId, isMainStore: true } as any,
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });

  if (mainStore) return mainStore;

  return db.store.findFirst({
    where: { businessId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
}

async function getOwnerDailySummaryMetrics(
  db: PrismaTx,
  business: OwnerSummaryBusiness,
  now: Date,
): Promise<OwnerDailySummaryMetrics> {
  const timeZone = resolveBusinessTimeZone(business.timezone);
  const { dayStart, dayEndExclusive } = getBusinessDayBounds(now, timeZone);
  const scopedStore = await resolveSummaryStore(db, business.id, business.whatsappBranchScope);
  const storeFilter = scopedStore ? { storeId: scopedStore.id } : {};
  const scopeLabel = scopedStore ? `Main branch` : 'All branches';

  const [salesInvoices, paymentsToday, outstandingAr, lowStockCount, voidCount, returnCount, cashVarShifts] =
    await Promise.all([
      db.salesInvoice.findMany({
        where: {
          businessId: business.id,
          ...storeFilter,
          createdAt: { gte: dayStart, lt: dayEndExclusive },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
        select: { totalPence: true, grossMarginPence: true },
      }),
      db.salesPayment.findMany({
        where: {
          receivedAt: { gte: dayStart, lt: dayEndExclusive },
          salesInvoice: {
            businessId: business.id,
            ...storeFilter,
          },
        },
        select: { method: true, amountPence: true },
      }),
      db.salesInvoice.aggregate({
        where: {
          businessId: business.id,
          ...storeFilter,
          paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
        },
        _sum: { totalPence: true },
      }),
      db.inventoryBalance.count({
        where: {
          ...(scopedStore ? { storeId: scopedStore.id } : { store: { businessId: business.id } }),
          qtyOnHandBase: { lte: 0 },
          product: { reorderPointBase: { gt: 0 } },
        },
      }),
      db.salesInvoice.count({
        where: {
          businessId: business.id,
          ...storeFilter,
          createdAt: { gte: dayStart, lt: dayEndExclusive },
          paymentStatus: 'VOID',
        },
      }),
      db.salesReturn.count({
        where: {
          createdAt: { gte: dayStart, lt: dayEndExclusive },
          ...(scopedStore ? { storeId: scopedStore.id } : { store: { businessId: business.id } }),
        },
      }),
      db.shift.findMany({
        where: {
          closedAt: { gte: dayStart, lt: dayEndExclusive },
          variance: { not: null },
          till: scopedStore ? { storeId: scopedStore.id } : { store: { businessId: business.id } },
        },
        select: { variance: true },
      }),
    ]);

  const paymentSplit = paymentsToday.reduce((acc, payment) => {
    acc[payment.method] = (acc[payment.method] ?? 0) + payment.amountPence;
    return acc;
  }, {} as Record<string, number>);

  return {
    dateLabel: formatBusinessDateLabel(now, timeZone),
    scopeLabel,
    totalSalesPence: salesInvoices.reduce((sum, invoice) => sum + invoice.totalPence, 0),
    grossProfitPence: salesInvoices.reduce((sum, invoice) => sum + (invoice.grossMarginPence ?? 0), 0),
    transactionCount: salesInvoices.length,
    cashPence: paymentSplit.CASH ?? 0,
    momoPence: paymentSplit.MOBILE_MONEY ?? 0,
    cardPence: paymentSplit.CARD ?? 0,
    transferPence: paymentSplit.TRANSFER ?? 0,
    outstandingArPence: outstandingAr._sum.totalPence ?? 0,
    lowStockCount,
    voidCount,
    returnCount,
    cashVariancePence: cashVarShifts.reduce((sum, shift) => sum + Math.abs(shift.variance ?? 0), 0),
  };
}

export function buildOwnerDailySummarySms(
  business: Pick<OwnerSummaryBusiness, 'name' | 'currency'>,
  metrics: OwnerDailySummaryMetrics,
) {
  const currency = business.currency;
  const alerts: string[] = [];
  if (metrics.lowStockCount > 0) alerts.push(`${metrics.lowStockCount} low-stock`);
  if (metrics.voidCount > 0) alerts.push(`${metrics.voidCount} voids`);
  if (metrics.returnCount > 0) alerts.push(`${metrics.returnCount} returns`);
  if (metrics.cashVariancePence > 0) alerts.push(`${money(metrics.cashVariancePence, currency)} cash variance`);

  const alertText = alerts.length > 0 ? alerts.join(', ') : 'None';

  return [
    `TillFlow daily summary for ${business.name} (${metrics.dateLabel}, ${metrics.scopeLabel}).`,
    `Sales ${money(metrics.totalSalesPence, currency)} from ${metrics.transactionCount} txns.`,
    `Gross profit ${money(metrics.grossProfitPence, currency)}.`,
    `Cash ${money(metrics.cashPence, currency)}, MoMo ${money(metrics.momoPence, currency)}, card ${money(metrics.cardPence, currency)}, transfer ${money(metrics.transferPence, currency)}.`,
    `Debtors ${money(metrics.outstandingArPence, currency)}. Alerts: ${alertText}.`,
  ].join(' ');
}

export async function enqueueOwnerDailySummarySms(
  businessId: string,
  options: { now?: Date; tx?: PrismaTx } = {},
) {
  const now = options.now ?? new Date();
  const db = options.tx ?? prisma;
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      currency: true,
      phone: true,
      whatsappPhone: true,
      whatsappEnabled: true,
      timezone: true,
      whatsappBranchScope: true,
      isDemo: true,
      subscriptionStatus: true,
    } as any,
  });

  if (!business) return { ok: false as const, reason: 'BUSINESS_NOT_FOUND' as const };
  if ((business as any).isDemo) return { ok: false as const, reason: 'DEMO_BUSINESS' as const };
  if ((business as any).subscriptionStatus === 'CANCELLED') {
    return { ok: false as const, reason: 'CANCELLED' as const };
  }
  if (!(business as any).whatsappEnabled) {
    return { ok: false as const, reason: 'SUMMARY_DISABLED' as const };
  }

  const summaryBusiness = business as unknown as OwnerSummaryBusiness;
  const recipient = resolveOwnerRecipient(summaryBusiness);
  if (!recipient) return { ok: false as const, reason: 'NO_OWNER_PHONE' as const };

  const timeZone = resolveBusinessTimeZone(summaryBusiness.timezone);
  const localDateKey = formatBusinessLocalDateKey(now, timeZone);
  const idempotencyKey = `${businessId}:${OWNER_DAILY_SUMMARY_EVENT_TYPE}:${localDateKey}`;
  const metrics = await getOwnerDailySummaryMetrics(db, summaryBusiness, now);
  const body = buildOwnerDailySummarySms(summaryBusiness, metrics);

  const existing = await db.messageOutbox.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) {
    return { ok: true as const, outboxId: existing.id, deduped: true };
  }

  try {
    const created = await db.messageOutbox.create({
      data: {
        businessId,
        eventType: OWNER_DAILY_SUMMARY_EVENT_TYPE,
        idempotencyKey,
        channel: 'SMS',
        recipient,
        body,
        status: 'PENDING',
        nextAttemptAt: now,
        payloadJson: JSON.stringify({
          source: 'OWNER_DAILY_SUMMARY',
          businessId,
          businessName: business.name,
          localDateKey,
          timeZone,
          metrics,
        }),
      },
      select: { id: true },
    });

    return { ok: true as const, outboxId: created.id, deduped: false };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { ok: true as const, outboxId: null, deduped: true };
    }
    throw error;
  }
}
