/**
 * Metric sources for the live Today page. Figures use existing calculations.
 *
 * | Label | Meaning | Source | Dates | Stores | Refunds / reversals | Discounts / VAT | Pending | Missing data | Who sees it |
 * | Sales today, count, yesterday, seven dates, last 30 days | Invoice totals | salesInvoice aggregate/find, paymentStatus notIn RETURNED/VOID, sum totalPence | Half-open tenant window inside the decision range | businessId + storeId in authorised ids | Excluded by the status predicate | totalPence already includes header discount and VAT | Not a payment metric | Query failure hides the page. A successful empty sum is zero | Owner and manager when command_center allows |
 * | Money received and payment mix | Confirmed receipts minus completed refunds paid back in the same window | aggregateMoneyReceivedByMethod, then SalesReturn type RETURN with refundAmountPence > 0. In-store refunds use createdAt. An online refund counts only when OnlineOrder.refundStatus is REFUNDED and refundedAt is in the window. MANUAL_REFUND_NEEDED is not deducted. A negative confirmed payment is not deducted again | Same today window for receipts and refunds | branchIds and store id in authorised ids, businessId on the store | A RETURNED sale is not deducted unless a completed refund record exists. VOID refunds are zero | Receipt amount, not the sale total | PENDING, FAILED, CANCELLED and VOID receipts are excluded. Uncompleted refunds are excluded | queryFailed throws. A refund with no method throws. No zero substitute | Same |
 * | Cash difference | Signed variance of accepted closed tills | Shift CLOSED, closedAt in today, actualCashPence >= 0, variance not null | Today, by closedAt | till.storeId in authorised ids and till.store.businessId | Not a sale | Not a sale | Not a payment | No closed till → no figure, not zero. Null variance is skipped | Same. Headline links to /reports/cash-drawer |
 * | Attention rows | Ranked conditions | Open shifts, closed-till variance, PENDING_MANUAL payments, PENDING collections, receivableDocumentBalance, payableDocumentBalance, evaluateMarginLines, inventory reorder | Open tills from before today. Cash is today. Queues and balances are current | Same store predicate | Returned and void documents have a zero balance | Balance uses invoice totalPence | Pending MoMo is an attention row and is not money received | A failed check fails the page. Unknown is not turned into zero. Cash under 500 pence stays off this list | Same. Below-cost and reorder only when that destination is allowed |
 * | Estimated gross profit | Margin when every line cost is authoritative | evaluateMarginSet / evaluateMarginLines | Today | Lines on the sales predicate | Returned and void invoices are removed by the margin evaluator | Header discount is allocated by the existing half-up helper | Not a payment metric | INCOMPLETE_COSTS hides the figure. Starter does not request it | Growth and Pro |
 * | Top products | Stored line totals | lineTotalPence on the sales predicate | Today | product.businessId must match | Lines on returned or void invoices are excluded with the invoice | Line total includes line tax. A header discount is not reallocated onto products | Not a payment metric | A product from another business is dropped | Same |
 *
 * Omitted: command-centre seven-day absolute cash variance, 60/90-day receivable buckets,
 * expenses, cash-on-hand estimate, Balance Sheet, cash-flow statement, cash-flow forecast,
 * and any whole-business fallback.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import type { TodaySnapshot } from '@/lib/reports/today/model';
import { evaluateMarginLines } from '@/lib/reports/margin-line';
import { aggregateMoneyReceivedByMethod, requireMoneyReceivedMethodRows } from '@/lib/reports/money-received/query';
import { resolveMoneyReceivedScope } from '@/lib/reports/money-received/scope-clock';
import { MOMO_CONFIRMATION_STATUS } from '@/lib/reports/momo-confirmation/types';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';
import { receivableDocumentBalance } from '@/lib/reports/receivables-balance';
import { halfOpenTimestampFilter } from '@/lib/reports/reporting-clock';
import { REPORTING_EXCLUDED_SALE_STATUSES, ReportingScopeStoreError } from '@/lib/reports/reporting-scope';
import { isInvalidLegacyClose } from '@/lib/reliability/invalid-preview-shift-closures';
import { applyRefundsToMethods } from '@/lib/reports/today/money-net';
import { creditBuckets, selectAttention } from '@/lib/reports/today/attention';
import { windowInside, type TodayPlan, type TodayWindows } from '@/lib/reports/today/windows';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'Card',
  TRANSFER: 'Bank transfer',
};

export class TodayLoadError extends Error {
  constructor(message = 'Today could not be loaded') {
    super(message);
    this.name = 'TodayLoadError';
  }
}

export type TodayStoreName = { id: string; name: string };

export type TodayLoadInput = {
  businessId: string;
  ownedStoreIds: readonly string[];
  storeIds: readonly string[];
  currency: string;
  timeZone: string;
  plan: TodayPlan;
  windows: TodayWindows;
  showProfit: boolean;
  consolidated: boolean;
  storeNames: readonly TodayStoreName[];
  hrefForShift: string | null;
  hrefForCash: string | null;
  hrefForMomo: string | null;
  hrefForNetwork: string | null;
  hrefForCustomers: string | null;
  hrefForSuppliers: string | null;
  hrefForBelowCost: string | null;
  hrefForLowStock: string | null;
};

export { cashDifferenceLabel, type TodaySnapshot } from '@/lib/reports/today/model';

type Db = PrismaClient | Prisma.TransactionClient;

export function assertTodayStoreScope(storeIds: readonly string[], ownedStoreIds: readonly string[]): string[] {
  if (storeIds.length === 0 || ownedStoreIds.length === 0) {
    throw new ReportingScopeStoreError('Authorised store scope is required');
  }
  const owned = new Set(ownedStoreIds);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const storeId of storeIds) {
    const trimmed = storeId.trim();
    if (!trimmed || seen.has(trimmed) || !owned.has(trimmed)) {
      throw new ReportingScopeStoreError('Authorised store scope is required');
    }
    seen.add(trimmed);
    ids.push(trimmed);
  }
  return ids;
}

function salesWhere(
  businessId: string,
  storeIds: string[],
  window: TodayWindows['today'],
): Prisma.SalesInvoiceWhereInput {
  return {
    businessId,
    storeId: { in: storeIds },
    createdAt: halfOpenTimestampFilter(window),
    paymentStatus: { notIn: [...REPORTING_EXCLUDED_SALE_STATUSES] },
  };
}

function moneyScope(
  input: TodayLoadInput,
  storeIds: string[],
  window: TodayWindows['today'],
) {
  const scope = resolveMoneyReceivedScope({
    businessId: input.businessId,
    currency: input.currency,
    timeZone: input.timeZone,
    periodStart: window.startInclusive,
    periodEndInclusive: window.endExclusive,
    branchIds: storeIds,
    absoluteBounds: true,
  });
  if (scope.branchIds == null || scope.branchIds.length === 0) {
    throw new TodayLoadError();
  }
  return scope;
}

export async function loadToday(db: Db, input: TodayLoadInput): Promise<TodaySnapshot> {
  const storeIds = assertTodayStoreScope(input.storeIds, input.ownedStoreIds);
  const windows = input.windows;
  const queried = [windows.today, windows.yesterday, ...windows.days.map((day) => day.window)];
  if (windows.comparison) queried.push(windows.comparison.last30, windows.comparison.previous30);
  for (const window of queried) {
    if (!windowInside(window, windows.authorised)) throw new TodayLoadError();
  }
  if (input.plan === 'STARTER' && windows.comparison) throw new TodayLoadError();

  let readCount = 8;
  const weekWindow = {
    ...windows.today,
    startInclusive: windows.days[0]?.window.startInclusive ?? windows.today.startInclusive,
  };

  try {
    const weekSales = db.salesInvoice.findMany({
      where: salesWhere(input.businessId, storeIds, weekWindow),
      select: { totalPence: true, createdAt: true, storeId: true },
    });
    const money = aggregateMoneyReceivedByMethod(db, moneyScope(input, storeIds, windows.today));
    const refunds = db.salesReturn.findMany({
      where: {
        type: 'RETURN',
        refundAmountPence: { gt: 0 },
        store: { businessId: input.businessId, id: { in: storeIds } },
        OR: [
          {
            createdAt: halfOpenTimestampFilter(windows.today),
            OR: [
              { salesInvoice: { onlineOrder: { is: null } } },
              { salesInvoice: { onlineOrder: { is: { refundStatus: null } } } },
            ],
          },
          {
            salesInvoice: {
              businessId: input.businessId,
              storeId: { in: storeIds },
              onlineOrder: {
                is: {
                  refundStatus: 'REFUNDED',
                  refundedAt: halfOpenTimestampFilter(windows.today),
                },
              },
            },
          },
        ],
      },
      select: {
        refundAmountPence: true,
        refundMethod: true,
        salesInvoice: {
          select: {
            payments: {
              where: {
                status: 'CONFIRMED',
                receivedAt: halfOpenTimestampFilter(windows.today),
              },
              select: { amountPence: true },
            },
          },
        },
      },
    });
    const last30 = windows.comparison
      ? db.salesInvoice.aggregate({
        where: salesWhere(input.businessId, storeIds, windows.comparison.last30),
        _sum: { totalPence: true },
      })
      : null;
    const previous30 = windows.comparison
      ? db.salesInvoice.aggregate({
        where: salesWhere(input.businessId, storeIds, windows.comparison.previous30),
        _sum: { totalPence: true },
      })
      : null;
    const closedShifts = db.shift.findMany({
      where: {
        status: 'CLOSED',
        closedAt: halfOpenTimestampFilter(windows.today),
        till: { storeId: { in: storeIds }, store: { businessId: input.businessId } },
      },
      select: {
        variance: true,
        actualCashPence: true,
        closedAt: true,
        till: { select: { name: true, store: { select: { id: true, name: true } } } },
      },
    });
    const openShifts = db.shift.findMany({
      where: {
        status: 'OPEN',
        closedAt: null,
        openedAt: { lt: windows.today.startInclusive },
        till: { storeId: { in: storeIds }, store: { businessId: input.businessId } },
      },
      select: {
        openedAt: true,
        till: { select: { name: true, store: { select: { name: true } } } },
      },
    });
    const momo = input.hrefForMomo
      ? db.salesPayment.aggregate({
        where: {
          status: MOMO_CONFIRMATION_STATUS,
          salesInvoice: { businessId: input.businessId, storeId: { in: storeIds } },
        },
        _sum: { amountPence: true },
        _count: { id: true },
      })
      : null;
    const network = input.hrefForNetwork
      ? db.mobileMoneyCollection.count({
        where: { businessId: input.businessId, storeId: { in: storeIds }, status: 'PENDING' },
      })
      : null;
    const customerInvoices = db.salesInvoice.findMany({
      where: {
        businessId: input.businessId,
        storeId: { in: storeIds },
        paymentStatus: { notIn: [...REPORTING_EXCLUDED_SALE_STATUSES] },
      },
      select: {
        paymentStatus: true,
        totalPence: true,
        dueDate: true,
        payments: { select: { amountPence: true, status: true } },
      },
    });
    const supplierInvoices = db.purchaseInvoice.findMany({
      where: {
        businessId: input.businessId,
        storeId: { in: storeIds },
        paymentStatus: { notIn: [...REPORTING_EXCLUDED_SALE_STATUSES] },
      },
      select: {
        paymentStatus: true,
        totalPence: true,
        dueDate: true,
        payments: { select: { amountPence: true } },
      },
    });
    const lines = db.salesInvoiceLine.findMany({
      where: { salesInvoice: salesWhere(input.businessId, storeIds, windows.today) },
      select: {
        productId: true,
        lineTotalPence: true,
        lineSubtotalPence: true,
        lineDiscountPence: true,
        promoDiscountPence: true,
        lineCostPence: true,
        qtyBase: true,
        qtyInUnit: true,
        product: { select: { name: true, businessId: true } },
        salesInvoice: { select: { id: true, paymentStatus: true, discountPence: true } },
      },
    });
    const lowStock = input.hrefForLowStock
      ? db.inventoryBalance.findMany({
        where: {
          storeId: { in: storeIds },
          store: { businessId: input.businessId },
          product: { businessId: input.businessId, active: true, reorderPointBase: { gt: 0 } },
        },
        select: {
          qtyOnHandBase: true,
          product: { select: { name: true, reorderPointBase: true } },
        },
        orderBy: { qtyOnHandBase: 'asc' },
        take: 20,
      })
      : null;

    readCount += (last30 ? 1 : 0) + (previous30 ? 1 : 0) + (momo ? 1 : 0) + (network ? 1 : 0) + (lowStock ? 1 : 0);

    const [
      weekRows,
      methodRows,
      refundRows,
      last30Row,
      previous30Row,
      closedRows,
      openRows,
      momoRow,
      networkCount,
      customerRows,
      supplierRows,
      lineRows,
      stockRows,
    ] = await Promise.all([
      weekSales,
      money,
      refunds,
      last30,
      previous30,
      closedShifts,
      openShifts,
      momo,
      network,
      customerInvoices,
      supplierInvoices,
      lines,
      lowStock,
    ]);

    const receiptMethods = requireMoneyReceivedMethodRows(methodRows);
    let methods;
    try {
      methods = applyRefundsToMethods(receiptMethods, refundRows.map((refund) => ({
        refundAmountPence: refund.refundAmountPence,
        refundMethod: refund.refundMethod,
        confirmedAmountsPence: refund.salesInvoice.payments.map((payment) => payment.amountPence),
      })));
    } catch {
      throw new TodayLoadError();
    }
    const byDay = new Map<string, { salesPence: number; count: number }>();
    const byStore = new Map<string, number>();
    for (const row of weekRows) {
      if (row.storeId == null || !storeIds.includes(row.storeId)) continue;
      const key = formatBusinessLocalDateKey(row.createdAt, input.timeZone);
      const bucket = byDay.get(key) ?? { salesPence: 0, count: 0 };
      bucket.salesPence += row.totalPence;
      bucket.count += 1;
      byDay.set(key, bucket);
      if (key === windows.todayKey) byStore.set(row.storeId, (byStore.get(row.storeId) ?? 0) + row.totalPence);
    }

    const todayBucket = byDay.get(windows.todayKey) ?? { salesPence: 0, count: 0 };
    const accepted = closedRows.filter((shift) => (
      shift.closedAt
      && shift.variance != null
      && !isInvalidLegacyClose(shift.actualCashPence)
      && storeIds.includes(shift.till.store.id)
    ));
    const cashDifferencePence = accepted.length === 0
      ? null
      : accepted.reduce((sum, shift) => sum + (shift.variance ?? 0), 0);

    const customer = creditBuckets(
      customerRows.map((invoice) => ({
        dueDate: invoice.dueDate,
        balancePence: receivableDocumentBalance(invoice).balancePence,
      })),
      windows.today.startInclusive,
    );
    const supplier = creditBuckets(
      supplierRows.map((invoice) => ({
        dueDate: invoice.dueDate,
        balancePence: payableDocumentBalance(invoice).balancePence,
      })),
      windows.today.startInclusive,
    );

    const productTotals = new Map<string, { name: string; salesPence: number }>();
    const marginInvoices = new Map<string, {
      paymentStatus: string;
      discountPence: number;
      lines: Array<{
        lineSubtotalPence: number;
        lineDiscountPence: number;
        promoDiscountPence: number;
        lineCostPence: number;
        qtyBase: number;
        qtyInUnit: number;
        productId: string;
        name: string;
      }>;
    }>();
    for (const line of lineRows) {
      if (line.product.businessId !== input.businessId) continue;
      const current = productTotals.get(line.productId) ?? { name: line.product.name, salesPence: 0 };
      current.salesPence += line.lineTotalPence;
      productTotals.set(line.productId, current);
      const invoice = marginInvoices.get(line.salesInvoice.id) ?? {
        paymentStatus: line.salesInvoice.paymentStatus,
        discountPence: line.salesInvoice.discountPence,
        lines: [],
      };
      invoice.lines.push({
        lineSubtotalPence: line.lineSubtotalPence,
        lineDiscountPence: line.lineDiscountPence,
        promoDiscountPence: line.promoDiscountPence,
        lineCostPence: line.lineCostPence,
        qtyBase: line.qtyBase,
        qtyInUnit: line.qtyInUnit,
        productId: line.productId,
        name: line.product.name,
      });
      marginInvoices.set(line.salesInvoice.id, invoice);
    }

    const evaluated = input.showProfit ? evaluateMarginLines([...marginInvoices.values()]) : null;
    const profit = !input.showProfit || !evaluated || evaluated.lines.length === 0
      ? { state: 'omitted' as const, grossProfitPence: null }
      : evaluated.state === 'READY'
        ? {
          state: 'ready' as const,
          grossProfitPence: evaluated.lines.reduce((sum, line) => sum + (line.profitPence ?? 0), 0),
        }
        : { state: 'incomplete' as const, grossProfitPence: null };
    const below = evaluated?.state === 'READY' && input.hrefForBelowCost
      ? evaluated.lines
        .filter((line) => line.ready && line.profitPence != null && line.profitPence < 0 && line.name)
        .sort((a, b) => (a.profitPence ?? 0) - (b.profitPence ?? 0))[0]
      : null;
    const urgent = stockRows?.find((row) => row.qtyOnHandBase <= row.product.reorderPointBase) ?? null;

    const names = new Map(input.storeNames.map((store) => [store.id, store.name]));
    return {
      readCount,
      salesTodayPence: todayBucket.salesPence,
      salesCount: todayBucket.count,
      yesterdayPence: byDay.get(windows.yesterdayKey)?.salesPence ?? 0,
      days: windows.days.map((day) => ({
        key: day.key,
        label: day.label,
        salesPence: byDay.get(day.key)?.salesPence ?? 0,
      })),
      moneyReceivedPence: methods.reduce((sum, row) => sum + row.amountPence, 0),
      methods: methods
        .filter((row) => row.amountPence !== 0)
        .map((row) => ({
          method: row.method,
          label: METHOD_LABELS[row.method] ?? row.method,
          amountPence: row.amountPence,
        })),
      cashDifferencePence,
      comparison: windows.comparison && last30Row && previous30Row
        ? {
          last30Pence: last30Row._sum.totalPence ?? 0,
          previous30Pence: previous30Row._sum.totalPence ?? 0,
        }
        : null,
      branches: input.consolidated
        ? storeIds.map((storeId) => ({
          storeId,
          name: names.get(storeId) ?? 'Branch',
          salesPence: byStore.get(storeId) ?? 0,
        }))
        : null,
      profit,
      topProducts: [...productTotals.values()].sort((a, b) => b.salesPence - a.salesPence).slice(0, 3),
      attention: selectAttention({
        currency: input.currency,
        openTills: input.hrefForShift
          ? openRows.map((shift) => ({
            tillName: shift.till.name,
            storeName: shift.till.store.name,
            openedAt: shift.openedAt,
          }))
          : [],
        closedTills: input.hrefForCash
          ? accepted.flatMap((shift) => (
            shift.closedAt
              ? [{
                tillName: shift.till.name,
                storeName: shift.till.store.name,
                closedAt: shift.closedAt,
                variancePence: shift.variance ?? 0,
              }]
              : []
          ))
          : [],
        momoManual: momoRow
          ? { count: momoRow._count.id, amountPence: momoRow._sum.amountPence ?? 0 }
          : null,
        momoNetworkCount: networkCount,
        customerPastDuePence: input.hrefForCustomers ? customer.pastDuePence : null,
        supplierPastDuePence: input.hrefForSuppliers ? supplier.pastDuePence : null,
        belowCost: below?.name && input.hrefForBelowCost
          ? { productName: below.name, href: input.hrefForBelowCost }
          : null,
        lowStock: urgent && input.hrefForLowStock
          ? { productName: urgent.product.name, href: input.hrefForLowStock }
          : null,
        hrefForShift: input.hrefForShift ?? '',
        hrefForCash: input.hrefForCash ?? '',
        hrefForMomo: input.hrefForMomo ?? '',
        hrefForNetwork: input.hrefForNetwork ?? '',
        hrefForCustomers: input.hrefForCustomers ?? '',
        hrefForSuppliers: input.hrefForSuppliers ?? '',
      }),
    };
  } catch (error) {
    if (error instanceof ReportingScopeStoreError || error instanceof TodayLoadError) throw error;
    throw new TodayLoadError();
  }
}

