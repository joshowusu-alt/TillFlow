import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser } from '../_shared';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const products = await prisma.product.findMany({
    where: { businessId: user.businessId },
    include: { productUnits: { include: { unit: true } } },
    orderBy: { name: 'asc' }
  });

  const rows: string[] = [];
  rows.push('SKU,Barcode,Name,Base Price,Default Cost,Base Unit,Packaging Unit,Packaging Conversion,Active');
  for (const product of products) {
    const baseUnit = product.productUnits.find((unit) => unit.isBaseUnit);
    const packaging = product.productUnits
      .filter((unit) => !unit.isBaseUnit && unit.conversionToBase > 1)
      .sort((a, b) => b.conversionToBase - a.conversionToBase)[0];
    rows.push(
      [
        csvEscape(product.sku ?? ''),
        csvEscape(product.barcode ?? ''),
        csvEscape(product.name),
        csvEscape(formatPence(product.sellingPriceBasePence)),
        csvEscape(formatPence(product.defaultCostBasePence)),
        csvEscape(baseUnit?.unit.name ?? ''),
        csvEscape(packaging?.unit.name ?? ''),
        csvEscape(packaging?.conversionToBase ?? ''),
        csvEscape(product.active ? 'Yes' : 'No')
      ].join(',')
    );
  }

  const csv = rows.join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="products.csv"'
    }
  });
}
