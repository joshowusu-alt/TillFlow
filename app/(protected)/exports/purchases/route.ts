import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser } from '../_shared';
import { detectExportFormat, respondWithExport, type ExportOptions } from '@/lib/exports/branded-export';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const [purchases, business] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: { businessId: user.businessId },
      include: {
        supplier: true,
        store: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, currency: true },
    }),
  ]);

  const columns = [
    { header: 'Invoice', key: 'invoice' },
    { header: 'Date', key: 'date' },
    { header: 'Store', key: 'store' },
    { header: 'Supplier', key: 'supplier', width: 25 },
    { header: 'Status', key: 'status' },
    { header: 'Subtotal', key: 'subtotal' },
    { header: 'VAT', key: 'vat' },
    { header: 'Total', key: 'total' },
    { header: 'Paid', key: 'paid' },
  ];

  const rows = purchases.map((purchase) => {
    const paid = purchase.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    return {
      invoice: purchase.id.slice(0, 8),
      date: purchase.createdAt.toISOString(),
      store: purchase.store?.name ?? '',
      supplier: purchase.supplier?.name ?? 'Supplier not set',
      status: purchase.paymentStatus,
      subtotal: formatPence(purchase.subtotalPence),
      vat: formatPence(purchase.vatPence),
      total: formatPence(purchase.totalPence),
      paid: formatPence(paid),
    };
  });

  const csvHeader = columns.map((c) => c.header).join(',');
  const csvRows = rows.map((row) => columns.map((c) => csvEscape((row as Record<string, any>)[c.key] ?? '')).join(',')).join('\n');
  const csv = `${csvHeader}\n${csvRows}`;

  const format = detectExportFormat(request);
  return respondWithExport({
    format,
    csv,
    filename: 'purchases',
    exportOptions: {
      businessName: business?.name ?? 'Business',
      reportTitle: 'Purchases Report',
      currency: business?.currency ?? 'GHS',
      columns,
      rows,
    },
  });
}
