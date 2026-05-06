import { NextResponse } from 'next/server';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { revalidatePath } from 'next/cache';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { saveBusinessBrandImageFile, type BusinessBrandImageKind } from '@/lib/services/storage';
import { invalidateStorefrontBusinessCache } from '@/lib/services/online-orders';

const ASSET_FIELD_MAP = {
  PRIMARY: 'logoUrl',
  COMPACT: 'brandCompactLogoUrl',
  SQUARE: 'brandSquareLogoUrl',
} as const;

type AssetKey = keyof typeof ASSET_FIELD_MAP;

function normalizeAssetKey(rawValue: string | null | undefined): AssetKey | null {
  const value = (rawValue ?? '').trim().toUpperCase();
  return value in ASSET_FIELD_MAP ? (value as AssetKey) : null;
}

function assetKeyToStorageKind(assetKey: AssetKey): BusinessBrandImageKind {
  switch (assetKey) {
    case 'COMPACT':
      return 'compact';
    case 'SQUARE':
      return 'square';
    case 'PRIMARY':
    default:
      return 'primary';
  }
}

function revalidateAffected(storefrontSlug: string | null) {
  revalidatePath('/settings/organization');
  revalidatePath('/settings/receipt-design');
  revalidatePath('/settings/online-store');
  if (storefrontSlug) {
    revalidatePath(`/shop/${storefrontSlug}`);
  }
}

export async function POST(request: Request) {
  try {
    const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const assetKey = normalizeAssetKey(String(formData.get('assetKey') ?? ''));
    if (!assetKey) {
      return NextResponse.json({ error: 'Unknown brand asset.' }, { status: 400 });
    }

    const result = await saveBusinessBrandImageFile(formData.get('logoFile'), assetKeyToStorageKind(assetKey));
    if (!result) {
      return NextResponse.json({ error: 'Logo file is required.' }, { status: 400 });
    }
    if (typeof result === 'object' && 'error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const field = ASSET_FIELD_MAP[assetKey];
    await prisma.business.update({
      where: { id: business.id },
      data: { [field]: result },
    });
    const storefront = await prisma.business.findUnique({
      where: { id: business.id },
      select: { storefrontSlug: true },
    });
    const storefrontSlug = storefront?.storefrontSlug ?? null;

    audit({
      businessId: business.id,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SETTINGS_UPDATE',
      entity: 'Business',
      entityId: business.id,
      details: {
        source: 'brand-asset-upload',
        field,
        assetKey,
        value: result,
      },
    }).catch((error) => console.error('[audit]', error));

    await invalidateStorefrontBusinessCache(storefrontSlug);
    revalidateAffected(storefrontSlug);
    return NextResponse.json({ logoUrl: result });
  } catch (error) {
    if (isRedirectError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[brand-assets] upload failed:', error);
    return NextResponse.json({ error: 'Could not upload the brand asset right now.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const assetKey = normalizeAssetKey(url.searchParams.get('assetKey'));
    if (!assetKey) {
      return NextResponse.json({ error: 'Unknown brand asset.' }, { status: 400 });
    }

    const field = ASSET_FIELD_MAP[assetKey];
    await prisma.business.update({
      where: { id: business.id },
      data: { [field]: null },
    });
    const storefront = await prisma.business.findUnique({
      where: { id: business.id },
      select: { storefrontSlug: true },
    });
    const storefrontSlug = storefront?.storefrontSlug ?? null;

    audit({
      businessId: business.id,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SETTINGS_UPDATE',
      entity: 'Business',
      entityId: business.id,
      details: {
        source: 'brand-asset-delete',
        field,
        assetKey,
        value: null,
      },
    }).catch((error) => console.error('[audit]', error));

    await invalidateStorefrontBusinessCache(storefrontSlug);
    revalidateAffected(storefrontSlug);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRedirectError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[brand-assets] delete failed:', error);
    return NextResponse.json({ error: 'Could not remove the brand asset right now.' }, { status: 500 });
  }
}
