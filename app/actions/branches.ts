'use server';

import { redirect } from 'next/navigation';
import { formAction } from '@/lib/action-utils';
import { formOptionalString, formString } from '@/lib/form-helpers';
import { withBusinessContext } from '@/lib/action-utils';
import { prisma } from '@/lib/prisma';
import { ensureOrganizationAndBranches } from '@/lib/services/branches';

function createDeviceKey() {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `dev_${uuid.slice(0, 24)}`;
}

export async function syncOrganizationModelAction(): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    if (!business) {
      throw new Error('Business not found.');
    }

    await ensureOrganizationAndBranches({
      businessId: business.id,
      businessName: business.name,
    });

    redirect('/settings/organization');
  }, '/settings/organization');
}

export async function registerDeviceAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const branchId = formString(formData, 'branchId');
    const label = formString(formData, 'label');
    const platform = formOptionalString(formData, 'platform');

    if (!label) {
      throw new Error('Device label is required.');
    }

    const branch = await prisma.branch.findFirst({
      where: { id: branchId, businessId },
      select: { id: true, organizationId: true },
    });
    if (!branch) {
      throw new Error('Branch not found for device registration.');
    }

    await prisma.device.create({
      data: {
        businessId,
        organizationId: branch.organizationId ?? null,
        branchId: branch.id,
        userId: user.id,
        label,
        platform: platform ?? null,
        deviceKey: createDeviceKey(),
      },
    });

    redirect('/settings/organization');
  }, '/settings/organization');
}
