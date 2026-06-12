import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { buildEodSummaryPreviewForBusiness } from '@/app/actions/notifications';
import { assertDailySummaryFeatureFromSnapshot } from '@/lib/notifications/daily-summary-access';
import { resolveDailySummaryOwnerPhone } from '@/lib/notifications/owner-phone';
import { DEFAULT_BUSINESS_TIMEZONE } from '@/lib/notifications/utils';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getUser();
  if (!user || user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: {
      plan: true,
      mode: true,
      storeMode: true,
    } as any,
  });

  if (!business || !assertDailySummaryFeatureFromSnapshot(business as any)) {
    return NextResponse.json(
      { error: 'Daily Owner Summary is available on Growth and Pro.' },
      { status: 403 },
    );
  }

  try {
    const formData = await request.formData();
    const whatsappPhoneRaw = String(formData.get('whatsappPhone') ?? '').trim();
    const whatsappBranchScope = String(formData.get('whatsappBranchScope') ?? 'ALL').trim() || 'ALL';
    const timezone = String(formData.get('timezone') ?? DEFAULT_BUSINESS_TIMEZONE).trim() || DEFAULT_BUSINESS_TIMEZONE;

    if (whatsappPhoneRaw) {
      const phoneResult = resolveDailySummaryOwnerPhone(whatsappPhoneRaw);
      if (!phoneResult.ok) {
        return NextResponse.json({ error: phoneResult.error }, { status: 400 });
      }
    }

    const preview = await buildEodSummaryPreviewForBusiness(user.businessId, {
      phoneOverride: whatsappPhoneRaw || null,
      branchScopeOverride: whatsappBranchScope,
      timezoneOverride: timezone,
    });

    if (!preview.text) {
      return NextResponse.json(
        { error: 'Unable to generate a preview for this business right now.' },
        { status: 400 },
      );
    }

    return NextResponse.json(preview);
  } catch (error) {
    console.error('[notifications.preview] failed:', error);
    return NextResponse.json(
      { error: 'Unable to generate a preview right now.' },
      { status: 500 },
    );
  }
}
