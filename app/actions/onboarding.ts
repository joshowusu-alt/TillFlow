'use server';

import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { getTodayKPIs } from '@/lib/reports/today-kpis';
import { DEMO_SKUS } from '@/lib/demo-data-constants';
import {
  computeActivationForBusiness,
  loadActivationSnapshot,
  persistActivationSnapshot,
} from '@/lib/activation-snapshot';
import type { ActivationStepKey } from '@/lib/activation-steps';
import type { ActivationStepStatus } from '@/lib/activation-steps';
import {
  getActivationStatusLabel,
  getSetupHelpHref,
  getStepStatusLabel,
  getStuckReasonMessage,
} from '@/lib/activation-display';
import type { ActivationReadinessStatus, ActivationStuckReason } from '@/lib/activation-readiness';

export type ReadinessStep = {
  key: ActivationStepKey | string;
  title: string;
  subtitle: string;
  explanation: string;
  benefit: string;
  estimatedMinutes: number;
  done: boolean;
  status: ActivationStepStatus;
  statusLabel: string;
  href: string;
  helpHref: string;
  icon: 'store' | 'box' | 'inventory' | 'users' | 'play' | 'receipt' | 'settings' | 'payments' | 'purchase' | 'billing' | 'report' | 'complete';
};

export type ReadinessData = {
  businessName: string;
  userName: string;
  currency: string;
  pct: number;
  activationStatus: ActivationReadinessStatus;
  activationStatusLabel: string;
  stuckReason: ActivationStuckReason;
  stuckMessage: string | null;
  ownerMessage: string;
  nextAction: string;
  steps: ReadinessStep[];
  nextStep: ReadinessStep | null;
  businessCategory: string | null;
  hasDemoData: boolean;
  hasSeedData: boolean;
  productCount: number;
  staffCount: number;
  saleCount: number;
  onboardingComplete: boolean;
  onboardingCompletedAt: Date | null;
  guidedSetup: boolean;
  todayRevenuePence: number;
  yesterdayRevenuePence: number;
  todayTransactionCount: number;
  yesterdayTransactionCount: number;
  openIssueCount: number;
  openShiftCount: number;
  openShiftSalesCount: number;
  reorderNeededCount: number;
  overdueSupplierInvoiceCount: number;
  expectedCashPence: number;
  lastShiftClosedAt: string | null;
  lastReceiptId: string | null;
};

const STEP_ICONS: Record<string, ReadinessStep['icon']> = {
  profile: 'store',
  'business-type': 'settings',
  plan: 'billing',
  staff: 'users',
  products: 'box',
  'opening-stock': 'inventory',
  payments: 'payments',
  'first-purchase': 'purchase',
  'first-sale': 'receipt',
  'first-report': 'report',
  'trial-payment': 'billing',
  complete: 'complete',
};

const STEP_ESTIMATED_MINUTES: Record<string, number> = {
  profile: 2,
  'business-type': 1,
  plan: 1,
  staff: 3,
  products: 10,
  'opening-stock': 5,
  payments: 2,
  'first-purchase': 5,
  'first-sale': 2,
  'first-report': 2,
  'trial-payment': 2,
  complete: 1,
};

export async function resolveReadinessExpectedCashPence(input: {
  openShiftExpectedCashPence: number[];
}) {
  if (input.openShiftExpectedCashPence.length > 0) {
    return input.openShiftExpectedCashPence.reduce((sum, value) => sum + value, 0);
  }

  // Expected cash is a live drawer balance. Closed shifts and accounting
  // balances are historical/financial figures, not cash currently in an open till.
  return 0;
}

/**
 * Owner setup guide — single source: activation readiness engine.
 */
export async function getReadiness(): Promise<ReadinessData> {
  const { user, business } = await requireBusiness(['OWNER']);
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayEnd = new Date(todayStart.getTime() - 1);

  const helpHref = getSetupHelpHref();

  const [
    activation,
    todayKpis,
    yesterdaySalesAgg,
    openShifts,
    overdueSupplierInvoiceCount,
    lastClosedShift,
    lastReceipt,
    seedProductCount,
    snapshot,
  ] = await Promise.all([
    computeActivationForBusiness(business.id, now),
    getTodayKPIs(business.id).catch(() => null),
    prisma.salesInvoice.aggregate({
      where: {
        businessId: business.id,
        createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
      },
      _sum: { totalPence: true },
      _count: { id: true },
    }),
    prisma.shift.findMany({
      where: {
        status: 'OPEN',
        closedAt: null,
        till: { store: { businessId: business.id } },
      },
      select: {
        id: true,
        expectedCashPence: true,
        _count: {
          select: {
            salesInvoices: {
              where: {
                paymentStatus: { notIn: ['RETURNED', 'VOID'] },
                OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
              },
            },
          },
        },
      },
    }),
    prisma.purchaseInvoice.count({
      where: {
        businessId: business.id,
        paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
        dueDate: { lt: todayStart },
      },
    }),
    prisma.shift.findFirst({
      where: {
        till: { store: { businessId: business.id } },
        closedAt: { not: null },
      },
      orderBy: { closedAt: 'desc' },
      select: { closedAt: true },
    }),
    prisma.salesInvoice.findFirst({
      where: {
        businessId: business.id,
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
    prisma.product.count({ where: { businessId: business.id, sku: { in: DEMO_SKUS } } }),
    loadActivationSnapshot(business.id, now),
  ]);

  if (!activation || !snapshot) {
    throw new Error('Unable to load setup progress');
  }

  // Sync DB + Control profile so banner, onboarding %, and Scale Cockpit match.
  const synced = await persistActivationSnapshot(business.id, now);
  const setupProgressPercent = synced?.setupProgressPercent ?? activation.setupProgressPercent;

  const steps: ReadinessStep[] = activation.steps
    .filter((step) => step.key !== 'complete')
    .map((step) => {
      const status = step.status;
      const statusLabel = getStepStatusLabel(status);
      let subtitle = step.explanation;
      if (step.key === 'products' && snapshot.productCount > 0) {
        subtitle =
          snapshot.productCount >= 10
            ? `${snapshot.productCount} products ready`
            : `${snapshot.productCount} added — add more of what you sell daily`;
      } else if (step.key === 'staff' && snapshot.staffCount > 1) {
        subtitle = `${snapshot.staffCount - 1} staff added`;
      } else if (step.key === 'first-sale' && snapshot.saleCount > 0) {
        subtitle = `${snapshot.saleCount} sale${snapshot.saleCount > 1 ? 's' : ''} recorded`;
      }

      return {
        key: step.key,
        title: step.title,
        subtitle,
        explanation: step.explanation,
        benefit: step.explanation,
        estimatedMinutes: STEP_ESTIMATED_MINUTES[step.key] ?? 3,
        done: step.done,
        status,
        statusLabel,
        href: step.href,
        helpHref,
        icon: STEP_ICONS[step.key] ?? 'settings',
      };
    });

  const completeStep = activation.steps.find((s) => s.key === 'complete');
  if (completeStep) {
    steps.push({
      key: 'complete',
      title: completeStep.title,
      subtitle: completeStep.explanation,
      explanation: completeStep.explanation,
      benefit: completeStep.explanation,
      estimatedMinutes: 1,
      done: completeStep.done,
      status: completeStep.status,
      statusLabel: getStepStatusLabel(completeStep.status),
      href: completeStep.href,
      helpHref,
      icon: 'complete',
    });
  }

  const nextStepRaw = activation.nextStep;
  const nextStep: ReadinessStep | null = nextStepRaw
    ? steps.find((s) => s.key === nextStepRaw.key) ?? {
        key: nextStepRaw.key,
        title: nextStepRaw.title,
        subtitle: nextStepRaw.explanation,
        explanation: nextStepRaw.explanation,
        benefit: nextStepRaw.explanation,
        estimatedMinutes: STEP_ESTIMATED_MINUTES[nextStepRaw.key] ?? 3,
        done: nextStepRaw.done,
        status: nextStepRaw.status,
        statusLabel: getStepStatusLabel(nextStepRaw.status),
        href: nextStepRaw.href,
        helpHref,
        icon: STEP_ICONS[nextStepRaw.key] ?? 'settings',
      }
    : null;

  const pct = setupProgressPercent;
  const onboardingComplete =
    !!business.onboardingCompletedAt || (pct === 100 && activation.completedSteps.length >= 11);

  const openIssueCount = todayKpis
    ? [
        todayKpis.stockoutImminentCount > 0,
        todayKpis.urgentReorderCount > 0,
        todayKpis.arOver60Pence > 0,
        todayKpis.outstandingAPPence > 0,
        todayKpis.cashVarianceTotalPence > 0,
        todayKpis.momoPendingCount > 0,
        todayKpis.negativeMarginProductCount > 0,
        todayKpis.discountOverrideCount > 0,
        todayKpis.openHighAlerts > 0,
      ].filter(Boolean).length
    : 0;

  const expectedCashPence = await resolveReadinessExpectedCashPence({
    openShiftExpectedCashPence: openShifts.map((shift) => shift.expectedCashPence),
  });

  const stuckMessage = getStuckReasonMessage(activation.stuckReason);

  return {
    businessName: business.name,
    userName: user.name,
    currency: business.currency,
    pct,
    activationStatus: activation.activationStatus,
    activationStatusLabel: getActivationStatusLabel(activation.activationStatus),
    stuckReason: activation.stuckReason,
    stuckMessage,
    ownerMessage: activation.ownerMessage,
    nextAction: activation.nextAction,
    steps,
    nextStep,
    businessCategory: (business as { businessCategory?: string | null }).businessCategory ?? null,
    hasDemoData: business.hasDemoData,
    hasSeedData: seedProductCount > 0,
    productCount: snapshot.productCount,
    staffCount: snapshot.staffCount,
    saleCount: snapshot.saleCount,
    onboardingComplete,
    onboardingCompletedAt: business.onboardingCompletedAt ?? null,
    guidedSetup: business.guidedSetup,
    todayRevenuePence: todayKpis?.totalSalesPence ?? 0,
    yesterdayRevenuePence: yesterdaySalesAgg._sum.totalPence ?? 0,
    todayTransactionCount: todayKpis?.txCount ?? 0,
    yesterdayTransactionCount: yesterdaySalesAgg._count.id,
    openIssueCount,
    openShiftCount: openShifts.length,
    openShiftSalesCount: openShifts.reduce((sum, shift) => sum + shift._count.salesInvoices, 0),
    reorderNeededCount: todayKpis?.urgentReorderCount ?? 0,
    overdueSupplierInvoiceCount,
    expectedCashPence,
    lastShiftClosedAt: lastClosedShift?.closedAt?.toISOString() ?? null,
    lastReceiptId: lastReceipt?.id ?? null,
  };
}

export async function completeOnboarding(): Promise<void> {
  const { business } = await requireBusiness(['OWNER']);
  if (!(business as any).billingCanWrite) return;
  if (!business.onboardingCompletedAt) {
    await prisma.business.update({
      where: { id: business.id },
      data: { onboardingCompletedAt: new Date() },
    });
    revalidateTag(`readiness-${business.id}`);
    revalidateTag('control-portfolio');
  }
}

export async function toggleGuidedSetup(enabled: boolean): Promise<void> {
  const { business } = await requireBusiness(['OWNER']);
  if (!(business as any).billingCanWrite) return;
  await prisma.business.update({
    where: { id: business.id },
    data: { guidedSetup: enabled },
  });
}
