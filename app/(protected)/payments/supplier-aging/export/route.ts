import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getSupplierAgingReport, AGING_BUCKETS, AGING_BUCKET_LABELS } from '@/lib/services/supplier-aging';

const csvEscape = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const formatPence = (pence: number) => (pence / 100).toFixed(2);

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user || !['MANAGER', 'OWNER'].includes(user.role)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const url = new URL(request.url);
  const todayStr = new Date().toISOString().slice(0, 10);
  const rawAsOf = url.searchParams.get('asOf') ?? '';
  const asOfStr = rawAsOf && rawAsOf <= todayStr ? rawAsOf : todayStr;
  const asOf = utcStartOfDay(new Date(asOfStr + 'T00:00:00Z'));

  const report = await getSupplierAgingReport(user.businessId, asOf);

  const rows: string[] = [];
  rows.push(`Supplier Aging Report`);
  rows.push(`As Of,${csvEscape(asOfStr)}`);
  rows.push(`Generated,${csvEscape(new Date().toISOString())}`);
  rows.push('');

  // Header row
  const headers = [
    'Supplier',
    'Invoice Count',
    'Total',
    ...AGING_BUCKETS.map((b) => AGING_BUCKET_LABELS[b]),
    'Oldest Due Date',
  ];
  rows.push(headers.map(csvEscape).join(','));

  // Data rows
  for (const row of report.rows) {
    const cells = [
      csvEscape(row.supplierName),
      csvEscape(row.invoiceCount),
      csvEscape(formatPence(row.totalPence)),
      ...AGING_BUCKETS.map((b) => csvEscape(formatPence(row.buckets[b]))),
      csvEscape(row.oldestDueDate ? row.oldestDueDate.toISOString().slice(0, 10) : ''),
    ];
    rows.push(cells.join(','));
  }

  // Footer totals
  const totalCells = [
    'TOTAL',
    csvEscape(report.totals.invoiceCount),
    csvEscape(formatPence(report.totals.totalPence)),
    ...AGING_BUCKETS.map((b) => csvEscape(formatPence(report.totals.buckets[b]))),
    '',
  ];
  rows.push(totalCells.join(','));

  const csv = rows.join('\n');
  const filename = `supplier-aging-${asOfStr}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
