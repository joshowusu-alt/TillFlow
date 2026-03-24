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

  const [shifts, business] = await Promise.all([
    prisma.shift.findMany({
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
        varianceReasonCode: true,
        varianceReason: true,
        notes: true,
        till: { select: { name: true, store: { select: { name: true } } } },
        user: { select: { name: true } },
        closeManagerApprovedBy: { select: { name: true } },
      },
    }),
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, currency: true },
    }),
  ]);

  const columns = [
    { header: 'Date', key: 'date', width: 20 },
    { header: 'Branch', key: 'branch' },
    { header: 'Till', key: 'till' },
    { header: 'Cashier', key: 'cashier' },
    { header: 'Status', key: 'status' },
    { header: 'Opening Float', key: 'openingFloat' },
    { header: 'Expected Cash', key: 'expectedCash' },
    { header: 'Counted Cash', key: 'countedCash' },
    { header: 'Variance', key: 'variance' },
    { header: 'Variance Reason Code', key: 'varianceReasonCode', width: 20 },
    { header: 'Variance Details', key: 'varianceDetails', width: 25 },
    { header: 'Notes', key: 'notes', width: 25 },
    { header: 'Manager Approval', key: 'managerApproval' },
  ];

  const rows = shifts.map((shift) => ({
    date: shift.openedAt.toISOString(),
    branch: shift.till.store.name,
    till: shift.till.name,
    cashier: shift.user.name,
    status: shift.status,
    openingFloat: formatPence(shift.openingCashPence),
    expectedCash: formatPence(shift.expectedCashPence),
    countedCash: formatPence(shift.actualCashPence ?? 0),
    variance: formatPence(shift.variance ?? 0),
    varianceReasonCode: shift.varianceReasonCode ?? '',
    varianceDetails: shift.varianceReason ?? '',
    notes: shift.notes ?? '',
    managerApproval: shift.closeManagerApprovedBy?.name ?? '',
  }));

  const csvHeader = columns.map((c) => c.header).join(',');
  const csvRows = rows.map((row) => columns.map((c) => csvEscape((row as Record<string, any>)[c.key] ?? '')).join(',')).join('\n');
  const csv = `${csvHeader}\n${csvRows}`;

  const format = detectExportFormat(request);
  return respondWithExport({
    format,
    csv,
    filename: 'cash-drawer-summary',
    exportOptions: {
      businessName: business?.name ?? 'Business',
      reportTitle: 'Cash Drawer Summary',
      dateRange: { from, to },
      currency: business?.currency ?? 'GHS',
      columns,
      rows,
    },
  });
}
