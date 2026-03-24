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
import type { ActionResult } from '@/lib/action-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReconciliationRow = {
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
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const { from, to, storeId } = params;

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
        salesInvoice: {
          businessId,
          storeId: { in: storeIds },
          createdAt: { gte: from, lte: to },
        },
      },
      select: {
        method: true,
        amountPence: true,
        salesInvoice: {
          select: { storeId: true, createdAt: true },
        },
      },
    });

    // Group by date + method + storeId
    const systemMap = new Map<string, number>();
    for (const p of payments) {
      const dateKey = p.salesInvoice.createdAt.toISOString().slice(0, 10);
      const key = `${p.salesInvoice.storeId}|${dateKey}|${p.method}`;
      systemMap.set(key, (systemMap.get(key) ?? 0) + p.amountPence);
    }

    // Get existing reconciliation records
    const existing = await prisma.paymentReconciliation.findMany({
      where: {
        businessId,
        storeId: { in: storeIds },
        date: { gte: from, lte: to },
      },
    });

    const reconMap = new Map<string, (typeof existing)[0]>();
    for (const r of existing) {
      const dateKey = r.date.toISOString().slice(0, 10);
      const key = `${r.storeId}|${dateKey}|${r.paymentMethod}`;
      reconMap.set(key, r);
    }

    // Merge: all unique date+method combos
    const allKeys = new Set([...systemMap.keys(), ...reconMap.keys()]);
    const rows: ReconciliationRow[] = [];

    for (const key of allKeys) {
      const [, dateStr, method] = key.split('|');
      const systemTotal = systemMap.get(key) ?? 0;
      const recon = reconMap.get(key);

      rows.push({
        date: dateStr,
        method,
        systemTotalPence: recon?.systemTotalPence ?? systemTotal,
        actualTotalPence: recon?.actualTotalPence ?? null,
        variancePence: recon?.variancePence ?? null,
        status: recon?.status ?? 'PENDING',
        id: recon?.id ?? null,
      });
    }

    // Sort by date desc, then method
    rows.sort((a, b) => b.date.localeCompare(a.date) || a.method.localeCompare(b.method));
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

    const date = new Date(dateStr + 'T00:00:00.000Z');
    const dayEnd = new Date(dateStr + 'T23:59:59.999Z');

    // Calculate system total for that date/method/store
    const payments = await prisma.salesPayment.findMany({
      where: {
        method: paymentMethod,
        salesInvoice: {
          businessId,
          storeId,
          createdAt: { gte: date, lte: dayEnd },
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
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const { date, method, storeId } = params;

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const storeFilter = storeId
      ? { storeId }
      : {};

    const payments = await prisma.salesPayment.findMany({
      where: {
        method,
        salesInvoice: {
          businessId,
          ...storeFilter,
          createdAt: { gte: dayStart, lte: dayEnd },
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
