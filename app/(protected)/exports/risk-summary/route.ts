import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser } from '../_shared';
import { detectExportFormat, respondWithExport, type ExportOptions } from '@/lib/exports/branded-export';

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const url = new URL(request.url);
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const from = parseDate(url.searchParams.get('from'), weekAgo);
  const to = parseDate(url.searchParams.get('to'), today);
  to.setHours(23, 59, 59, 999);
  const storeId = url.searchParams.get('storeId') || 'ALL';
  const status = url.searchParams.get('status') || 'OPEN';

  const where: any = {
    businessId: user.businessId,
    occurredAt: { gte: from, lte: to },
  };
  if (storeId !== 'ALL') {
    where.storeId = storeId;
  }
  if (status !== 'ALL') {
    where.status = status;
  }

  const [alerts, discountedSales, business] = await Promise.all([
    prisma.riskAlert.findMany({
      where,
      include: {
        store: { select: { name: true } },
        cashierUser: { select: { id: true, name: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 1000,
    }),
    prisma.salesInvoice.findMany({
      where: {
        businessId: user.businessId,
        createdAt: { gte: from, lte: to },
        ...(storeId !== 'ALL' ? { storeId } : {}),
        OR: [
          { discountPence: { gt: 0 } },
          { discountApprovedByUserId: { not: null } },
        ],
      },
      select: {
        cashierUserId: true,
        discountPence: true,
        discountApprovedByUserId: true,
      },
    }),
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, currency: true },
    }),
  ]);

  const byCashier = new Map<
    string,
    {
      name: string;
      alerts: number;
      highAlerts: number;
      discountTotalPence: number;
      overrides: number;
    }
  >();

  for (const alert of alerts) {
    const key = alert.cashierUserId ?? 'unknown';
    const entry = byCashier.get(key) ?? {
      name: alert.cashierUser?.name ?? 'Unknown',
      alerts: 0,
      highAlerts: 0,
      discountTotalPence: 0,
      overrides: 0,
    };
    entry.alerts += 1;
    if (alert.severity === 'HIGH') entry.highAlerts += 1;
    byCashier.set(key, entry);
  }

  for (const sale of discountedSales) {
    const key = sale.cashierUserId;
    const entry = byCashier.get(key) ?? {
      name: 'Unknown',
      alerts: 0,
      highAlerts: 0,
      discountTotalPence: 0,
      overrides: 0,
    };
    entry.discountTotalPence += sale.discountPence;
    if (sale.discountApprovedByUserId) {
      entry.overrides += 1;
    }
    byCashier.set(key, entry);
  }

  // Build multi-section CSV (preserved for CSV format)
  const csvLines: string[] = [];
  csvLines.push('Section,Metric,Value');
  csvLines.push(['Summary', 'From', csvEscape(from.toISOString())].join(','));
  csvLines.push(['Summary', 'To', csvEscape(to.toISOString())].join(','));
  csvLines.push(['Summary', 'Store Filter', csvEscape(storeId)].join(','));
  csvLines.push(['Summary', 'Status Filter', csvEscape(status)].join(','));
  csvLines.push(['Summary', 'Alerts Count', csvEscape(alerts.length)].join(','));
  csvLines.push([
    'Summary',
    'High Severity Alerts',
    csvEscape(alerts.filter((alert) => alert.severity === 'HIGH').length),
  ].join(','));
  csvLines.push([
    'Summary',
    'Discount Overrides',
    csvEscape(discountedSales.filter((sale) => !!sale.discountApprovedByUserId).length),
  ].join(','));

  csvLines.push('');
  csvLines.push('Cashier,Cashier Alerts,High Alerts,Discount Total,Overrides');
  for (const [, entry] of Array.from(byCashier.entries()).sort((a, b) => b[1].alerts - a[1].alerts)) {
    csvLines.push([
      csvEscape(entry.name),
      csvEscape(entry.alerts),
      csvEscape(entry.highAlerts),
      csvEscape(formatPence(entry.discountTotalPence)),
      csvEscape(entry.overrides),
    ].join(','));
  }

  csvLines.push('');
  csvLines.push('Occurred At,Type,Severity,Status,Cashier,Branch,Summary');
  for (const alert of alerts) {
    csvLines.push([
      csvEscape(alert.occurredAt.toISOString()),
      csvEscape(alert.alertType),
      csvEscape(alert.severity),
      csvEscape(alert.status),
      csvEscape(alert.cashierUser?.name ?? 'Unknown'),
      csvEscape(alert.store?.name ?? 'N/A'),
      csvEscape(alert.summary),
    ].join(','));
  }

  const csv = csvLines.join('\n');

  const format = detectExportFormat(request);

  // For xlsx/pdf, export the alerts detail table
  const columns = [
    { header: 'Occurred At', key: 'occurredAt', width: 20 },
    { header: 'Type', key: 'type' },
    { header: 'Severity', key: 'severity' },
    { header: 'Status', key: 'status' },
    { header: 'Cashier', key: 'cashier' },
    { header: 'Branch', key: 'branch' },
    { header: 'Summary', key: 'summary', width: 40 },
  ];

  const alertRows = alerts.map((alert) => ({
    occurredAt: alert.occurredAt.toISOString(),
    type: alert.alertType,
    severity: alert.severity,
    status: alert.status,
    cashier: alert.cashierUser?.name ?? 'Unknown',
    branch: alert.store?.name ?? 'N/A',
    summary: alert.summary,
  }));

  const highCount = alerts.filter((a) => a.severity === 'HIGH').length;
  const reportTitle = `Risk Summary — ${alerts.length} alerts, ${highCount} high severity`;

  return respondWithExport({
    format,
    csv,
    filename: 'risk-summary',
    exportOptions: {
      businessName: business?.name ?? 'Business',
      reportTitle,
      dateRange: { from, to },
      currency: business?.currency ?? 'GHS',
      columns,
      rows: alertRows,
    },
  });
}
