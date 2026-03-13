import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { buildEodSummaryPreviewForBusiness } from '@/app/actions/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getUser();
  if (!user || !['MANAGER', 'OWNER'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const whatsappPhone = String(formData.get('whatsappPhone') ?? '').trim() || null;
    const whatsappBranchScope = String(formData.get('whatsappBranchScope') ?? 'ALL').trim() || 'ALL';

    const preview = await buildEodSummaryPreviewForBusiness(user.businessId, {
      phoneOverride: whatsappPhone,
      branchScopeOverride: whatsappBranchScope
    });

    if (!preview.text) {
      return NextResponse.json(
        { error: 'Unable to generate a preview for this business right now.' },
        { status: 400 }
      );
    }

    return NextResponse.json(preview);
  } catch (error) {
    console.error('[notifications.preview] failed:', error);
    return NextResponse.json(
      { error: 'Unable to generate a preview right now.' },
      { status: 500 }
    );
  }
}
