import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser } from '../_shared';
import { resolveReportDateRange } from '@/lib/reports/date-parsing';
import { detectExportFormat, fmtDateTime, respondWithExport } from '@/lib/exports/branded-export';
import {
  CASH_DRAWER_BREAKDOWN_ORDER,
  CASH_DRAWER_ENTRY_LABELS,
  summarizeCashDrawerEntries,
} from '@/lib/services/cash-drawer';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const url = new URL(request.url);
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const storeId = url.searchParams.get('storeId') || 'ALL';

  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: { name: true, currency: true, timezone: true },
  });
  const range = resolveReportDateRange(
    {
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
    },
    weekAgo,
    today,
    business?.timezone,
  );
  const from = range.start;
  const endExclusive = range.end;

  const shifts = await prisma.shift.findMany({
      where: {
        till: {
          store: {
            businessId: user.businessId,
            ...(storeId === 'ALL' ? {} : { id: storeId }),
          },
        },
        openedAt: { gte: from, lt: endExclusive },
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
        cashDrawerEntries: { select: { entryType: true, amountPence: true } },
      },
  });

  const movementColumns = CASH_DRAWER_BREAKDOWN_ORDER.map((type) => ({
    header: CASH_DRAWER_ENTRY_LABELS[type],
    key: `mv_${type}`,
  }));

  const columns = [
    { header: 'Date', key: 'date', width: 20 },
    { header: 'Branch', key: 'branch' },
    { header: 'Till', key: 'till' },
    { header: 'Cashier', key: 'cashier' },
    { header: 'Status', key: 'status' },
    ...movementColumns,
    { header: 'Expected Cash', key: 'expectedCash' },
    { header: 'Counted Cash', key: 'countedCash' },
    { header: 'Variance', key: 'variance' },
    { header: 'Variance Reason Code', key: 'varianceReasonCode', width: 20 },
    { header: 'Variance Details', key: 'varianceDetails', width: 25 },
    { header: 'Notes', key: 'notes', width: 25 },
    { header: 'Manager Approval', key: 'managerApproval' },
  ];

  const rows = shifts.map((shift) => {
    const { byType } = summarizeCashDrawerEntries(shift.cashDrawerEntries);
    const movementValues = Object.fromEntries(
      CASH_DRAWER_BREAKDOWN_ORDER.map((type) => [`mv_${type}`, formatPence(byType[type] ?? 0)]),
    );
    return {
      date: fmtDateTime(shift.openedAt),
      branch: shift.till.store.name,
      till: shift.till.name,
      cashier: shift.user.name,
      status: shift.status,
      ...movementValues,
      expectedCash: formatPence(shift.expectedCashPence),
      countedCash: shift.status === 'OPEN' ? 'Not counted yet' : formatPence(shift.actualCashPence ?? 0),
      variance: shift.status === 'OPEN' ? 'Pending close' : formatPence(shift.variance ?? 0),
      varianceReasonCode: shift.varianceReasonCode ?? '',
      varianceDetails: shift.varianceReason ?? '',
      notes: shift.notes ?? '',
      managerApproval: shift.closeManagerApprovedBy?.name ?? '',
    };
  });

  const csvHeader = columns.map((c) => c.header).join(',');
  const csvRows = rows
    .map((row) => columns.map((c) => csvEscape((row as Record<string, string>)[c.key] ?? '')).join(','))
    .join('\n');
  const csv = `${csvHeader}\n${csvRows}`;

  const format = detectExportFormat(request);
  return respondWithExport({
    format,
    csv,
    filename: 'cash-drawer-summary',
    exportOptions: {
      businessName: business?.name ?? 'Business',
      reportTitle: 'Cash Drawer Summary',
      dateRange: { from, to: new Date(endExclusive.getTime() - 1) },
      currency: business?.currency ?? 'GHS',
      columns,
      rows,
    },
  });
}
