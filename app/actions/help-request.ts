'use server';

import { headers } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
const VALID_TYPES = new Set([
  'LOGIN',
  'PRODUCT_SETUP',
  'IMPORT_STOCK',
  'STOCK_ISSUE',
  'POS_ISSUE',
  'REPORT_ISSUE',
  'BILLING_ISSUE',
  'ONLINE_STOREFRONT',
  'ORDER_MANAGEMENT',
  'TRAINING_NEEDED',
  'BUG',
  'FEATURE_REQUEST',
  'OTHER',
]);

async function syncProfileFromMain(businessId: string) {
  const open = await prisma.controlSupportIssue.count({
    where: {
      businessId,
      status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'] },
    },
  });
  const hasCritical = await prisma.controlSupportIssue.count({
    where: { businessId, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'] }, priority: 'CRITICAL' },
  });
  await prisma.controlBusinessProfile.upsert({
    where: { businessId },
    create: {
      businessId,
      openSupportIssueCount: open,
      supportStatus: open === 0 ? 'HEALTHY' : hasCritical > 0 ? 'AT_RISK' : 'WATCH',
    },
    update: {
      openSupportIssueCount: open,
      supportStatus: open === 0 ? 'HEALTHY' : hasCritical > 0 ? 'AT_RISK' : 'WATCH',
    },
  });
}

export async function submitMerchantHelpRequestAction(
  issueType: string,
  message: string,
  relatedRoute?: string
): Promise<ActionResult<{ issueId: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const trimmed = message.trim();
    if (!trimmed || trimmed.length < 8) {
      return err('Please describe what you need help with (at least a short sentence).');
    }
    const type = VALID_TYPES.has(issueType) ? issueType : 'OTHER';

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, phone: true },
    });
    if (!business) return err('Business not found');

    const headerList = await headers();
    const path =
      relatedRoute?.trim() ||
      headerList.get('x-pathname') ||
      headerList.get('referer') ||
      null;

    const issue = await prisma.controlSupportIssue.create({
      data: {
        businessId,
        createdByMerchantUserId: user.id,
        issueType: type,
        priority: 'NORMAL',
        status: 'OPEN',
        title: trimmed.slice(0, 120),
        description: trimmed,
        source: 'IN_APP',
        relatedRoute: path,
        ownerName: user.name,
        ownerPhone: business.phone,
        nextAction: 'Tish Group to respond on WhatsApp or phone',
      },
    });

    await syncProfileFromMain(businessId);

    revalidateTag(`readiness-${businessId}`);
    revalidateTag('control-support');
    revalidateTag('scale-cockpit');

    return ok({ issueId: issue.id });
  });
}
