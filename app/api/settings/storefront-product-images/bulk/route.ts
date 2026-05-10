import { NextResponse } from 'next/server';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { saveProductImageFile } from '@/lib/services/storage';

const MAX_BULK_IMAGES = 80;

function normalizeMatchKey(value: string | null | undefined) {
  return (value ?? '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value !== 'string' && typeof value.name === 'string' && value.size > 0;
}

function buildProductLookup(products: Array<{ id: string; name: string; barcode: string | null }>) {
  const lookup = new Map<string, { id: string; name: string } | null>();

  for (const product of products) {
    const keys = [
      normalizeMatchKey(product.name),
      normalizeMatchKey(product.barcode),
    ].filter(Boolean);

    for (const key of keys) {
      if (!lookup.has(key)) {
        lookup.set(key, { id: product.id, name: product.name });
      } else {
        lookup.set(key, null);
      }
    }
  }

  return lookup;
}

export async function POST(request: Request) {
  try {
    const { business } = await requireBusiness(['MANAGER', 'OWNER']);
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll('images').filter(isFileLike).slice(0, MAX_BULK_IMAGES);

    if (files.length === 0) {
      return NextResponse.json({ error: 'Choose at least one image file.' }, { status: 400 });
    }

    const products = await prisma.product.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true, barcode: true },
    });
    const lookup = buildProductLookup(products);

    const updated: Array<{ productId: string; productName: string; imageUrl: string; fileName: string }> = [];
    const skipped: Array<{ fileName: string; reason: string }> = [];

    for (const file of files) {
      const fileName = file.name || 'image';
      const matchKey = normalizeMatchKey(fileName);
      const match = lookup.get(matchKey);

      if (!match) {
        skipped.push({
          fileName,
          reason: lookup.has(matchKey)
            ? 'More than one product matched this filename.'
            : 'No product name or barcode matched this filename.',
        });
        continue;
      }

      const result = await saveProductImageFile(file);
      if (!result) {
        skipped.push({ fileName, reason: 'Image file is empty.' });
        continue;
      }
      if (typeof result === 'object' && 'error' in result) {
        skipped.push({ fileName, reason: result.error });
        continue;
      }

      await prisma.product.update({
        where: { id: match.id },
        data: { imageUrl: result },
      });
      updated.push({
        productId: match.id,
        productName: match.name,
        imageUrl: result,
        fileName,
      });
    }

    return NextResponse.json({
      updated,
      skipped,
      processed: files.length,
      limit: MAX_BULK_IMAGES,
    });
  } catch (error) {
    if (isRedirectError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('[storefront-product-images-bulk] failed:', error);
    return NextResponse.json(
      { error: 'Could not upload product images right now.' },
      { status: 500 },
    );
  }
}
