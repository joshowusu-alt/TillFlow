'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { formString } from '@/lib/form-helpers';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';

export async function openShiftAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user } = await withBusinessContext();

    const tillId = formString(formData, 'tillId');
    const openingCash = Math.round(Number(formData.get('openingCash') || 0) * 100);

    if (!tillId) return err('Till is required');

    const existingShift = await prisma.shift.findFirst({
      where: { tillId, status: 'OPEN' }
    });
    if (existingShift) return err('There is already an open shift for this till');

    const shift = await prisma.shift.create({
      data: {
        tillId,
        userId: user.id,
        openingCashPence: openingCash,
        status: 'OPEN'
      }
    });

    revalidatePath('/shifts');
    return ok({ id: shift.id });
  });
}

export async function closeShiftAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    await withBusinessContext();

    const shiftId = formString(formData, 'shiftId');
    const actualCash = Math.round(Number(formData.get('actualCash') || 0) * 100);
    const notes = formString(formData, 'notes') || null;

    if (!shiftId) return err('Shift ID is required');

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: { salesInvoices: { include: { payments: true } } }
    });
    if (!shift) return err('Shift not found');
    if (shift.status !== 'OPEN') return err('Shift is already closed');

    // Calculate expected totals by payment method
    let cashTotal = shift.openingCashPence;
    let cardTotal = 0;
    let transferTotal = 0;
    for (const invoice of shift.salesInvoices) {
      for (const payment of invoice.payments) {
        if (payment.method === 'CASH') cashTotal += payment.amountPence;
        else if (payment.method === 'CARD') cardTotal += payment.amountPence;
        else if (payment.method === 'TRANSFER') transferTotal += payment.amountPence;
      }
    }

    const variance = actualCash - cashTotal;

    await prisma.shift.update({
      where: { id: shiftId },
      data: {
        closedAt: new Date(),
        expectedCashPence: cashTotal,
        actualCashPence: actualCash,
        cardTotalPence: cardTotal,
        transferTotalPence: transferTotal,
        variance,
        notes,
        status: 'CLOSED'
      }
    });

    revalidatePath('/shifts');
    return ok({ id: shiftId });
  });
}

export async function getOpenShift(tillId: string) {
  return prisma.shift.findFirst({
    where: { tillId, status: 'OPEN' },
    include: {
      user: { select: { name: true } },
      till: { select: { name: true } }
    }
  });
}

export async function getShiftSummary(shiftId: string) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      user: { select: { name: true } },
      till: { select: { name: true } },
      salesInvoices: {
        include: { payments: true, lines: true }
      }
    }
  });

  if (!shift) return null;

  let cashTotal = shift.openingCashPence;
  let cardTotal = 0;
  let transferTotal = 0;
  let salesCount = 0;
  let salesTotal = 0;

  for (const invoice of shift.salesInvoices) {
    salesCount++;
    salesTotal += invoice.totalPence;
    for (const payment of invoice.payments) {
      if (payment.method === 'CASH') {
        cashTotal += payment.amountPence;
      } else if (payment.method === 'CARD') {
        cardTotal += payment.amountPence;
      } else if (payment.method === 'TRANSFER') {
        transferTotal += payment.amountPence;
      }
    }
  }

  return {
    ...shift,
    salesCount,
    salesTotal,
    expectedCash: cashTotal,
    cardTotal,
    transferTotal
  };
}
