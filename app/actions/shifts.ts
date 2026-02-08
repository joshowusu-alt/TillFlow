'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function openShiftAction(formData: FormData) {
  const user = await requireUser();
  const tillId = String(formData.get('tillId') || '');
  const openingCash = Math.round(Number(formData.get('openingCash') || 0) * 100);

  if (!tillId) {
    throw new Error('Till is required');
  }

  // Check if there's already an open shift for this till
  const existingShift = await prisma.shift.findFirst({
    where: { tillId, status: 'OPEN' }
  });

  if (existingShift) {
    throw new Error('There is already an open shift for this till');
  }

  const shift = await prisma.shift.create({
    data: {
      tillId,
      userId: user.id,
      openingCashPence: openingCash,
      status: 'OPEN'
    }
  });

  revalidatePath('/shifts');
  return { id: shift.id };
}

export async function closeShiftAction(formData: FormData) {
  const user = await requireUser();
  const shiftId = String(formData.get('shiftId') || '');
  const actualCash = Math.round(Number(formData.get('actualCash') || 0) * 100);
  const notes = String(formData.get('notes') || '');

  if (!shiftId) {
    throw new Error('Shift ID is required');
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: {
      salesInvoices: {
        include: { payments: true }
      }
    }
  });

  if (!shift) {
    throw new Error('Shift not found');
  }

  if (shift.status !== 'OPEN') {
    throw new Error('Shift is already closed');
  }

  // Calculate expected cash from sales during this shift
  let cashTotal = shift.openingCashPence;
  let cardTotal = 0;
  let transferTotal = 0;

  for (const invoice of shift.salesInvoices) {
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
      notes: notes || null,
      status: 'CLOSED'
    }
  });

  revalidatePath('/shifts');
  return { success: true };
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
