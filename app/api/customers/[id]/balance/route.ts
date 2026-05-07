import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Returns the outstanding (unpaid + part-paid) balance for a single customer.
 * Used by the POS at customer-selection time to power the credit-limit
 * projection ("this sale will exceed the customer's credit limit").
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const customer = await prisma.customer.findFirst({
    where: { id: params.id, businessId: user.businessId },
    select: { id: true, creditLimitPence: true },
  });
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  const arInvoices = await prisma.salesInvoice.findMany({
    where: {
      customerId: customer.id,
      paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
    },
    select: {
      totalPence: true,
      payments: { select: { amountPence: true } },
    },
  });

  const outstandingBalancePence = arInvoices.reduce((sum, inv) => {
    const paid = inv.payments.reduce((s, p) => s + p.amountPence, 0);
    return sum + Math.max(inv.totalPence - paid, 0);
  }, 0);

  return NextResponse.json({
    customerId: customer.id,
    creditLimitPence: customer.creditLimitPence,
    outstandingBalancePence,
  });
}
