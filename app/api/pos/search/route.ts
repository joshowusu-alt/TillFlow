import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { posSearchWhere } from '@/lib/pos/catalogue-query';
import {
  SELLABLE_PRODUCT_SELECT,
  clampPosSearchTake,
  toSellableProductDto,
} from '@/lib/pos/sellable-dto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const take = clampPosSearchTake(request.nextUrl.searchParams.get('take'));
  const requestedStoreId = request.nextUrl.searchParams.get('storeId');

  if (!q) {
    return NextResponse.json({ products: [], take });
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

  const products = await prisma.product.findMany({
    where: posSearchWhere(user.businessId, q),
    select: SELLABLE_PRODUCT_SELECT,
    orderBy: { name: 'asc' },
    take,
  });

  const inventory = storeId
    ? await prisma.inventoryBalance.findMany({
        where: { storeId, productId: { in: products.map((p) => p.id) } },
        select: { productId: true, qtyOnHandBase: true },
      })
    : [];
  const inventoryMap = new Map(inventory.map((row) => [row.productId, row.qtyOnHandBase]));

  return NextResponse.json({
    products: products.map((product) =>
      toSellableProductDto(product, inventoryMap.get(product.id) ?? 0)
    ),
    take,
  });
}
