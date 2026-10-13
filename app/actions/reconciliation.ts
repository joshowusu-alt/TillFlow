'use server';

import {
  withBusinessContext,
  safeAction,
  formAction,
  ok,
  err,
} from '@/lib/action-utils';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { formString, formPence, formOptionalString } from '@/lib/form-helpers';
import { buildPaymentReconciliationRows } from '@/lib/reports/payment-reconciliation';
import type { ActionResult } from '@/lib/action-utils';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { localDateInstant, requireReportTimeZone } from '@/lib/reports/reporting-clock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReconciliationRow = {
  storeId: string;
  date: string;
  method: string;
  systemTotalPence: number;
  actualTotalPence: number | null;
  variancePence: number | null;
  status: string;
  id: string | null;
};

export type ReconciliationTransaction = {
  id: string;
  amountPence: number;
  reference: string | null;
  receivedAt: Date;
  salesInvoiceId: string;
  invoiceCreatedAt: Date;
  customerName: string | null;
};

// ---------------------------------------------------------------------------
// getReconciliationSummary
// ---------------------------------------------------------------------------

export async function getReconciliationSummary(params: {
  from: Date;
  to: Date;
  storeId?: string;
}): Promise<ActionResult<ReconciliationRow[]>> {
  return safeAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER'], { requireWrite: false });
    const { from, to, storeId } = params;
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const zone = requireReportTimeZone(business?.timezone);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return err('Invalid date range');
    const start = from;
    const endExclusive = to;
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(to.getTime()) || start >= to) return err('Invalid date range');

    // Get all stores for this business if no specific store
    const stores = storeId
      ? [{ id: storeId }]
      : await prisma.store.findMany({
          where: { businessId },
          select: { id: true },
        });

    const storeIds = stores.map((s) => s.id);

    // Query SalesPayment grouped by date and method (CARD/TRANSFER) via SalesInvoice
    const payments = await prisma.salesPayment.findMany({
      where: {
        method: { in: ['CARD', 'TRANSFER'] },
        status: 'CONFIRMED',
        receivedAt: { gte: start, lt: endExclusive },
        salesInvoice: {
          businessId,
          storeId: { in: storeIds },
        },
      },
      select: {
        method: true,
        amountPence: true,
        receivedAt: true,
        salesInvoice: {
          select: { storeId: true, createdAt: true },
        },
      },
    });

    // Get existing reconciliation records
    const existing = await prisma.paymentReconciliation.findMany({
      where: {
        businessId,
        storeId: { in: storeIds },
        date: { gte: start, lt: endExclusive },
      },
    });

    const rows = buildPaymentReconciliationRows(payments, existing, zone);
    return ok(rows);
  });
}

// ---------------------------------------------------------------------------
// reconcilePaymentAction
// ---------------------------------------------------------------------------

export async function reconcilePaymentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const dateStr = formString(formData, 'date');
    const paymentMethod = formString(formData, 'paymentMethod');
    const storeId = formString(formData, 'storeId');
    const actualTotalPence = formPence(formData, 'actualTotal');
    const notes = formOptionalString(formData, 'notes');

    if (!dateStr || !paymentMethod || !storeId) {
      return err('Missing required fields');
    }
    if (!['CARD', 'TRANSFER'].includes(paymentMethod)) {
      return err('Invalid payment method');
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const zone = requireReportTimeZone(business?.timezone);
    const date = localDateInstant(dateStr, 'start', zone);
    if (!date || formatBusinessLocalDateKey(date, zone) !== dateStr) return err('Invalid date');
    if (!Number.isSafeInteger(actualTotalPence) || actualTotalPence < 0 || actualTotalPence > 2147483647 || !formString(formData, 'actualTotal') || !Number.isFinite(Number(formString(formData, 'actualTotal').replace(/,/g, '')))) return err('Enter a valid non-negative statement total');
    const store = await prisma.store.findFirst({ where: { id: storeId, businessId }, select: { id: true } });
    if (!store) return err('Branch not found');
    const dayEndExclusive = localDateInstant(dateStr, 'endExclusive', zone) ?? date;

    // Calculate system total for that date/method/store
    const payments = await prisma.salesPayment.findMany({
      where: {
        method: paymentMethod,
        status: 'CONFIRMED',
        receivedAt: { gte: date, lt: dayEndExclusive },
        salesInvoice: {
          businessId,
          storeId,
        },
      },
      select: { amountPence: true },
    });
    const systemTotalPence = payments.reduce((sum, p) => sum + p.amountPence, 0);

    const variancePence = actualTotalPence - systemTotalPence;
    const status = variancePence === 0 ? 'RECONCILED' : 'DISCREPANCY';

    await prisma.paymentReconciliation.upsert({
      where: {
        businessId_storeId_date_paymentMethod: {
          businessId,
          storeId,
          date,
          paymentMethod,
        },
      },
      create: {
        businessId,
        storeId,
        date,
        paymentMethod,
        systemTotalPence,
        actualTotalPence,
        variancePence,
        status,
        reconciledByUserId: user.id,
        reconciledAt: new Date(),
        notes,
      },
      update: {
        systemTotalPence,
        actualTotalPence,
        variancePence,
        status,
        reconciledByUserId: user.id,
        reconciledAt: new Date(),
        notes,
      },
    });

    revalidatePath('/payments/reconciliation/card-transfer');
    return ok();
  }, '/payments/reconciliation/card-transfer');
}

// ---------------------------------------------------------------------------
// getPaymentTransactions
// ---------------------------------------------------------------------------

export async function getPaymentTransactions(params: {
  date: Date;
  method: string;
  storeId?: string;
}): Promise<ActionResult<ReconciliationTransaction[]>> {
  return safeAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER'], { requireWrite: false });
    const { date, method, storeId } = params;
    if (!['CARD', 'TRANSFER'].includes(method) || !Number.isFinite(date.getTime())) return err('Invalid date or payment method');

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const zone = requireReportTimeZone(business?.timezone);
    const dayKey = formatBusinessLocalDateKey(date, zone);
    const dayStart = localDateInstant(dayKey, 'start', zone) ?? date;
    const dayEndExclusive = localDateInstant(dayKey, 'endExclusive', zone) ?? date;

    const storeFilter = storeId
      ? { storeId }
      : {};

    const payments = await prisma.salesPayment.findMany({
      where: {
        method,
        status: 'CONFIRMED',
        receivedAt: { gte: dayStart, lt: dayEndExclusive },
        salesInvoice: {
          businessId,
          ...storeFilter,
        },
      },
      select: {
        id: true,
        amountPence: true,
        reference: true,
        receivedAt: true,
        salesInvoice: {
          select: {
            id: true,
            createdAt: true,
            customer: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { receivedAt: 'desc' },
    });

    const transactions: ReconciliationTransaction[] = payments.map((p) => ({
      id: p.id,
      amountPence: p.amountPence,
      reference: p.reference,
      receivedAt: p.receivedAt,
      salesInvoiceId: p.salesInvoice.id,
      invoiceCreatedAt: p.salesInvoice.createdAt,
      customerName: p.salesInvoice.customer?.name ?? null,
    }));

    return ok(transactions);
  });
}
