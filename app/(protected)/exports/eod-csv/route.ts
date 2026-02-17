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

  const shifts = await prisma.shift.findMany({
    where: {
      till: {
        store: {
          businessId: user.businessId,
          ...(storeId === 'ALL' ? {} : { id: storeId }),
        },
      },
      openedAt: { gte: from, lte: to },
    },
    orderBy: { openedAt: 'desc' },
    select: {
      openedAt: true,
      closedAt: true,
      status: true,
      openingCashPence: true,
      expectedCashPence: true,
      actualCashPence: true,
      variance: true,
      till: { select: { name: true, store: { select: { name: true } } } },
      user: { select: { name: true } },
      closeManagerApprovedBy: { select: { name: true } },
    },
  });

  const rows: string[] = [];
  rows.push(
    'Date,Branch,Till,Cashier,Status,Opening Float,Expected Cash,Counted Cash,Variance,Manager Approval'
  );

  for (const shift of shifts) {
    rows.push(
      [
        csvEscape(shift.openedAt.toISOString()),
        csvEscape(shift.till.store.name),
        csvEscape(shift.till.name),
        csvEscape(shift.user.name),
        csvEscape(shift.status),
        csvEscape(formatPence(shift.openingCashPence)),
        csvEscape(formatPence(shift.expectedCashPence)),
        csvEscape(formatPence(shift.actualCashPence ?? 0)),
        csvEscape(formatPence(shift.variance ?? 0)),
        csvEscape(shift.closeManagerApprovedBy?.name ?? ''),
      ].join(',')
    );
  }

  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="cash-drawer-summary.csv"',
    },
  });
}
