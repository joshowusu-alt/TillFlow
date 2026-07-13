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
import type { ActivationStepKey, ActivationStepStatus } from '@/lib/activation-steps';
import {
  getActivationStatusLabel,
  getSetupHelpHref,
  getStepStatusLabel,
  getStuckReasonMessage,
} from '@/lib/activation-display';
import type { ActivationReadinessStatus, ActivationStuckReason } from '@/lib/activation-readiness';
import {
  BUSINESS_CATEGORY_LABELS,
  computeOnboardingJourney,
  type OnboardingJourneyResult,
  type OnboardingStageResult,
  type OnboardingUpNext,
  type OptionalImprovement,
} from '@/lib/onboarding-journey';
import { BUSINESS_CATEGORIES } from '@/lib/activation-steps';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

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
  /** Internal sync only — never display as owner progress %. */
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
  businessCategoryLabel: string | null;
  journey: OnboardingJourneyResult;
  stages: OnboardingStageResult[];
  upNext: OnboardingUpNext | null;
  optionalImprovements: OptionalImprovement[];
  hasDemoData: boolean;
  hasSeedData: boolean;
  productCount: number;
  validProductCount: number;
  sellableProductCount: number;
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
  business: 'store',
  products: 'box',
  stock: 'inventory',
  selling: 'play',
  complete: 'complete',
};

const STEP_ESTIMATED_MINUTES: Record<string, number> = {
  business: 2,
  products: 8,
  stock: 5,
  selling: 2,
  complete: 1,
};

export async function resolveReadinessExpectedCashPence(input: {
  openShiftExpectedCashPence: number[];
}) {
  if (input.openShiftExpectedCashPence.length > 0) {
    return input.openShiftExpectedCashPence.reduce((sum, value) => sum + value, 0);
  }
  return 0;
}

/**
 * Owner setup guide — Phase 1 four-stage journey.
 */
export async function getReadiness(): Promise<ReadinessData> {
  const { user, business } = await requireBusiness(['OWNER']);

  return measureServerOperation(
    'page.onboarding.get-readiness',
    async () => {
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

      const synced = await persistActivationSnapshot(business.id, now);
      const setupProgressPercent = synced?.setupProgressPercent ?? activation.setupProgressPercent;

      const journey = computeOnboardingJourney({
        name: snapshot.name,
        businessCategory: snapshot.businessCategory,
        validProductCount: snapshot.validProductCount,
        sellableProductCount: snapshot.sellableProductCount,
        productCount: snapshot.productCount,
        saleCount: snapshot.saleCount,
        onboardingCompletedAt: business.onboardingCompletedAt ?? snapshot.onboardingCompletedAt,
      });

      const steps: ReadinessStep[] = activation.steps
        .filter((step) => step.key !== 'complete')
        .map((step) => ({
          key: step.key,
          title: step.title,
          subtitle: step.explanation,
          explanation: step.explanation,
          benefit: step.explanation,
          estimatedMinutes: STEP_ESTIMATED_MINUTES[step.key] ?? 3,
          done: step.done,
          status: step.status,
          statusLabel: getStepStatusLabel(step.status),
          href: step.href,
          helpHref,
          icon: STEP_ICONS[step.key] ?? 'settings',
        }));

      const nextStepRaw = activation.nextStep;
      const nextStep: ReadinessStep | null = nextStepRaw
        ? steps.find((s) => s.key === nextStepRaw.key) ?? null
        : null;

      const category =
        snapshot.businessCategory ??
        (business as { businessCategory?: string | null }).businessCategory ??
        null;

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

      return {
        businessName: snapshot.name?.trim() ? snapshot.name : business.name,
        userName: user.name,
        currency: business.currency,
        pct: setupProgressPercent,
        activationStatus: activation.activationStatus,
        activationStatusLabel: journey.statusLabel,
        stuckReason: activation.stuckReason,
        stuckMessage: getStuckReasonMessage(activation.stuckReason),
        ownerMessage: journey.upNext?.explanation ?? activation.ownerMessage,
        nextAction: journey.upNext?.title ?? activation.nextAction,
        steps,
        nextStep,
        businessCategory: category,
        businessCategoryLabel: category ? BUSINESS_CATEGORY_LABELS[category] ?? category : null,
        journey,
        stages: journey.stages,
        upNext: journey.upNext,
        optionalImprovements: journey.optionalImprovements,
        hasDemoData: business.hasDemoData,
        hasSeedData: seedProductCount > 0,
        productCount: snapshot.productCount,
        validProductCount: snapshot.validProductCount,
        sellableProductCount: snapshot.sellableProductCount,
        staffCount: snapshot.staffCount,
        saleCount: snapshot.saleCount,
        onboardingComplete: journey.onboardingComplete,
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
    },
    { businessId: business.id, route: '/onboarding', role: 'OWNER' },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
  );
}

/**
 * Phase 1: set onboardingCompletedAt only after a genuine successful sale exists.
 * Preserves existing timestamps — never overwrites.
 */
export async function markOnboardingCompleteAfterFirstSale(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { onboardingCompletedAt: true },
  });
  if (!business || business.onboardingCompletedAt) return;

  const saleCount = await prisma.salesInvoice.count({
    where: {
      businessId,
      paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
    },
  });
  if (saleCount < 1) return;

  await prisma.business.update({
    where: { id: businessId },
    data: { onboardingCompletedAt: new Date() },
  });
  revalidateTag(`readiness-${businessId}`);
  revalidateTag('control-portfolio');
}

/**
 * Compatibility wrapper — does not complete from Skip to POS / Start selling alone.
 * Only marks complete when a genuine sale already exists.
 */
export async function completeOnboarding(): Promise<void> {
  const { business } = await requireBusiness(['OWNER']);
  if (!(business as { billingCanWrite?: boolean }).billingCanWrite) return;
  await markOnboardingCompleteAfterFirstSale(business.id);
}

export async function toggleGuidedSetup(enabled: boolean): Promise<void> {
  const { business } = await requireBusiness(['OWNER']);
  if (!(business as { billingCanWrite?: boolean }).billingCanWrite) return;
  await prisma.business.update({
    where: { id: business.id },
    data: { guidedSetup: enabled },
  });
}

/** Inline onboarding Step 1 — business name (and optional type). */
export async function updateOnboardingBusinessProfile(input: {
  name: string;
  businessCategory?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { business } = await requireBusiness(['OWNER']);
  if (!(business as { billingCanWrite?: boolean }).billingCanWrite) {
    return { ok: false, error: 'Billing is restricted.' };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Business name is required.' };
  if (name.length > 120) return { ok: false, error: 'Business name is too long.' };

  let businessCategory = (business as { businessCategory?: string | null }).businessCategory ?? null;
  if (input.businessCategory !== undefined) {
    const raw = (input.businessCategory ?? '').trim();
    if (raw && !(BUSINESS_CATEGORIES as readonly string[]).includes(raw)) {
      return { ok: false, error: 'Choose a valid business type.' };
    }
    businessCategory = raw || null;
  }

  await prisma.business.update({
    where: { id: business.id },
    data: { name, businessCategory },
  });
  revalidateTag(`readiness-${business.id}`);
  revalidateTag('control-portfolio');
  return { ok: true };
}
