import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { formatMoney } from '@/lib/format';
import { resolveSelectableReportDateRange } from '@/lib/reports/date-parsing';
import { getSupplierSalesReport } from '@/lib/reports/supplier-sales';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);

  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
  );
  if (!features.advancedReports) {
    return NextResponse.json({ error: 'Growth plan required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const params = {
    period: searchParams.get('period') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  };
  const supplierId = searchParams.get('supplierId') ?? undefined;

  const { start, end, fromInputValue, toInputValue } = resolveSelectableReportDateRange(params, 'mtd');
  const report = await getSupplierSalesReport(business.id, { start, end, supplierId });

  const currency = business.currency;

  // Build flat rows: one row per (supplier, product) combination.
  const rows: string[][] = [
    ['Sales by Linked Supplier', `${fromInputValue} to ${toInputValue}`],
    [
      'Note: This report shows sales for products linked to each supplier via their preferred supplier setting. ' +
        'It does not track the exact supplier source of each inventory unit sold.',
    ],
    [],
    ['Supplier', 'Product', 'SKU', 'Qty Sold (base units)', 'Revenue', 'Sales Count'],
  ];

  for (const supplierRow of report.rows) {
    if (supplierRow.products.length === 0) {
      // Supplier exists but had no sales in the period — still include with zeros
      rows.push([
        supplierRow.supplierName,
        '—',
        '—',
        '0',
        formatMoney(0, currency),
        '0',
      ]);
    } else {
      for (const product of supplierRow.products) {
        rows.push([
          supplierRow.supplierName,
          product.productName,
          product.sku ?? '',
          product.qtyBase.toString(),
          formatMoney(product.revenuePence, currency),
          product.salesCount.toString(),
        ]);
      }
    }
  }

  // Totals row
  rows.push([]);
  rows.push([
    'TOTAL',
    '',
    '',
    report.totalQtyBase.toString(),
    formatMoney(report.totalRevenuePence, currency),
    '',
  ]);

  const csv = rows
    .map((row) => row.map((cell) => `"${(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const filename = `supplier-sales-${fromInputValue}-to-${toInputValue}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
