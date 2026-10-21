import { NextResponse } from 'next/server';
import { resolveSelectableReportDateRange } from '@/lib/reports/date-parsing';
import { getSupplierSalesReport } from '@/lib/reports/supplier-sales';
import { guardLiveReport } from '@/lib/entitlements/live-report';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = Object.fromEntries(searchParams.entries());
  const access = await guardLiveReport({surfaceId:'export_sales_by_supplier',action:'EXPORT',search,range:({timezone,now})=>{
    const dates=resolveSelectableReportDateRange(search,'mtd',now,timezone);
    return {fromLocalDate:dates.fromInputValue,toLocalDate:dates.toInputValue,preset:'CUSTOM'};
  }});
  if(!access.ok)return NextResponse.json(access.body,{status:access.status,headers:access.headers});
  if(access.branch.kind!=='stores')return NextResponse.json({error:'Select an authorised store.'},{status:403});
  const {business}=access;
  const params = {
    period: searchParams.get('period') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  };
  const supplierId = searchParams.get('supplierId') ?? undefined;

  const { start, end, fromInputValue, toInputValue } = resolveSelectableReportDateRange(access.decision.appliedRange ? {from:access.decision.appliedRange.fromLocalDate,to:access.decision.appliedRange.toLocalDate}:params, 'mtd', new Date(), business.timezone);
  const report = await getSupplierSalesReport(business.id, { start, end, supplierId,storeIds:access.branch.storeIds,categoryId:search.categoryId||undefined,divisionId:search.divisionId||undefined,groupId:search.groupId||undefined });

  const currency = business.currency;

  // Build flat rows: one row per (supplier, product) combination.
  const rows: string[][] = [
    ['Sales by Linked Supplier', `${fromInputValue} to ${toInputValue}`, `Currency: ${currency}`],
    [
      'Note: This report shows sales for products linked to each supplier via their preferred supplier setting. ' +
        'It does not track the exact supplier source of each inventory unit sold. Changing the preferred supplier reassigns earlier sales in this report. Net sales exclude tax and include discounts. Cost comes from the historical sale. Calculated gross profit is not retained shop earnings or a supplier settlement amount.',
    ],
    [],
    ['Supplier', 'Product', 'SKU', 'Qty Sold (base units)', 'Revenue', 'Sales Count','Net sales (ex tax)','Recorded cost','Calculated gross profit','Margin %'],
  ];

  for (const supplierRow of report.rows) {
    if (supplierRow.products.length === 0) {
      // Supplier exists but had no sales in the period — still include with zeros
      rows.push([
        supplierRow.supplierName,
        '—',
        '—',
        '0',
        '0.00',
        '0',
        '0.00', '0.00', '0.00', '',
      ]);
    } else {
      for (const product of supplierRow.products) {
        rows.push([
          supplierRow.supplierName,
          product.productName,
          product.sku ?? '',
          product.qtyBase.toString(),
          (product.revenuePence / 100).toFixed(2),
          product.salesCount.toString(),
          (product.netRevenuePence/100).toFixed(2),
          product.costPence===null?'Incomplete costs':(product.costPence/100).toFixed(2),
          product.profitPence===null?'':(product.profitPence/100).toFixed(2),
          product.marginPercent===null?'':product.marginPercent.toFixed(2),
        ]);
      }
    }
  }

  if (report.unallocatedSalesDifferencePence !== 0) {
    rows.push([
      report.unallocatedSalesDifferenceLabel,
      '',
      '',
      '',
      (report.unallocatedSalesDifferencePence / 100).toFixed(2),
      '',
      '', '', '', '',
    ]);
  }

  // Totals row
  rows.push([]);
  rows.push([
    'TOTAL',
    '',
    '',
    report.totalQtyBase.toString(),
    (report.totalRevenuePence / 100).toFixed(2),
    '',
    '', '', '', '',
  ]);

  const csv = rows
    .map((row) => row.map((cell) => `"${(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const filename = `supplier-sales-${fromInputValue}-to-${toInputValue}.csv`;

  // UTF-8 BOM lets Excel recognise names and symbols without corrupting them.
  // Monetary columns remain numeric; the currency is recorded in the header.
  return new NextResponse('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
