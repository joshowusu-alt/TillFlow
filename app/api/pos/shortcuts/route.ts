import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readShortcutLayout } from '@/lib/pos/shortcuts';
import { SELLABLE_PRODUCT_SELECT, toSellableProductDto } from '@/lib/pos/sellable-dto';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const store = await prisma.store.findFirst({ where: { id: request.nextUrl.searchParams.get('storeId') ?? '', businessId: user.businessId }, select: { id: true, posShortcutsJson: true } });
  if (!store) return NextResponse.json({ error: 'Branch not found' }, { status: 404 });
  const layout = readShortcutLayout(store.posShortcutsJson);
  const ids = [...new Set(layout.screens.flatMap(s => s.productIds))];
  const [products, balances] = await Promise.all([
    prisma.product.findMany({ where: { businessId: user.businessId, active: true, id: { in: ids } }, select: SELLABLE_PRODUCT_SELECT }),
    prisma.inventoryBalance.findMany({ where: { storeId: store.id, productId: { in: ids } }, select: { productId: true, qtyOnHandBase: true } }),
  ]);
  const stock = new Map(balances.map(b => [b.productId, b.qtyOnHandBase]));
  return NextResponse.json({ layout, revision: store.posShortcutsJson, canManage: user.role === 'OWNER' || user.role === 'MANAGER', products: products.map(p => toSellableProductDto(p, stock.get(p.id) ?? 0)) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
