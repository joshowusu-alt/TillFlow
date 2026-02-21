/**
 * Owner Intelligence Layer — Phase 5
 * Composes health score, priority actions, money pulse, leakage watch, and stock risk
 * into a single owner-focused daily brief.
 *
 * Design: ≤2 DB queries per section, composing from existing pure-logic modules.
 */

import { getTodayKPIs } from './reports/today-kpis';
import { calculateHealthScore } from './reports/health-score';
import { computeBusinessAlerts } from './reports/alerts';
import { getCashflowForecast } from './reports/forecast';
import { prisma } from './prisma';

// ─── Priority Action ─────────────────────────────────────────────────────────

export type ActionSeverity = 'info' | 'warn' | 'critical';

export type PriorityAction = {
  id: string;
  title: string;
  why: string;
  recommendation: string;
  href: string;
  severity: ActionSeverity;
};

// ─── Money Pulse ─────────────────────────────────────────────────────────────

export type MoneyPulse = {
  cashTodayPence: number;
  arDue7DaysPence: number;
  apDue7DaysPence: number;
  forecastLowestPence: number;
  forecastLowestDate: string;
  daysUntilNegative: number | null;
};

// ─── Leakage Watch ───────────────────────────────────────────────────────────

export type LeakageWatch = {
  discountOverrideCount: number;
  negativeMarginProductCount: number;
  cashVariancePence: number;
};

// ─── Stock Risk ──────────────────────────────────────────────────────────────

export type StockRisk = {
  stockoutImminentCount: number;
  urgentReorderCount: number;
  reorderHref: string;
};

// ─── Full Owner Brief ────────────────────────────────────────────────────────

export type OwnerBrief = {
  generatedAt: string;
  currency: string;
  healthScore: {
    score: number;
    grade: 'GREEN' | 'AMBER' | 'RED';
    topDrivers: string[];
    scoreUrl: string;
  };
  priorityActions: PriorityAction[];
  moneyPulse: MoneyPulse;
  leakageWatch: LeakageWatch;
  stockRisk: StockRisk;
};

// ─── Alert → Priority Action adapter ─────────────────────────────────────────

function alertSeverity(s: 'HIGH' | 'MEDIUM' | 'LOW'): ActionSeverity {
  if (s === 'HIGH') return 'critical';
  if (s === 'MEDIUM') return 'warn';
  return 'info';
}

const ALERT_RECOMMENDATIONS: Record<string, string> = {
  MARGIN_FALLING: 'Review your top 10 products and increase selling price or reduce cost.',
  NEGATIVE_MARGIN_ITEMS: 'Open the Margins report, filter by negative GP, and adjust prices today.',
  AR_AGING: 'Contact customers with invoices over 60 days. Offer a payment plan if needed.',
  CASH_VARIANCE_TREND: 'Check shift closing reports for the last 7 days in Risk Monitor.',
  STOCKOUT_IMMINENT: 'Raise a purchase order for the flagged items before end of day.',
  FORECAST_NEGATIVE: 'Accelerate AR collection or delay non-urgent AP to maintain cash buffer.',
  MOMO_PENDING_SPIKE: 'Go to Reconciliation and re-check or recharge failed collections.',
  EXPENSE_SPIKE: 'Compare this week\'s expenses to the 4-week average and identify the anomaly.',
  DISCOUNT_OVERRIDES: 'Review POS discount logs and set approval thresholds if needed.',
};

/**
 * Produce a ranked list of up to 5 priority actions from alerts.
 * Ordering: CRITICAL first, then WARN, then INFO.
 */
export function rankPriorityActions(
  alerts: ReturnType<typeof computeBusinessAlerts>
): PriorityAction[] {
  const order: ActionSeverity[] = ['critical', 'warn', 'info'];
  return alerts
    .map((a) => ({
      id: a.id,
      title: a.title,
      why: a.explanation,
      recommendation: ALERT_RECOMMENDATIONS[a.id] ?? a.cta.label,
      href: a.cta.href,
      severity: alertSeverity(a.severity),
    }))
    .sort((a: PriorityAction, b: PriorityAction) => order.indexOf(a.severity) - order.indexOf(b.severity))
    .slice(0, 5);
}

// ─── AR/AP due in next 7 days ─────────────────────────────────────────────────

async function getArApDue7Days(
  businessId: string,
  storeId?: string
): Promise<{ arPence: number; apPence: number }> {
  const now = new Date();
  const sevenDays = new Date(now);
  sevenDays.setDate(sevenDays.getDate() + 7);

  const storeFilter = storeId ? { storeId } : {};

  const [arRows, apRows] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        businessId,
        ...storeFilter,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
        OR: [
          { dueDate: { lte: sevenDays } },
          { dueDate: null, createdAt: { lte: sevenDays } },
        ],
      },
      select: { totalPence: true, payments: { select: { amountPence: true } } },
    }),
    prisma.purchaseInvoice.findMany({
      where: {
        businessId,
        ...storeFilter,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
        OR: [
          { dueDate: { lte: sevenDays } },
          { dueDate: null, createdAt: { lte: sevenDays } },
        ],
      },
      select: { totalPence: true, payments: { select: { amountPence: true } } },
    }),
  ]);

  const arPence = arRows.reduce((sum, r) => {
    const paid = r.payments.reduce((s, p) => s + p.amountPence, 0);
    return sum + Math.max(0, r.totalPence - paid);
  }, 0);

  const apPence = apRows.reduce((sum, r) => {
    const paid = r.payments.reduce((s, p) => s + p.amountPence, 0);
    return sum + Math.max(0, r.totalPence - paid);
  }, 0);

  return { arPence, apPence };
}

// ─── Main compose function ────────────────────────────────────────────────────

export async function getOwnerBrief(
  businessId: string,
  currency: string,
  storeId?: string
): Promise<OwnerBrief> {
  const [kpis, forecast, arAp] = await Promise.all([
    getTodayKPIs(businessId, storeId),
    getCashflowForecast(businessId, 14),
    getArApDue7Days(businessId, storeId),
  ]);

  // Health score
  const health = calculateHealthScore({
    totalSalesPence: kpis.totalSalesPence,
    grossMarginPence: kpis.grossMarginPence,
    targetGpPercent: 20,
    cashOnHandPence: kpis.cashOnHandEstimatePence,
    dailyOperatingExpensesPence: kpis.avgDailyExpensesPence,
    arTotalPence: kpis.outstandingARPence,
    arOver90Pence: kpis.arOver90Pence,
    totalTrackedProducts: kpis.totalTrackedProducts,
    productsAboveReorderPoint: kpis.productsAboveReorderPoint,
    openHighAlerts: kpis.openHighAlerts,
  });

  // Priority actions from alerts
  const alerts = computeBusinessAlerts({
    gpPercent: kpis.gpPercent,
    totalSalesPence: kpis.totalSalesPence,
    arTotalPence: kpis.outstandingARPence,
    arOver60Pence: kpis.arOver60Pence,
    arOver90Pence: kpis.arOver90Pence,
    urgentReorderCount: kpis.urgentReorderCount,
    cashVarianceTotalPence: kpis.cashVarianceTotalPence,
    cashVarianceThresholdPence: 2000,
    thisWeekExpensesPence: kpis.thisWeekExpensesPence,
    fourWeekAvgExpensesPence: kpis.fourWeekAvgExpensesPence,
    forecastNegativeWithin14Days: forecast.summary.daysUntilNegative !== null,
    lowestProjectedBalancePence: forecast.summary.lowestPointPence,
    negativeMarginProductCount: kpis.negativeMarginProductCount,
    momoPendingCount: kpis.momoPendingCount,
    momoPendingThreshold: 5,
    stockoutImminentCount: kpis.stockoutImminentCount,
    discountOverrideCount: kpis.discountOverrideCount,
    discountOverrideThreshold: 10,
  });

  const priorityActions = rankPriorityActions(alerts);

  return {
    generatedAt: new Date().toISOString(),
    currency,
    healthScore: {
      score: health.score,
      grade: health.grade,
      topDrivers: health.topDrivers,
      scoreUrl: '/reports/command-center',
    },
    priorityActions,
    moneyPulse: {
      cashTodayPence: kpis.cashOnHandEstimatePence,
      arDue7DaysPence: arAp.arPence,
      apDue7DaysPence: arAp.apPence,
      forecastLowestPence: forecast.summary.lowestPointPence,
      forecastLowestDate: forecast.summary.lowestPointDate,
      daysUntilNegative: forecast.summary.daysUntilNegative,
    },
    leakageWatch: {
      discountOverrideCount: kpis.discountOverrideCount,
      negativeMarginProductCount: kpis.negativeMarginProductCount,
      cashVariancePence: kpis.cashVarianceTotalPence,
    },
    stockRisk: {
      stockoutImminentCount: kpis.stockoutImminentCount,
      urgentReorderCount: kpis.urgentReorderCount,
      reorderHref: '/reports/reorder-suggestions',
    },
  };
}
