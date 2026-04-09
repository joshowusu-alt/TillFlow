import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatPence, requireExportUser, resolveExportDateRange } from '../_shared';
import { detectExportFormat, respondWithExport } from '@/lib/exports/branded-export';
import { getMarginAnalysisSnapshot } from '@/lib/reports/margin-analysis';

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') ?? 'all';
  const format = detectExportFormat(request);
  const dateRange = resolveExportDateRange(request);

  const [snapshot, business] = await Promise.all([
    getMarginAnalysisSnapshot({ businessId: user.businessId, start: dateRange.start, end: dateRange.end }),
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, currency: true },
    }),
  ]);

  if (!business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }

  // Apply the same view filter as the UI
  const filteredRows =
    view === 'below-cost'
      ? snapshot.rows.filter((row) => row.belowCost)
      : view === 'below-target'
        ? snapshot.rows.filter((row) => row.belowTargetMargin)
        : snapshot.rows;

  // Sort same as UI
  const sortedRows =
    view === 'below-cost'
      ? [...filteredRows].sort((a, b) => a.profitPence - b.profitPence || a.marginPercent - b.marginPercent)
      : view === 'below-target'
        ? [...filteredRows].sort((a, b) => a.marginDeltaPercent - b.marginDeltaPercent || a.profitPence - b.profitPence)
        : [...filteredRows].sort((a, b) => b.profitPence - a.profitPence);

  const columns = [
    { header: 'Product', key: 'product', width: 28 },
    { header: 'Qty Sold', key: 'qty', width: 10 },
    { header: 'Avg Sell Price', key: 'avgSell', width: 14 },
    { header: 'Avg Cost Price', key: 'avgCost', width: 14 },
    { header: 'Revenue', key: 'revenue', width: 14 },
    { header: 'Cost', key: 'cost', width: 14 },
    { header: 'Profit', key: 'profit', width: 14 },
    { header: 'Margin %', key: 'margin', width: 10 },
    { header: 'Target %', key: 'target', width: 10 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Last Sold', key: 'lastSold', width: 12 },
  ];

  const rows = sortedRows.map((row) => ({
    product: row.name,
    qty: row.qtySold,
    avgSell: formatPence(row.averageSellPricePence),
    avgCost: formatPence(row.averageCostPricePence),
    revenue: formatPence(row.revenuePence),
    cost: formatPence(row.costPence),
    profit: formatPence(row.profitPence),
    margin: pct(row.marginPercent),
    target: pct(row.effectiveThresholdPercent),
    status: row.belowCost ? 'Below cost' : row.belowTargetMargin ? 'Below target' : 'Healthy',
    lastSold: row.lastSoldAt.toISOString().slice(0, 10),
  }));

  const viewLabel = view === 'below-cost' ? ' — Below Cost' : view === 'below-target' ? ' — Below Target' : '';
  const reportTitle = `Profit Margins${viewLabel}`;

  const exportOptions = {
    businessName: business.name,
    reportTitle,
    dateRange: { from: dateRange.start, to: dateRange.end },
    currency: business.currency,
    columns,
    rows,
  };

  const csvBody = rows
    .map((row) => columns.map((col) => String(row[col.key as keyof typeof row] ?? '')).join(','))
    .join('\n');

  const viewSlug = view === 'all' ? 'all' : view === 'below-cost' ? 'below-cost' : 'below-target';
  const dateSlug = dateRange.start.toISOString().slice(0, 10);
  const filename = `margins-${viewSlug}-${dateSlug}`;

  return respondWithExport({ format, csv: csvBody, filename, exportOptions });
}
