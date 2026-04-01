import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { detectExportFormat, respondWithExport } from '@/lib/exports/branded-export';
import { csvEscape, formatPence, requireExportUser, resolveExportDateRange } from '../_shared';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const dateRange = resolveExportDateRange(request);

  const [salesReturns, purchaseReturns, business] = await Promise.all([
    prisma.salesReturn.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        salesInvoice: { businessId: user.businessId },
      },
      include: {
        salesInvoice: {
          include: {
            customer: true,
            store: true,
          },
        },
        user: true,
        managerApprovedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.purchaseReturn.findMany({
      where: {
        createdAt: { gte: dateRange.start, lte: dateRange.end },
        purchaseInvoice: { businessId: user.businessId },
      },
      include: {
        purchaseInvoice: {
          include: {
            supplier: true,
            store: true,
          },
        },
        user: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, currency: true },
    }),
  ]);

  const rows = [
    ...salesReturns.map((item) => ({
      category: 'Sales',
      type: item.type === 'VOID' ? 'Sale void' : 'Sale return',
      reversalDate: item.createdAt.toISOString().slice(0, 10),
      originalDate: item.salesInvoice.createdAt.toISOString().slice(0, 10),
      store: item.salesInvoice.store.name,
      reference: item.salesInvoice.transactionNumber ?? item.salesInvoice.id.slice(0, 8),
      counterparty: item.salesInvoice.customer?.name ?? 'Walk-in',
      refundMethod: item.refundMethod ?? '',
      refundAmount: formatPence(item.refundAmountPence),
      reasonCode: item.reasonCode ?? '',
      reason: item.reason ?? '',
      recordedBy: item.user.name,
      approvedBy: item.managerApprovedBy?.name ?? (item.managerApprovalMode === 'SELF_OWNER' ? 'Owner self-approved' : ''),
      sortTimestamp: item.createdAt.toISOString(),
    })),
    ...purchaseReturns.map((item) => ({
      category: 'Purchases',
      type: item.type === 'VOID' ? 'Purchase void' : 'Purchase return',
      reversalDate: item.createdAt.toISOString().slice(0, 10),
      originalDate: item.purchaseInvoice.createdAt.toISOString().slice(0, 10),
      store: item.purchaseInvoice.store.name,
      reference: item.purchaseInvoice.id.slice(0, 8),
      counterparty: item.purchaseInvoice.supplier?.name ?? 'Supplier not set',
      refundMethod: item.refundMethod ?? '',
      refundAmount: formatPence(item.refundAmountPence),
      reasonCode: item.reasonCode ?? '',
      reason: item.reason ?? '',
      recordedBy: item.user.name,
      approvedBy: '',
      sortTimestamp: item.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.sortTimestamp.localeCompare(a.sortTimestamp));

  const columns = [
    { header: 'Category', key: 'category', width: 12 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'Reversal Date', key: 'reversalDate', width: 14 },
    { header: 'Original Date', key: 'originalDate', width: 14 },
    { header: 'Store', key: 'store', width: 16 },
    { header: 'Reference', key: 'reference', width: 14 },
    { header: 'Counterparty', key: 'counterparty', width: 22 },
    { header: 'Refund Method', key: 'refundMethod', width: 14 },
    { header: 'Refund Amount', key: 'refundAmount', width: 14 },
    { header: 'Reason Code', key: 'reasonCode', width: 16 },
    { header: 'Reason', key: 'reason', width: 28 },
    { header: 'Recorded By', key: 'recordedBy', width: 18 },
    { header: 'Approved By', key: 'approvedBy', width: 18 },
  ];

  const csvHeader = columns.map((column) => column.header).join(',');
  const csvRows = rows.map((row) => columns.map((column) => csvEscape(row[column.key as keyof typeof row] ?? '')).join(',')).join('\n');
  const csv = `${csvHeader}\n${csvRows}`;

  return respondWithExport({
    format: detectExportFormat(request),
    csv,
    filename: 'reversals',
    exportOptions: {
      businessName: business?.name ?? 'Business',
      reportTitle: 'Reversals Report — Returns & Voids',
      dateRange: { from: dateRange.start, to: dateRange.end },
      currency: business?.currency ?? 'GHS',
      columns,
      rows,
    },
  });
}