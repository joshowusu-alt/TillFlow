import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveBarcodeScan } from '@/lib/payments/pos-barcode';
import { normalizeBarcodeDigits } from '@/lib/payments/pos-weighed-barcode';
import { buildPosProductIndex } from '@/lib/pos/product-index';
import { posBarcodeWhere } from '@/lib/pos/catalogue-query';
import {
  SELLABLE_PRODUCT_SELECT,
  toSellableProductDto,
  type SellableProductDto,
} from '@/lib/pos/sellable-dto';

export const dynamic = 'force-dynamic';

function weighedPrefixCandidates(code: string): string[] {
  const digits = normalizeBarcodeDigits(code);
  if (digits.length !== 13 || digits[0] !== '2') return [];
  const prefixes: string[] = [];
  for (let len = 12; len >= 4; len--) {
    prefixes.push(digits.slice(0, len));
  }
  return prefixes;
}

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const code = request.nextUrl.searchParams.get('code')?.trim() ?? '';
  const requestedStoreId = request.nextUrl.searchParams.get('storeId');
  if (!code) {
    return NextResponse.json({ kind: 'missing', code: '' });
  }

  let storeId: string | null = null;
  if (requestedStoreId) {
    const store = await prisma.store.findFirst({
      where: { id: requestedStoreId, businessId: user.businessId },
      select: { id: true },
    });
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    storeId = store.id;
  }

  const prefixes = weighedPrefixCandidates(code);
  const rows = await prisma.product.findMany({
    where: prefixes.length
      ? {
          businessId: user.businessId,
          active: true,
          OR: [posBarcodeWhere(user.businessId, code), { barcode: { in: prefixes } }],
        }
      : posBarcodeWhere(user.businessId, code),
    select: SELLABLE_PRODUCT_SELECT,
    take: 32,
  });

  const inventory = storeId
    ? await prisma.inventoryBalance.findMany({
        where: { storeId, productId: { in: rows.map((p) => p.id) } },
        select: { productId: true, qtyOnHandBase: true },
      })
    : [];
  const inventoryMap = new Map(inventory.map((row) => [row.productId, row.qtyOnHandBase]));
  const products: SellableProductDto[] = rows.map((product) =>
    toSellableProductDto(product, inventoryMap.get(product.id) ?? 0)
  );
  const index = buildPosProductIndex(products);
  const resolution = resolveBarcodeScan(code, products, index);

  if (!resolution || resolution.kind === 'missing') {
    return NextResponse.json({ kind: 'missing', code });
  }

  return NextResponse.json({
    ...resolution,
    product: resolution.product,
  });
}
