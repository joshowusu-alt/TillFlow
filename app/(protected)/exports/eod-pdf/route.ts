import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser } from '../_shared';
import {
  detectExportFormat,
  fmtDateTime,
  respondWithExport,
  type ExportSection,
  type ExportSummaryCard,
} from '@/lib/exports/branded-export';
import {
  CASH_DRAWER_BREAKDOWN_ORDER,
  CASH_DRAWER_ENTRY_LABELS,
  summarizeCashDrawerEntries,
} from '@/lib/services/cash-drawer';

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

function fmtMoney(pence: number, currency: string): string {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(pence / 100);
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

  const [business, shifts] = await Promise.all([
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, currency: true },
    }),
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
        cashDrawerEntries: { select: { entryType: true, amountPence: true } },
      },
    }),
  ]);

  const currency = business?.currency ?? 'GHS';

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

  const closedShifts = shifts.filter((s) => s.status === 'CLOSED');
  const openShiftCount = shifts.filter((s) => s.status === 'OPEN').length;

  const totalExpected = shifts.reduce((sum, s) => sum + s.expectedCashPence, 0);
  const totalActual = closedShifts.reduce((sum, s) => sum + (s.actualCashPence ?? 0), 0);
  const totalVariance = closedShifts.reduce((sum, s) => sum + (s.variance ?? 0), 0);

  const movementTotals = shifts.reduce<Record<string, number>>((acc, shift) => {
    const { byType } = summarizeCashDrawerEntries(shift.cashDrawerEntries);
    for (const [type, amount] of Object.entries(byType)) {
      acc[type] = (acc[type] ?? 0) + amount;
    }
    return acc;
  }, {});

  const summaryCards: ExportSummaryCard[] = [
    { label: 'Expected Cash', value: fmtMoney(totalExpected, currency) },
    {
      label: openShiftCount > 0 ? 'Counted Cash (closed only)' : 'Counted Cash',
      value: fmtMoney(totalActual, currency),
    },
    {
      label: openShiftCount > 0 ? 'Variance (closed only)' : 'Variance',
      value: fmtMoney(totalVariance, currency),
    },
    { label: 'Shifts exported', value: String(shifts.length) },
  ];

  const movementSection: ExportSection = {
    title: 'Cash movement breakdown',
    rows: CASH_DRAWER_BREAKDOWN_ORDER.map((type) => ({
      label: CASH_DRAWER_ENTRY_LABELS[type],
      value: fmtMoney(movementTotals[type] ?? 0, currency),
    })),
    note:
      openShiftCount > 0
        ? 'Open shifts have not been counted yet, so variance is shown as pending.'
        : undefined,
  };

  const csvHeader = columns.map((c) => c.header).join(',');
  const csvRows = rows
    .map((row) => columns.map((c) => csvEscape((row as Record<string, string>)[c.key] ?? '')).join(','))
    .join('\n');
  const csv = `${csvHeader}\n${csvRows}`;

  const rawFormat = detectExportFormat(request);
  const explicitFormat = url.searchParams.get('format');
  const format = explicitFormat ? rawFormat : 'pdf';

  return respondWithExport({
    format,
    csv,
    filename: 'cash-drawer-summary',
    exportOptions: {
      businessName: business?.name ?? 'Business',
      reportTitle: 'Cash Drawer Summary',
      dateRange: { from, to },
      currency,
      columns,
      rows,
      summaryCards,
      sections: [movementSection],
    },
  });
}
