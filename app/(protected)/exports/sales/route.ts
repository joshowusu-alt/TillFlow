import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { csvEscape, formatPence, requireExportUser, resolveExportDateRange } from '../_shared';
import { evaluateMarginLines } from '@/lib/reports/margin-line';
import { detectExportFormat, respondWithExport } from '@/lib/exports/branded-export';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const business = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: { name: true, currency: true, timezone: true },
  });
  const dateRange = resolveExportDateRange(request, '30d', business?.timezone);

  const rawLines = await prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: {
          businessId: user.businessId,
          createdAt: { gte: dateRange.start, lt: dateRange.end },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      include: {
        salesInvoice: {
          include: { customer: true, store: true, salesReturn: true },
        },
        product: true,
        unit: true,
      },
      orderBy: { salesInvoice: { createdAt: 'desc' } },
  });

  const lines = rawLines.filter((line) => !line.salesInvoice.salesReturn);

  const columns = [
    { header: 'Invoice', key: 'invoice', width: 10 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Store', key: 'store', width: 15 },
    { header: 'Customer', key: 'customer', width: 18 },
    { header: 'Product', key: 'product', width: 25 },
    { header: 'SKU', key: 'sku', width: 12 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Unit Price', key: 'unitPrice', width: 12 },
    { header: 'Discount', key: 'discount', width: 12 },
    { header: 'Subtotal', key: 'subtotal', width: 12 },
    { header: 'VAT', key: 'vat', width: 12 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Cost', key: 'cost', width: 12 },
    { header: 'Margin', key: 'margin', width: 12 },
  ];

  const groups = new Map<string, typeof lines>();
  for (const line of lines) {
    const group = groups.get(line.salesInvoice.id) ?? [];
    group.push(line);
    groups.set(line.salesInvoice.id, group);
  }
  const marginByLine = new Map<typeof lines[number], string>();
  for (const group of groups.values()) {
    const invoice = group[0].salesInvoice;
    const evaluated = evaluateMarginLines([{
      paymentStatus: invoice.paymentStatus,
      discountPence: invoice.discountPence ?? 0,
      lines: group.map((line) => ({
        lineSubtotalPence: line.lineSubtotalPence,
        lineDiscountPence: line.lineDiscountPence,
        promoDiscountPence: line.promoDiscountPence,
        lineCostPence: line.lineCostPence,
        qtyBase: line.qtyBase,
        defaultCostBasePence: line.product.defaultCostBasePence,
      })),
    }]);
    group.forEach((line, index) => {
      const result = evaluated.lines[index];
      marginByLine.set(
        line,
        result?.ready && result.profitPence != null ? formatPence(result.profitPence) : '',
      );
    });
  }

  const rows = lines.map((line) => {
    return {
      invoice: line.salesInvoice.transactionNumber ?? line.salesInvoice.id.slice(0, 8),
      date: line.salesInvoice.createdAt.toISOString().slice(0, 10),
      store: line.salesInvoice.store?.name ?? '',
      customer: line.salesInvoice.customer?.name ?? 'Walk-in',
      product: line.product.name,
      sku: line.product.sku ?? '',
      qty: line.qtyInUnit,
      unit: line.unit.name,
      unitPrice: formatPence(line.unitPricePence),
      discount: formatPence(line.lineDiscountPence + line.promoDiscountPence),
      subtotal: formatPence(line.lineSubtotalPence),
      vat: formatPence(line.lineVatPence),
      total: formatPence(line.lineTotalPence),
      cost: formatPence(line.lineCostPence),
      margin: marginByLine.get(line) ?? '',
    };
  });

  const csvHeader = columns.map((c) => c.header).join(',');
  const csvRows = rows.map((row) => columns.map((c) => csvEscape((row as Record<string, string | number>)[c.key])).join(',')).join('\n');
  const csv = `${csvHeader}\n${csvRows}`;

  const format = detectExportFormat(request);
  return respondWithExport({
    format,
    csv,
    filename: 'sales',
    exportOptions: {
      businessName: business?.name ?? 'Business',
      reportTitle: 'Sales Report — Product Detail',
      dateRange: { from: dateRange.start, to: dateRange.end },
      currency: business?.currency ?? 'GHS',
      columns,
      rows,
    },
  });
}
