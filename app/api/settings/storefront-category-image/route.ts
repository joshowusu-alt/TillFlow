import { NextResponse } from 'next/server';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { saveProductImageFile, validateExternalProductImageUrl } from '@/lib/services/storage';
import { invalidateStorefrontBusinessCache } from '@/lib/services/online-orders';

export async function POST(request: Request) {
  try {
    const { business } = await requireBusiness(['MANAGER', 'OWNER']);
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const categoryId = String(formData.get('categoryId') ?? '').trim();
    const externalImageUrl = String(formData.get('imageUrl') ?? '').trim();

    if (!categoryId) {
      return NextResponse.json({ error: 'Category is required.' }, { status: 400 });
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, businessId: business.id },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json({ error: 'Category not found.' }, { status: 404 });
    }

    const result = externalImageUrl
      ? await validateExternalProductImageUrl(externalImageUrl)
      : await saveProductImageFile(formData.get('imageFile'));

    if (!result) {
      return NextResponse.json({ error: 'Image file or image URL is required.' }, { status: 400 });
    }
    if (typeof result === 'object' && 'error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const updated = await prisma.category.update({
      where: { id: category.id },
      data: { imageUrl: result },
      select: { imageUrl: true },
    });

    const storefront = await prisma.business.findUnique({
      where: { id: business.id },
      select: { storefrontSlug: true },
    });
    await invalidateStorefrontBusinessCache(storefront?.storefrontSlug);

    return NextResponse.json({ imageUrl: updated.imageUrl });
  } catch (error) {
    if (isRedirectError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('[storefront-category-image] failed:', error);
    return NextResponse.json(
      { error: 'Could not save the category image right now.' },
      { status: 500 },
    );
  }
}
