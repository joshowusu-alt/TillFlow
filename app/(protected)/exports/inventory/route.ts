import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser } from '../_shared';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const store = await prisma.store.findFirst({ where: { businessId: user.businessId } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const balances = await prisma.inventoryBalance.findMany({
    where: { storeId: store.id },
    include: { product: { include: { productUnits: { include: { unit: true } } } } },
    orderBy: { product: { name: 'asc' } }
  });

  const rows: string[] = [];
  rows.push('Store,Product,On Hand (Base),Avg Cost (Base),Base Unit,Packaging Unit,Packaging Conversion');
  for (const balance of balances) {
    const baseUnit = balance.product.productUnits.find((unit) => unit.isBaseUnit);
    const packaging = balance.product.productUnits
      .filter((unit) => !unit.isBaseUnit && unit.conversionToBase > 1)
      .sort((a, b) => b.conversionToBase - a.conversionToBase)[0];
    rows.push(
      [
        csvEscape(store.name),
        csvEscape(balance.product.name),
        csvEscape(balance.qtyOnHandBase),
        csvEscape(formatPence(balance.avgCostBasePence)),
        csvEscape(baseUnit?.unit.name ?? ''),
        csvEscape(packaging?.unit.name ?? ''),
        csvEscape(packaging?.conversionToBase ?? '')
      ].join(',')
    );
  }

  const csv = rows.join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="inventory.csv"'
    }
  });
}
