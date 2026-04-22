'use server';

import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';

export type ReadinessStep = {
  key: string;
  title: string;
  subtitle: string;
  benefit: string;
  estimatedMinutes: number;
  done: boolean;
  href: string;
  /** Icon name — mapped in the UI */
  icon: 'store' | 'box' | 'inventory' | 'users' | 'play' | 'receipt' | 'settings';
};

export type ReadinessData = {
  businessName: string;
  userName: string;
  currency: string;
  pct: number;
  steps: ReadinessStep[];
  nextStep: ReadinessStep | null;
  hasDemoData: boolean;
  productCount: number;
  staffCount: number;
  saleCount: number;
  onboardingComplete: boolean;
  onboardingCompletedAt: Date | null;
  guidedSetup: boolean;
};

const OPTIONAL_READINESS_STEP_KEYS = new Set(['demo']);

function getRequiredReadinessSteps(steps: ReadinessStep[]) {
  return steps.filter((step) => !OPTIONAL_READINESS_STEP_KEYS.has(step.key));
}

function getReadinessPct(steps: ReadinessStep[]) {
  const requiredSteps = getRequiredReadinessSteps(steps);
  if (requiredSteps.length === 0) return 100;

  const doneCount = requiredSteps.filter((step) => step.done).length;
  return Math.round((doneCount / requiredSteps.length) * 100);
}

function getNextRequiredReadinessStep(steps: ReadinessStep[]) {
  return getRequiredReadinessSteps(steps).find((step) => !step.done) ?? null;
}

/**
 * Compute the owner's readiness score by checking real data conditions.
 * Returns percentage complete, individual step statuses, and the "next best action".
 */
export async function getReadiness(): Promise<ReadinessData> {
  const { user, business } = await requireBusiness();

  const [productCount, staffCount, saleCount, hasAddress, purchaseCount] = await Promise.all([
    prisma.product.count({ where: { businessId: business.id } }),
    prisma.user.count({ where: { businessId: business.id } }),
    prisma.salesInvoice.count({
      where: {
        businessId: business.id,
        OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
      },
    }),
    Promise.resolve(!!(business.address || business.phone)),
    prisma.purchaseInvoice.count({ where: { businessId: business.id } }),
  ]);

  const steps: ReadinessStep[] = [
    {
      key: 'store',
      title: 'Confirm business details',
      subtitle: 'Add your phone, address, and receipt details',
      benefit: 'Receipts and reports carry your business identity from the very first transaction',
      estimatedMinutes: 2,
      done: hasAddress,
      href: '/settings',
      icon: 'store',
    },
    {
      key: 'products',
      title: 'Load your first products',
      subtitle: productCount >= 3 ? `${productCount} products ready for sale` : productCount > 0 ? `${productCount} added — load at least 3 core items to complete this step` : 'Start with your fastest-moving products first',
      benefit: 'Accurate prices and barcodes mean faster checkouts and reliable margin tracking from day one',
      estimatedMinutes: 5,
      done: productCount >= 3,
      href: '/products',
      icon: 'box',
    },
    {
      key: 'opening-stock',
      title: 'Record opening stock & cash',
      subtitle:
        (business as any).openingCapitalPence > 0 || purchaseCount > 0
          ? 'Opening balances or first stock receipt recorded'
          : 'Record what is already on the shelf and in the drawer',
      benefit: 'Stock counts, cash position, and gross profit all start from the correct baseline',
      estimatedMinutes: 5,
      done: ((business as any).openingCapitalPence ?? 0) > 0 || purchaseCount > 0,
      href: '/setup/opening-stock',
      icon: 'inventory' as const,
    },
    {
      key: 'staff',
      title: 'Invite your team',
      subtitle: staffCount > 1 ? `${staffCount - 1} staff member${staffCount > 2 ? 's' : ''} added` : 'Add cashiers and managers when you are ready',
      benefit: 'Access controls protect cash, stock approvals, and discount overrides across every shift',
      estimatedMinutes: 3,
      done: staffCount > 1,
      href: '/users',
      icon: 'users',
    },
    {
      key: 'demo',
      title: 'Run Demo Day',
      subtitle: business.hasDemoData ? 'Sample trading data loaded' : 'Preview reports and dashboards with realistic sample activity',
      benefit: 'Explore every report, chart, and workflow before any customer walks through the door',
      estimatedMinutes: 1,
      done: business.hasDemoData,
      href: '/onboarding#demo',
      icon: 'play',
    },
    {
      key: 'first-sale',
      title: 'Make your first real sale',
      subtitle: saleCount > 0 ? `${saleCount} sale${saleCount > 1 ? 's' : ''} recorded` : 'Open the POS and complete one real checkout',
      benefit: 'Stock, cash flow, and trading reports all update in real time from the first checkout',
      estimatedMinutes: 2,
      done: saleCount > 0,
      href: '/pos',
      icon: 'receipt',
    },
  ];

  const pct = getReadinessPct(steps);
  const nextStep = getNextRequiredReadinessStep(steps);
  const onboardingComplete = !!business.onboardingCompletedAt || pct === 100;

  return {
    businessName: business.name,
    userName: user.name,
    currency: business.currency,
    pct,
    steps,
    nextStep,
    hasDemoData: business.hasDemoData,
    productCount,
    staffCount,
    saleCount,
    onboardingComplete,
    onboardingCompletedAt: business.onboardingCompletedAt ?? null,
    guidedSetup: business.guidedSetup,
  };
}

/**
 * Mark onboarding as complete (server-side). Called when user dismisses the
 * journey or reaches 100%.
 */
export async function completeOnboarding(): Promise<void> {
  const { business } = await requireBusiness(['OWNER']);
  if (!(business as any).billingCanWrite) return;
  if (!business.onboardingCompletedAt) {
    await prisma.business.update({
      where: { id: business.id },
      data: { onboardingCompletedAt: new Date() },
    });
  }
}

/**
 * Toggle the guided setup preference for the business owner.
 * Stored in DB so it persists across devices.
 */
export async function toggleGuidedSetup(enabled: boolean): Promise<void> {
  const { business } = await requireBusiness(['OWNER']);
  if (!(business as any).billingCanWrite) return;
  await prisma.business.update({
    where: { id: business.id },
    data: { guidedSetup: enabled },
  });
}
