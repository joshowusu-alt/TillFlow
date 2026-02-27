import { prisma } from '@/lib/prisma';
import { createSale, type DiscountType } from '@/lib/services/sales';
import type { PaymentStatus } from '@/lib/services/shared';
import { parseDiscountValue } from '@/lib/format';

export interface OfflineSalePayload {
    id: string;
    storeId: string;
    tillId: string;
    customerId: string | null;
    paymentStatus: 'PAID' | 'PART_PAID' | 'UNPAID';
    lines: Array<{
        productId: string;
        unitId: string;
        qtyInUnit: number;
        discountType: string;
        discountValue: string;
    }>;
    payments: Array<{
        method: 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';
        amountPence: number;
    }>;
    orderDiscountType: string;
    orderDiscountValue: string;
    createdAt: string;
}

function toDiscountType(value: unknown): DiscountType {
    if (value === 'PERCENT' || value === 'AMOUNT') return value;
    return 'NONE';
}

function toPaymentStatus(value: unknown): PaymentStatus {
    if (value === 'PAID' || value === 'PART_PAID' || value === 'UNPAID') return value;
    return 'PAID';
}

export interface ProcessResult {
    success: true;
    invoiceId: string;
    message?: string;
}

/**
 * Process a single offline sale payload. Shared by both the single sync-sale
 * route and the batch-sync route.
 */
export async function processOfflineSale(
    payload: OfflineSalePayload,
    user: { id: string; businessId: string }
): Promise<ProcessResult> {
    if (!payload?.id || !payload.storeId || !payload.tillId || !Array.isArray(payload.lines)) {
        throw new Error('Invalid offline payload');
    }

    const store = await prisma.store.findFirst({
        where: { id: payload.storeId, businessId: user.businessId },
        select: { id: true }
    });
    if (!store) throw new Error('Store not found');

    const till = await prisma.till.findFirst({
        where: { id: payload.tillId, storeId: store.id, active: true },
        select: { id: true }
    });
    if (!till) throw new Error('Till not found');

    if (payload.customerId) {
        const customer = await prisma.customer.findFirst({
            where: { id: payload.customerId, businessId: user.businessId },
            select: { id: true }
        });
        if (!customer) throw new Error('Customer not found');
    }

    const externalRef = `OFFLINE_SYNC:${payload.id}`;
    const existingSale = await prisma.salesInvoice.findFirst({
        where: {
            businessId: user.businessId,
            payments: { some: { reference: externalRef } }
        },
        select: { id: true }
    });
    if (existingSale) {
        return { success: true, invoiceId: existingSale.id, message: 'Sale already synced' };
    }

    const lines = payload.lines
        .map((line) => {
            const qtyInUnit = Math.floor(Number(line.qtyInUnit));
            const discountType = toDiscountType(line.discountType);
            return {
                productId: String(line.productId || ''),
                unitId: String(line.unitId || ''),
                qtyInUnit,
                discountType,
                discountValue: parseDiscountValue(discountType, line.discountValue)
            };
        })
        .filter((line) => line.productId && line.unitId && line.qtyInUnit > 0);

    if (lines.length === 0) {
        throw new Error('No valid sale lines to sync');
    }

    const payments = Array.isArray(payload.payments)
        ? payload.payments
            .map((payment) => ({
                method: payment.method,
                amountPence: Math.max(0, Math.round(Number(payment.amountPence) || 0)),
                reference: externalRef
            }))
            .filter((payment) => payment.amountPence > 0)
        : [];

    const orderDiscountType = toDiscountType(payload.orderDiscountType);
    const orderDiscountValue = parseDiscountValue(orderDiscountType, payload.orderDiscountValue);
    const createdAt = payload.createdAt ? new Date(payload.createdAt) : null;
    const safeCreatedAt =
        createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null;

    const invoice = await createSale({
        businessId: user.businessId,
        storeId: store.id,
        tillId: till.id,
        cashierUserId: user.id,
        customerId: payload.customerId || null,
        paymentStatus: toPaymentStatus(payload.paymentStatus),
        dueDate: null,
        orderDiscountType,
        orderDiscountValue,
        externalRef,
        createdAt: safeCreatedAt,
        payments,
        lines
    });

    return { success: true, invoiceId: invoice.id };
}
