import { NextRequest, NextResponse } from 'next/server';
import { detectBarcodeFormat } from '@/lib/labels/detect-barcode-format';
import { renderLabelsHtml } from '@/lib/labels/templates';
import type { LabelData, LabelSize } from '@/lib/labels/types';
import { buildZplBatch } from '@/lib/labels/zpl-builder';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const MAX_PRODUCTS_PER_REQUEST = 200;
const LABEL_TEMPLATES = ['SHELF_TAG', 'PRODUCT_STICKER', 'A4_SHEET'] as const satisfies readonly LabelSize[];
const EXPORT_MODES = ['html', 'zpl'] as const;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUID_REGEX = /^c[a-z0-9]{8,}$/i;

type ExportMode = (typeof EXPORT_MODES)[number];

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function isLabelTemplate(value: string | null): value is LabelSize {
  return value !== null && LABEL_TEMPLATES.includes(value as LabelSize);
}

function isExportMode(value: string | null): value is ExportMode {
  return value !== null && EXPORT_MODES.includes(value as ExportMode);
}

function isValidProductId(value: string): boolean {
  return UUID_REGEX.test(value) || CUID_REGEX.test(value);
}

function parseCsvList(value: string | null, fieldName: string): string[] | null {
  if (!value) {
    return null;
  }

  const parts = value.split(',').map((entry) => entry.trim());
  if (parts.length === 0 || parts.some((entry) => entry.length === 0)) {
    throw new Error(`${fieldName} must be a comma-separated list without empty values.`);
  }

  return parts;
}

function parseQuantities(value: string | null, expectedLength: number): number[] {
  if (!value) {
    return Array.from({ length: expectedLength }, () => 1);
  }

  const parts = parseCsvList(value, 'quantities');
  if (!parts || parts.length !== expectedLength) {
    throw new Error('quantities must match the number of productIds.');
  }

  return parts.map((entry) => {
    const quantity = Number(entry);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('quantities must contain positive integers only.');
    }

    return quantity;
  });
}

export async function GET(request: NextRequest) {
  const { business } = await requireBusiness();
  const searchParams = request.nextUrl.searchParams;

  try {
    const productIds = parseCsvList(searchParams.get('productIds'), 'productIds');
    if (!productIds || productIds.length === 0) {
      return badRequest('productIds is required.');
    }

    if (productIds.length > MAX_PRODUCTS_PER_REQUEST) {
      return badRequest(`A maximum of ${MAX_PRODUCTS_PER_REQUEST} products can be exported at once.`);
    }

    if (productIds.some((productId) => !isValidProductId(productId))) {
      return badRequest('productIds must contain valid UUID or cuid values only.');
    }

    const templateParam = searchParams.get('template');
    if (!isLabelTemplate(templateParam)) {
      return badRequest('template must be one of SHELF_TAG, PRODUCT_STICKER, or A4_SHEET.');
    }

    const modeParam = searchParams.get('mode') ?? 'html';
    if (!isExportMode(modeParam)) {
      return badRequest('mode must be either html or zpl.');
    }

    const quantities = parseQuantities(searchParams.get('quantities'), productIds.length);
    const uniqueProductIds = [...new Set(productIds)];
    const products = await prisma.product.findMany({
      where: {
        businessId: business.id,
        id: { in: uniqueProductIds },
      },
      select: {
        id: true,
        name: true,
        barcode: true,
        sku: true,
        sellingPriceBasePence: true,
        category: {
          select: {
            name: true,
          },
        },
        productUnits: {
          where: { isBaseUnit: true },
          take: 1,
          select: {
            unit: {
              select: {
                name: true,
                symbol: true,
              },
            },
          },
        },
      },
    });

    if (products.length !== uniqueProductIds.length) {
      return badRequest('One or more products were not found for the active business.');
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const date = new Date().toISOString().slice(0, 10);
    const currency = business.currency?.trim() || 'GHS';

    const items: Array<{ data: LabelData; quantity: number }> = productIds.map((productId, index) => {
      const product = productMap.get(productId);
      if (!product) {
        throw new Error('One or more requested products could not be loaded.');
      }

      const barcode = product.barcode?.trim() || undefined;
      const baseUnit = product.productUnits[0]?.unit;
      const sellingPrice = product.sellingPriceBasePence / 100;

      return {
        data: {
          productName: product.name,
          price: `${currency} ${sellingPrice.toFixed(2)}`,
          barcode,
          barcodeFormat: detectBarcodeFormat(barcode),
          unit: baseUnit?.symbol ?? baseUnit?.name ?? undefined,
          category: product.category?.name ?? undefined,
          sku: product.sku ?? undefined,
          date,
          currency,
        },
        quantity: quantities[index],
      };
    });

    if (modeParam === 'zpl') {
      const zpl = buildZplBatch(items, templateParam);
      return new NextResponse(zpl, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="labels.zpl"',
          'Cache-Control': 'no-store',
        },
      });
    }

    const html = await renderLabelsHtml(items, templateParam);
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate labels.';
    return badRequest(message);
  }
}
