import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser } from '../_shared';
import { detectExportFormat, respondWithExport, type ExportOptions } from '@/lib/exports/branded-export';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const [products, business] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: user.businessId },
      include: { productUnits: { include: { unit: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, currency: true },
    }),
  ]);

  const columns = [
    { header: 'SKU', key: 'sku' },
    { header: 'Barcode', key: 'barcode' },
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Base Price', key: 'basePrice' },
    { header: 'Default Cost', key: 'defaultCost' },
    { header: 'Base Unit', key: 'baseUnit' },
    { header: 'Packaging Unit', key: 'pkgUnit' },
    { header: 'Packaging Conversion', key: 'pkgConversion' },
    { header: 'Active', key: 'active' },
  ];

  const rows = products.map((product) => {
    const baseUnit = product.productUnits.find((unit) => unit.isBaseUnit);
    const packaging = product.productUnits
      .filter((unit) => !unit.isBaseUnit && unit.conversionToBase > 1)
      .sort((a, b) => b.conversionToBase - a.conversionToBase)[0];
    return {
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      name: product.name,
      basePrice: formatPence(product.sellingPriceBasePence),
      defaultCost: formatPence(product.defaultCostBasePence),
      baseUnit: baseUnit?.unit.name ?? '',
      pkgUnit: packaging?.unit.name ?? '',
      pkgConversion: packaging?.conversionToBase ?? '',
      active: product.active ? 'Yes' : 'No',
    };
  });

  const csvHeader = columns.map((c) => c.header).join(',');
  const csvRows = rows.map((row) => columns.map((c) => csvEscape((row as Record<string, any>)[c.key] ?? '')).join(',')).join('\n');
  const csv = `${csvHeader}\n${csvRows}`;

  const format = detectExportFormat(request);
  return respondWithExport({
    format,
    csv,
    filename: 'products',
    exportOptions: {
      businessName: business?.name ?? 'Business',
      reportTitle: 'Products Master Data',
      currency: business?.currency ?? 'GHS',
      columns,
      rows,
    },
  });
}
