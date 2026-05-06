import { NextResponse } from 'next/server';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { revalidatePath } from 'next/cache';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { saveBusinessLogoFile } from '@/lib/services/storage';
import { audit } from '@/lib/audit';

const REVALIDATE_PATHS = [
  '/settings/organization',
  '/settings/online-store',
  '/settings/receipt-design',
];

function revalidateAffected() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

export async function POST(request: Request) {
  try {
    const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const result = await saveBusinessLogoFile(formData.get('logoFile'));
    if (!result) {
      return NextResponse.json({ error: 'Logo file is required.' }, { status: 400 });
    }
    if (typeof result === 'object' && 'error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await prisma.business.update({
      where: { id: business.id },
      data: { logoUrl: result },
    });

    audit({
      businessId: business.id,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SETTINGS_UPDATE',
      entity: 'Business',
      entityId: business.id,
      details: { field: 'logoUrl', value: result },
    }).catch((error) => console.error('[audit]', error));

    revalidateAffected();
    return NextResponse.json({ logoUrl: result });
  } catch (error) {
    if (isRedirectError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[business-logo] upload failed:', error);
    return NextResponse.json(
      { error: 'Could not upload the logo right now.' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.business.update({
      where: { id: business.id },
      data: { logoUrl: null },
    });

    audit({
      businessId: business.id,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SETTINGS_UPDATE',
      entity: 'Business',
      entityId: business.id,
      details: { field: 'logoUrl', value: null },
    }).catch((error) => console.error('[audit]', error));

    revalidateAffected();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRedirectError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[business-logo] delete failed:', error);
    return NextResponse.json(
      { error: 'Could not remove the logo right now.' },
      { status: 500 },
    );
  }
}
