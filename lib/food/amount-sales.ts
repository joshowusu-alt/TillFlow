import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function summarizeAmountSales(scope: Prisma.SalesInvoiceWhereInput) {
  const groups = await prisma.salesInvoiceLine.groupBy({
    by: ['salesInvoiceId'],
    where: {
      customAmountPence: { not: null },
      salesInvoice: { AND: [scope, { paymentStatus: { notIn: ['RETURNED', 'VOID'] } }] },
    },
    _sum: { lineTotalPence: true },
  });
  return { count: groups.length, totalPence: groups.reduce((total, row) => total + (row._sum.lineTotalPence ?? 0), 0) };
}
