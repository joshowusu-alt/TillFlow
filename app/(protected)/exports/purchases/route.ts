import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser, resolveExportDateRange } from '../_shared';
import { detectExportFormat, respondWithExport } from '@/lib/exports/branded-export';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const dateRange = resolveExportDateRange(request);

  const [rawLines, business] = await Promise.all([
    prisma.purchaseInvoiceLine.findMany({
      where: {
        purchaseInvoice: {
          businessId: user.businessId,
          createdAt: { gte: dateRange.start, lte: dateRange.end },
        },
      },
      include: {
        purchaseInvoice: {
          include: {
            supplier: true,
            store: true,
            payments: true,
            purchaseReturn: true,
          },
        },
        product: true,
        unit: true,
      },
      orderBy: { purchaseInvoice: { createdAt: 'desc' } },
    }),
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, currency: true },
    }),
  ]);

  const lines = rawLines.filter((line) => !line.purchaseInvoice.purchaseReturn);

  const columns = [
    { header: 'Invoice', key: 'invoice', width: 12 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Store', key: 'store', width: 16 },
    { header: 'Supplier', key: 'supplier', width: 24 },
    { header: 'Product', key: 'product', width: 24 },
    { header: 'SKU', key: 'sku', width: 12 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Unit Cost', key: 'unitCost', width: 12 },
    { header: 'Subtotal', key: 'subtotal', width: 12 },
    { header: 'VAT', key: 'vat', width: 12 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Invoice Status', key: 'status', width: 14 },
    { header: 'Invoice Paid', key: 'paid', width: 12 },
    { header: 'Invoice Balance', key: 'balance', width: 14 },
  ];

  const rows = lines.map((line) => {
    const paid = line.purchaseInvoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0);
    const balance = Math.max(line.purchaseInvoice.totalPence - paid, 0);

    return {
      invoice: line.purchaseInvoice.id.slice(0, 8),
      date: line.purchaseInvoice.createdAt.toISOString().slice(0, 10),
      store: line.purchaseInvoice.store?.name ?? '',
      supplier: line.purchaseInvoice.supplier?.name ?? 'Supplier not set',
      product: line.product.name,
      sku: line.product.sku ?? '',
      qty: line.qtyInUnit,
      unit: line.unit.name,
      unitCost: formatPence(line.unitCostPence),
      subtotal: formatPence(line.lineSubtotalPence),
      vat: formatPence(line.lineVatPence),
      total: formatPence(line.lineTotalPence),
      status: line.purchaseInvoice.paymentStatus,
      paid: formatPence(paid),
      balance: formatPence(balance),
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
      reportTitle: 'Purchases Report — Product Detail',
      dateRange: { from: dateRange.start, to: dateRange.end },
      currency: business?.currency ?? 'GHS',
      columns,
      rows,
    },
  });
}
