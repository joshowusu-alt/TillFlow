import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { resolveDailySummaryOwnerPhoneFromStored } from '@/lib/notifications/owner-phone';
import {
  formatBusinessDateLabel,
  formatBusinessLocalDateKey,
  getBusinessDayBounds,
  resolveBusinessTimeZone,
} from '@/lib/notifications/utils';
import { evaluateMarginSet, type MarginReturnKind } from '@/lib/reports/margin-line';
import { expectedCashPenceFromEntries } from '@/lib/reports/expected-cash';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';

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

export type OwnerDailySummaryMetrics = {
  dateLabel: string;
  scopeLabel: string;
  totalSalesPence: number;
  grossProfitPence: number | null;
  transactionCount: number;
  cashPence: number;
  momoPence: number;
  cardPence: number;
  transferPence: number;
  outstandingArPence: number;
  lowStockCount: number;
  voidCount: number;
  returnCount: number;
  closedVariancePence: number | null;
  marginState: 'READY' | 'INCOMPLETE_COSTS';
  overdueCustomerPence: number;
  overdueSupplierPence: number;
  openExpectedCashPence: number | null;
  expensesPaidPence: number;
  asOfLocal: string;
  timeZone: string;
};

const GSM7_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const GSM7_EXTENSION = new Set('^{}\\[~]|€');
export const OWNER_SMS_SEPTET_LIMIT = 306;

export function gsm7SeptetCount(text: string): number | null {
  let count = 0;
  for (const char of text) {
    if (GSM7_BASIC.has(char)) count += 1;
    else if (GSM7_EXTENSION.has(char)) count += 2;
    else return null;
  }
  return count;
}

export type OwnerDailySmsInput = {
  asOfLocal: string;
  timeZone: string;
  salesPence: number;
  transactionCount: number;
  receivedPence: number;
  overdueCustomerPence: number;
  overdueSupplierPence: number;
  openExpectedCashPence: number | null;
  closedVariancePence: number | null;
  expensesPaidPence: number;
  marginState: 'READY' | 'INCOMPLETE_COSTS';
  grossProfitPence: number | null;
  methodSplit: { cashPence: number; momoPence: number; cardPence: number; transferPence: number } | null;
  actions: string[];
};

export type OwnerDailySmsResult =
  | { send: true; body: string; septets: number }
  | { send: false; reason: 'NON_GSM7' | 'CORE_TOO_LONG' };

function ghs(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(pence));
  return `GHS ${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function abbreviateSms(text: string): string {
  return text
    .replace(/transactions/g, 'tx')
    .replace(/Confirmed money received/g, 'Received')
    .replace(/Overdue customers/g, 'Cust overdue')
    .replace(/Overdue suppliers/g, 'Sup overdue')
    .replace(/Open expected cash/g, 'Open cash')
    .replace(/Closed variance/g, 'Closed var')
    .replace(/Expenses paid/g, 'Exp paid')
    .replace(/Gross profit/g, 'GP')
    .replace(
      /Based on data received by TillFlow as of (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) ([A-Za-z0-9_/+-]+)\./,
      'As of $1 $2. Data received by TillFlow.',
    );
}

type SmsFit = {
  methods: boolean;
  gp: boolean;
  actionMode: 'full' | 'one' | 'count';
  abbrev: boolean;
  openCash: boolean;
};

function renderOwnerSms(input: OwnerDailySmsInput, fit: SmsFit): string {
  const lines = [
    `Based on data received by TillFlow as of ${input.asOfLocal} ${input.timeZone}.`,
    `Sales ${ghs(input.salesPence)} (${input.transactionCount} transactions)`,
    `Confirmed money received ${ghs(input.receivedPence)}`,
    `Overdue customers ${ghs(input.overdueCustomerPence)}`,
    `Overdue suppliers ${ghs(input.overdueSupplierPence)}`,
  ];
  if (fit.openCash && input.openExpectedCashPence != null) {
    lines.push(`Open expected cash ${ghs(input.openExpectedCashPence)}`);
  }
  if (input.closedVariancePence != null) {
    lines.push(`Closed variance ${ghs(input.closedVariancePence)}`);
  }
  lines.push(`Expenses paid ${ghs(input.expensesPaidPence)}`);
  if (fit.gp && input.marginState === 'READY' && input.grossProfitPence != null) {
    lines.push(`Gross profit ${ghs(input.grossProfitPence)}`);
  } else if (fit.gp && input.marginState === 'INCOMPLETE_COSTS') {
    lines.push('Costs incomplete');
  }
  if (fit.methods && input.methodSplit) {
    const split = input.methodSplit;
    lines.push(`Cash ${ghs(split.cashPence)} MoMo ${ghs(split.momoPence)} card ${ghs(split.cardPence)} transfer ${ghs(split.transferPence)}`);
  }
  const actions = input.actions.slice(0, 3);
  if (fit.actionMode === 'full') {
    for (const action of actions) lines.push(action);
  } else if (fit.actionMode === 'one' && actions[0]) {
    lines.push(actions[0]);
  } else if (actions.length > 0) {
    lines.push(`${actions.length} actions need review`);
  }
  return fit.abbrev ? abbreviateSms(lines.join('\n')) : lines.join('\n');
}

const SMS_FITS: SmsFit[] = [
  { methods: true, gp: true, actionMode: 'full', abbrev: false, openCash: true },
  { methods: false, gp: true, actionMode: 'full', abbrev: false, openCash: true },
  { methods: false, gp: false, actionMode: 'full', abbrev: false, openCash: true },
  { methods: false, gp: false, actionMode: 'one', abbrev: false, openCash: true },
  { methods: false, gp: false, actionMode: 'count', abbrev: false, openCash: true },
  { methods: false, gp: false, actionMode: 'count', abbrev: true, openCash: true },
  { methods: false, gp: false, actionMode: 'count', abbrev: true, openCash: false },
];

export function formatOwnerDailySummarySms(input: OwnerDailySmsInput): OwnerDailySmsResult {
  if (gsm7SeptetCount(renderOwnerSms(input, SMS_FITS[0])) == null) {
    return { send: false, reason: 'NON_GSM7' };
  }
  for (const fit of SMS_FITS) {
    const body = renderOwnerSms(input, fit);
    const septets = gsm7SeptetCount(body);
    if (septets != null && septets <= OWNER_SMS_SEPTET_LIMIT) {
      return { send: true, body, septets };
    }
  }
  return { send: false, reason: 'CORE_TOO_LONG' };
}

function resolveOwnerRecipient(business: Pick<OwnerSummaryBusiness, 'phone' | 'whatsappPhone'>) {
  return (
    resolveDailySummaryOwnerPhoneFromStored(business.whatsappPhone) ??
    resolveDailySummaryOwnerPhoneFromStored(business.phone)
  );
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

export async function getOwnerDailySummaryMetrics(
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
        select: {
          paymentStatus: true,
          discountPence: true,
          totalPence: true,
          salesReturn: { select: { type: true } },
          lines: {
            select: {
              lineSubtotalPence: true,
              lineDiscountPence: true,
              promoDiscountPence: true,
              lineCostPence: true,
              qtyBase: true,
              product: { select: { defaultCostBasePence: true } },
            },
          },
        },
      }),
      db.salesPayment.findMany({
        where: {
          receivedAt: { gte: dayStart, lt: dayEndExclusive },
          status: 'CONFIRMED',
          salesInvoice: {
            businessId: business.id,
            ...storeFilter,
          },
        },
        select: { method: true, amountPence: true },
      }),
      db.salesInvoice.findMany({
        where: {
          businessId: business.id,
          ...storeFilter,
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
        select: {
          paymentStatus: true,
          totalPence: true,
          payments: { select: { amountPence: true, status: true } },
        },
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
          till: scopedStore ? { storeId: scopedStore.id } : { store: { businessId: business.id } },
        },
        select: { variance: true },
      }),
    ]);

  const paymentSplit = paymentsToday.reduce((acc, payment) => {
    acc[payment.method] = (acc[payment.method] ?? 0) + payment.amountPence;
    return acc;
  }, {} as Record<string, number>);

  const margin = evaluateMarginSet(salesInvoices.map((invoice) => {
    let returnKind: MarginReturnKind = 'NONE';
    if (invoice.salesReturn?.type === 'VOID' && invoice.paymentStatus === 'VOID') returnKind = 'FULL_VOID';
    else if (invoice.salesReturn?.type === 'RETURN' && invoice.paymentStatus === 'RETURNED') returnKind = 'FULL_RETURN';
    else if (invoice.salesReturn) returnKind = 'BACKUP_OR_REPLAY';
    return {
      paymentStatus: invoice.paymentStatus,
      discountPence: invoice.discountPence,
      returnKind,
      lines: invoice.lines.map((line) => ({
        lineSubtotalPence: line.lineSubtotalPence,
        lineDiscountPence: line.lineDiscountPence,
        promoDiscountPence: line.promoDiscountPence,
        lineCostPence: line.lineCostPence,
        qtyBase: line.qtyBase,
        defaultCostBasePence: line.product.defaultCostBasePence,
      })),
    };
  }));

  const [overdueCustomers, overdueSuppliers, expensePayments, openShifts] = await Promise.all([
    db.salesInvoice.findMany({
      where: {
        businessId: business.id,
        ...storeFilter,
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        dueDate: { lt: dayStart },
      },
      select: {
        paymentStatus: true,
        totalPence: true,
        payments: { select: { amountPence: true, status: true } },
      },
    }),
    db.purchaseInvoice.findMany({
      where: {
        businessId: business.id,
        ...storeFilter,
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        dueDate: { lt: dayStart },
      },
      select: {
        paymentStatus: true,
        totalPence: true,
        payments: { select: { amountPence: true } },
      },
    }),
    db.expensePayment.aggregate({
      where: {
        businessId: business.id,
        ...storeFilter,
        paidAt: { gte: dayStart, lt: dayEndExclusive },
      },
      _sum: { amountPence: true },
    }),
    db.shift.findMany({
      where: {
        status: 'OPEN',
        till: scopedStore ? { storeId: scopedStore.id } : { store: { businessId: business.id } },
      },
      select: {
        cashDrawerEntries: { select: { entryType: true, amountPence: true } },
      },
    }),
  ]);

  const asOfParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => asOfParts.find((item) => item.type === type)?.value ?? '00';
  const hour = part('hour') === '24' ? '00' : part('hour');

  return {
    dateLabel: formatBusinessDateLabel(now, timeZone),
    scopeLabel,
    totalSalesPence: salesInvoices.reduce((sum, invoice) => sum + invoice.totalPence, 0),
    grossProfitPence: margin.grossProfitPence,
    transactionCount: salesInvoices.length,
    cashPence: paymentSplit.CASH ?? 0,
    momoPence: paymentSplit.MOBILE_MONEY ?? 0,
    cardPence: paymentSplit.CARD ?? 0,
    transferPence: paymentSplit.TRANSFER ?? 0,
    outstandingArPence: outstandingAr.reduce(
      (sum, invoice) => sum + receivableDocumentBalance(invoice).balancePence,
      0,
    ),
    lowStockCount,
    voidCount,
    returnCount,
    closedVariancePence: cashVarShifts.length === 0
      ? null
      : cashVarShifts.reduce((sum, shift) => sum + (shift.variance ?? 0), 0),
    marginState: margin.state,
    overdueCustomerPence: overdueCustomers.reduce(
      (sum, invoice) => sum + receivableDocumentBalance(invoice).balancePence,
      0,
    ),
    overdueSupplierPence: overdueSuppliers.reduce(
      (sum, invoice) => sum + payableDocumentBalance(invoice).balancePence,
      0,
    ),
    openExpectedCashPence: openShifts.length === 0
      ? null
      : openShifts.reduce(
        (sum, shift) => sum + expectedCashPenceFromEntries(shift.cashDrawerEntries),
        0,
      ),
    expensesPaidPence: expensePayments._sum.amountPence ?? 0,
    asOfLocal: `${part('year')}-${part('month')}-${part('day')} ${hour}:${part('minute')}`,
    timeZone,
  };
}

export function buildOwnerDailySummarySms(metrics: OwnerDailySummaryMetrics): OwnerDailySmsResult {
  const actions: string[] = [];
  if (metrics.lowStockCount > 0) actions.push(`${metrics.lowStockCount} low-stock`);
  if (metrics.voidCount > 0) actions.push(`${metrics.voidCount} voids`);
  if (metrics.returnCount > 0) actions.push(`${metrics.returnCount} returns`);

  return formatOwnerDailySummarySms({
    asOfLocal: metrics.asOfLocal,
    timeZone: metrics.timeZone,
    salesPence: metrics.totalSalesPence,
    transactionCount: metrics.transactionCount,
    receivedPence: metrics.cashPence + metrics.momoPence + metrics.cardPence + metrics.transferPence,
    overdueCustomerPence: metrics.overdueCustomerPence,
    overdueSupplierPence: metrics.overdueSupplierPence,
    openExpectedCashPence: metrics.openExpectedCashPence,
    closedVariancePence: metrics.closedVariancePence,
    expensesPaidPence: metrics.expensesPaidPence,
    marginState: metrics.marginState,
    grossProfitPence: metrics.marginState === 'READY' ? metrics.grossProfitPence : null,
    methodSplit: {
      cashPence: metrics.cashPence,
      momoPence: metrics.momoPence,
      cardPence: metrics.cardPence,
      transferPence: metrics.transferPence,
    },
    actions,
  });
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
  const formatted = buildOwnerDailySummarySms(metrics);
  if (!formatted.send) {
    return { ok: false as const, reason: formatted.reason };
  }
  const body = formatted.body;

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
