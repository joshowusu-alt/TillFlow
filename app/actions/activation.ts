'use server';

import { requireBusiness } from '@/lib/auth';
import {
  computeActivationForBusiness,
  persistActivationSnapshot,
} from '@/lib/activation-snapshot';
import type { ActivationReadinessResult } from '@/lib/activation-readiness';
import { prisma } from '@/lib/prisma';

/**
 * Live activation state for the current business (recomputes from DB).
 */
export async function getActivationReadinessForBusiness(): Promise<ActivationReadinessResult | null> {
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);
  return computeActivationForBusiness(business.id);
}

/**
 * Recompute and persist activation snapshot (owner-only).
 */
export async function refreshActivationReadiness(): Promise<ActivationReadinessResult | null> {
  const { business } = await requireBusiness(['OWNER']);
  return persistActivationSnapshot(business.id);
}

export async function recordOwnerDashboardView(): Promise<void> {
  const { business, user } = await requireBusiness(['OWNER']);
  const now = new Date();
  await prisma.business.update({
    where: { id: business.id },
    data: { ownerLastDashboardViewAt: now },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: now },
  });
}

export async function recordOwnerReportView(): Promise<void> {
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);
  await prisma.business.update({
    where: { id: business.id },
    data: { ownerLastReportViewAt: new Date() },
  });
}

export async function acknowledgeTrialBilling(): Promise<void> {
  const { business } = await requireBusiness(['OWNER']);
  await prisma.business.update({
    where: { id: business.id },
    data: { trialAcknowledgedAt: new Date() },
  });
  const { revalidateTag } = await import('next/cache');
  revalidateTag(`readiness-${business.id}`);
}

export async function updateBusinessCategory(category: string): Promise<{ ok: boolean; error?: string }> {
  const { business } = await requireBusiness(['OWNER']);
  const normalized = String(category || '').trim().toUpperCase();
  const allowed = [
    'SUPERMARKET',
    'PROVISION',
    'MINI_MART',
    'PHARMACY',
    'COSMETICS',
    'HARDWARE',
    'WHOLESALE',
    'RESTAURANT_STOCK',
    'OTHER',
  ];
  if (!allowed.includes(normalized)) {
    return { ok: false, error: 'Please choose a business type.' };
  }
  await prisma.business.update({
    where: { id: business.id },
    data: { businessCategory: normalized },
  });
  const { revalidateTag } = await import('next/cache');
  revalidateTag(`readiness-${business.id}`);
  return { ok: true };
}
