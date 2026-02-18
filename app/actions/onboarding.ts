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
  icon: 'store' | 'box' | 'users' | 'play' | 'receipt' | 'settings';
};

export type ReadinessData = {
  businessName: string;
  currency: string;
  pct: number;
  steps: ReadinessStep[];
  nextStep: ReadinessStep | null;
  hasDemoData: boolean;
  productCount: number;
  staffCount: number;
  saleCount: number;
  onboardingComplete: boolean;
  guidedSetup: boolean;
};

/**
 * Compute the owner's readiness score by checking real data conditions.
 * Returns percentage complete, individual step statuses, and the "next best action".
 */
export async function getReadiness(): Promise<ReadinessData> {
  const { business } = await requireBusiness();

  const [productCount, staffCount, saleCount, hasAddress] = await Promise.all([
    prisma.product.count({ where: { businessId: business.id } }),
    prisma.user.count({ where: { businessId: business.id } }),
    prisma.salesInvoice.count({
      where: { businessId: business.id, qaTag: { not: 'DEMO_DAY' } },
    }),
    Promise.resolve(!!(business.address || business.phone)),
  ]);

  const steps: ReadinessStep[] = [
    {
      key: 'store',
      title: 'Configure your store',
      subtitle: 'Add your address, phone & receipt branding',
      benefit: 'Professional receipts build customer trust',
      estimatedMinutes: 2,
      done: hasAddress,
      href: '/settings',
      icon: 'store',
    },
    {
      key: 'products',
      title: 'Add your products',
      subtitle: productCount > 0 ? `${productCount} products loaded` : 'Import or add your first product',
      benefit: 'Accurate pricing = no more price-tag arguments',
      estimatedMinutes: 5,
      done: productCount >= 3,
      href: '/products',
      icon: 'box',
    },
    {
      key: 'staff',
      title: 'Invite your team',
      subtitle: staffCount > 1 ? `${staffCount - 1} staff member${staffCount > 2 ? 's' : ''} added` : 'Add cashiers & managers with PINs',
      benefit: 'Role-based access keeps cash safe',
      estimatedMinutes: 3,
      done: staffCount > 1,
      href: '/users',
      icon: 'users',
    },
    {
      key: 'demo',
      title: 'Run Demo Day',
      subtitle: business.hasDemoData ? 'Demo transactions generated' : 'See TillFlow with a week of realistic data',
      benefit: 'Explore reports, margins & dashboards risk-free',
      estimatedMinutes: 1,
      done: business.hasDemoData,
      href: '/onboarding#demo',
      icon: 'play',
    },
    {
      key: 'first-sale',
      title: 'Make your first real sale',
      subtitle: saleCount > 0 ? `${saleCount} sale${saleCount > 1 ? 's' : ''} completed` : 'Open the POS and sell to a customer',
      benefit: 'Every sale is tracked, receipted & accounted for',
      estimatedMinutes: 2,
      done: saleCount > 0,
      href: '/pos',
      icon: 'receipt',
    },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const nextStep = steps.find(s => !s.done) ?? null;
  const onboardingComplete = !!business.onboardingCompletedAt || pct === 100;

  return {
    businessName: business.name,
    currency: business.currency,
    pct,
    steps,
    nextStep,
    hasDemoData: business.hasDemoData,
    productCount,
    staffCount,
    saleCount,
    onboardingComplete,
    guidedSetup: business.guidedSetup,
  };
}

/**
 * Mark onboarding as complete (server-side). Called when user dismisses the
 * journey or reaches 100%.
 */
export async function completeOnboarding(): Promise<void> {
  const { business } = await requireBusiness(['OWNER']);
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
  await prisma.business.update({
    where: { id: business.id },
    data: { guidedSetup: enabled },
  });
}
