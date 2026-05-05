import { NextResponse } from 'next/server';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { saveProductImageFile } from '@/lib/services/storage';

export async function POST(request: Request) {
  try {
    const { business } = await requireBusiness(['MANAGER', 'OWNER']);
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const productId = String(formData.get('productId') ?? '').trim();

    if (!productId) {
      return NextResponse.json({ error: 'Product is required.' }, { status: 400 });
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, businessId: business.id },
      select: { id: true },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    const result = await saveProductImageFile(formData.get('imageFile'));
    if (!result) {
      return NextResponse.json({ error: 'Image file is required.' }, { status: 400 });
    }
    if (typeof result === 'object' && 'error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await prisma.product.update({
      where: { id: productId },
      data: { imageUrl: result },
    });

    return NextResponse.json({ imageUrl: result });
  } catch (error) {
    if (isRedirectError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('[storefront-product-image] failed:', error);
    return NextResponse.json(
      { error: 'Could not upload the product image right now.' },
      { status: 500 },
    );
  }
}
