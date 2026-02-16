'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { formString } from '@/lib/form-helpers';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';

export async function openShiftAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const tillId = formString(formData, 'tillId');
    const openingCash = Math.round(Number(formData.get('openingCash') || 0) * 100);

    if (!tillId) return err('Please select a till first.');

    const till = await prisma.till.findFirst({
      where: { id: tillId, store: { businessId } },
      select: { id: true },
    });
    if (!till) return err('Till not found for your business.');

    const existingShift = await prisma.shift.findFirst({
      where: { tillId: till.id, status: 'OPEN' }
    });
    if (existingShift) return err('There is already an open shift for this till');

    const shift = await prisma.shift.create({
      data: {
        tillId: till.id,
        userId: user.id,
        openingCashPence: openingCash,
        status: 'OPEN'
      }
    });

    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'SHIFT_OPEN', entity: 'Shift', entityId: shift.id, details: { tillId: till.id, openingCash } });

    revalidatePath('/shifts');
    return ok({ id: shift.id });
  });
}

export async function closeShiftAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext();

    const shiftId = formString(formData, 'shiftId');
    const actualCash = Math.round(Number(formData.get('actualCash') || 0) * 100);
    const notes = formString(formData, 'notes') || null;

    if (!shiftId) return err('Could not find the shift. Please refresh and try again.');

    const shift = await prisma.shift.findFirst({
      where: {
        id: shiftId,
        till: { store: { businessId } },
      },
      include: { salesInvoices: { include: { payments: true } } }
    });
    if (!shift) return err('That shift could not be found. It may have been removed.');
    if (shift.status !== 'OPEN') return err('Shift is already closed');

    // Calculate expected totals by payment method
    let cashTotal = shift.openingCashPence;
    let cardTotal = 0;
    let transferTotal = 0;
    let momoTotal = 0;
    for (const invoice of shift.salesInvoices) {
      for (const payment of invoice.payments) {
        if (payment.method === 'CASH') cashTotal += payment.amountPence;
        else if (payment.method === 'CARD') cardTotal += payment.amountPence;
        else if (payment.method === 'TRANSFER') transferTotal += payment.amountPence;
        else if (payment.method === 'MOBILE_MONEY') momoTotal += payment.amountPence;
      }
    }

    const variance = actualCash - cashTotal;

    await prisma.shift.update({
      where: { id: shift.id },
      data: {
        closedAt: new Date(),
        expectedCashPence: cashTotal,
        actualCashPence: actualCash,
        cardTotalPence: cardTotal,
        transferTotalPence: transferTotal,
        momoTotalPence: momoTotal,
        variance,
        notes,
        status: 'CLOSED'
      }
    });

    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'SHIFT_CLOSE', entity: 'Shift', entityId: shift.id, details: { variance, actualCash, expectedCash: cashTotal } });

    revalidatePath('/shifts');
    return ok({ id: shift.id });
  });
}

export async function getOpenShift(tillId: string) {
  const { businessId } = await withBusinessContext();
  return prisma.shift.findFirst({
    where: { tillId, status: 'OPEN', till: { store: { businessId } } },
    include: {
      user: { select: { name: true } },
      till: { select: { name: true } }
    }
  });
}

export async function getShiftSummary(shiftId: string) {
  const { businessId } = await withBusinessContext();
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, till: { store: { businessId } } },
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
  let momoTotal = 0;
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
      } else if (payment.method === 'MOBILE_MONEY') {
        momoTotal += payment.amountPence;
      }
    }
  }

  return {
    ...shift,
    salesCount,
    salesTotal,
    expectedCash: cashTotal,
    cardTotal,
    transferTotal,
    momoTotal
  };
}
