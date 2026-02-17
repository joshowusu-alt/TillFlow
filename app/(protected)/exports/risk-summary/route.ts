import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser } from '../_shared';

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

  const [alerts, discountedSales] = await Promise.all([
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

  const rows: string[] = [];
  rows.push('Section,Metric,Value');
  rows.push(['Summary', 'From', csvEscape(from.toISOString())].join(','));
  rows.push(['Summary', 'To', csvEscape(to.toISOString())].join(','));
  rows.push(['Summary', 'Store Filter', csvEscape(storeId)].join(','));
  rows.push(['Summary', 'Status Filter', csvEscape(status)].join(','));
  rows.push(['Summary', 'Alerts Count', csvEscape(alerts.length)].join(','));
  rows.push([
    'Summary',
    'High Severity Alerts',
    csvEscape(alerts.filter((alert) => alert.severity === 'HIGH').length),
  ].join(','));
  rows.push([
    'Summary',
    'Discount Overrides',
    csvEscape(discountedSales.filter((sale) => !!sale.discountApprovedByUserId).length),
  ].join(','));

  rows.push('');
  rows.push('Cashier,Cashier Alerts,High Alerts,Discount Total,Overrides');
  for (const [, entry] of Array.from(byCashier.entries()).sort((a, b) => b[1].alerts - a[1].alerts)) {
    rows.push([
      csvEscape(entry.name),
      csvEscape(entry.alerts),
      csvEscape(entry.highAlerts),
      csvEscape(formatPence(entry.discountTotalPence)),
      csvEscape(entry.overrides),
    ].join(','));
  }

  rows.push('');
  rows.push('Occurred At,Type,Severity,Status,Cashier,Branch,Summary');
  for (const alert of alerts) {
    rows.push([
      csvEscape(alert.occurredAt.toISOString()),
      csvEscape(alert.alertType),
      csvEscape(alert.severity),
      csvEscape(alert.status),
      csvEscape(alert.cashierUser?.name ?? 'Unknown'),
      csvEscape(alert.store?.name ?? 'N/A'),
      csvEscape(alert.summary),
    ].join(','));
  }

  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="risk-summary.csv"',
    },
  });
}
