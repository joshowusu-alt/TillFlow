import { prisma } from '@/lib/prisma';

type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export async function createRiskAlert(input: {
  businessId: string;
  storeId?: string | null;
  cashierUserId?: string | null;
  alertType: string;
  severity?: RiskSeverity;
  metricValue?: number | null;
  thresholdValue?: number | null;
  summary: string;
  context?: Record<string, unknown>;
}) {
  return prisma.riskAlert.create({
    data: {
      businessId: input.businessId,
      storeId: input.storeId ?? null,
      cashierUserId: input.cashierUserId ?? null,
      alertType: input.alertType,
      severity: input.severity ?? 'MEDIUM',
      metricValue: input.metricValue ?? null,
      thresholdValue: input.thresholdValue ?? null,
      summary: input.summary,
      contextJson: input.context ? JSON.stringify(input.context) : null,
    },
  });
}

export async function detectVoidFrequencyRisk(input: {
  businessId: string;
  storeId: string;
  cashierUserId: string;
  threshold?: number;
}) {
  const threshold = input.threshold ?? 3;
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const count = await prisma.salesReturn.count({
    where: {
      type: 'VOID',
      storeId: input.storeId,
      userId: input.cashierUserId,
      createdAt: { gte: since },
      salesInvoice: { businessId: input.businessId },
    },
  });

  if (count >= threshold) {
    await createRiskAlert({
      businessId: input.businessId,
      storeId: input.storeId,
      cashierUserId: input.cashierUserId,
      alertType: 'FREQUENT_VOIDS',
      severity: 'HIGH',
      metricValue: count,
      thresholdValue: threshold,
      summary: `Cashier has ${count} voids in the last 7 days`,
      context: { windowDays: 7 },
    });
  }
}

export async function detectExcessiveDiscountRisk(input: {
  businessId: string;
  storeId: string;
  cashierUserId: string;
  salesInvoiceId: string;
  discountPence: number;
  grossSalesPence: number;
  thresholdBps: number;
}) {
  if (input.grossSalesPence <= 0) return;
  const discountBps = Math.round((input.discountPence * 10_000) / input.grossSalesPence);
  if (discountBps <= input.thresholdBps) return;

  await createRiskAlert({
    businessId: input.businessId,
    storeId: input.storeId,
    cashierUserId: input.cashierUserId,
    alertType: 'EXCESSIVE_DISCOUNT',
    severity: 'MEDIUM',
    metricValue: discountBps,
    thresholdValue: input.thresholdBps,
    summary: `Discount override ${discountBps / 100}% exceeded threshold`,
    context: {
      salesInvoiceId: input.salesInvoiceId,
      discountPence: input.discountPence,
      grossSalesPence: input.grossSalesPence,
    },
  });
}

export async function detectNegativeMarginRisk(input: {
  businessId: string;
  storeId: string;
  cashierUserId: string;
  salesInvoiceId: string;
  grossMarginPence: number;
}) {
  if (input.grossMarginPence >= 0) return;

  await createRiskAlert({
    businessId: input.businessId,
    storeId: input.storeId,
    cashierUserId: input.cashierUserId,
    alertType: 'NEGATIVE_MARGIN_SALE',
    severity: 'HIGH',
    metricValue: input.grossMarginPence,
    thresholdValue: 0,
    summary: 'Sale recorded with negative gross margin',
    context: {
      salesInvoiceId: input.salesInvoiceId,
      grossMarginPence: input.grossMarginPence,
    },
  });
}

export async function detectInventoryAdjustmentRisk(input: {
  businessId: string;
  storeId: string;
  cashierUserId: string;
  adjustmentId: string;
  qtyBase: number;
  thresholdQtyBase: number;
}) {
  if (Math.abs(input.qtyBase) <= input.thresholdQtyBase) return;

  await createRiskAlert({
    businessId: input.businessId,
    storeId: input.storeId,
    cashierUserId: input.cashierUserId,
    alertType: 'LARGE_INVENTORY_ADJUSTMENT',
    severity: 'MEDIUM',
    metricValue: Math.abs(input.qtyBase),
    thresholdValue: input.thresholdQtyBase,
    summary: `Inventory adjustment ${input.qtyBase} base units exceeded threshold`,
    context: {
      adjustmentId: input.adjustmentId,
      qtyBase: input.qtyBase,
    },
  });
}

export async function detectCashVarianceRisk(input: {
  businessId: string;
  storeId: string;
  cashierUserId: string;
  shiftId: string;
  variancePence: number;
  thresholdPence: number;
}) {
  const absVariance = Math.abs(input.variancePence);
  const since = new Date();
  since.setDate(since.getDate() - 14);

  const recentVariances = await prisma.shift.count({
    where: {
      id: { not: input.shiftId },
      userId: input.cashierUserId,
      till: { storeId: input.storeId },
      closedAt: { gte: since },
      variance: { not: 0 },
    },
  });

  if (absVariance >= input.thresholdPence || recentVariances >= 2) {
    await createRiskAlert({
      businessId: input.businessId,
      storeId: input.storeId,
      cashierUserId: input.cashierUserId,
      alertType: 'CASH_VARIANCE_FREQUENCY',
      severity: absVariance >= input.thresholdPence ? 'HIGH' : 'MEDIUM',
      metricValue: absVariance,
      thresholdValue: input.thresholdPence,
      summary:
        absVariance >= input.thresholdPence
          ? 'Shift closed with high cash variance'
          : 'Cashier has repeated cash variances',
      context: {
        shiftId: input.shiftId,
        variancePence: input.variancePence,
        recentVarianceCount: recentVariances + 1,
      },
    });
  }
}
