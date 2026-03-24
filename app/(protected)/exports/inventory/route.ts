import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser } from '../_shared';
import { detectExportFormat, respondWithExport, type ExportOptions } from '@/lib/exports/branded-export';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const [store, business] = await Promise.all([
    prisma.store.findFirst({ where: { businessId: user.businessId } }),
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, currency: true },
    }),
  ]);
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const balances = await prisma.inventoryBalance.findMany({
    where: { storeId: store.id },
    include: { product: { include: { productUnits: { include: { unit: true } } } } },
    orderBy: { product: { name: 'asc' } }
  });

  const columns = [
    { header: 'Store', key: 'store' },
    { header: 'Product', key: 'product', width: 25 },
    { header: 'On Hand (Base)', key: 'onHand' },
    { header: 'Avg Cost (Base)', key: 'avgCost' },
    { header: 'Base Unit', key: 'baseUnit' },
    { header: 'Packaging Unit', key: 'pkgUnit' },
    { header: 'Packaging Conversion', key: 'pkgConversion' },
  ];

  const rows = balances.map((balance) => {
    const baseUnit = balance.product.productUnits.find((unit) => unit.isBaseUnit);
    const packaging = balance.product.productUnits
      .filter((unit) => !unit.isBaseUnit && unit.conversionToBase > 1)
      .sort((a, b) => b.conversionToBase - a.conversionToBase)[0];
    return {
      store: store.name,
      product: balance.product.name,
      onHand: balance.qtyOnHandBase,
      avgCost: formatPence(balance.avgCostBasePence),
      baseUnit: baseUnit?.unit.name ?? '',
      pkgUnit: packaging?.unit.name ?? '',
      pkgConversion: packaging?.conversionToBase ?? '',
    };
  });

  const csvHeader = columns.map((c) => c.header).join(',');
  const csvRows = rows.map((row) => columns.map((c) => csvEscape((row as Record<string, any>)[c.key] ?? '')).join(',')).join('\n');
  const csv = `${csvHeader}\n${csvRows}`;

  const format = detectExportFormat(request);
  return respondWithExport({
    format,
    csv,
    filename: 'inventory',
    exportOptions: {
      businessName: business?.name ?? 'Business',
      reportTitle: 'Inventory Report',
      currency: business?.currency ?? 'GHS',
      columns,
      rows,
    },
  });
}
