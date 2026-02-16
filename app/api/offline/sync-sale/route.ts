import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth';
import { createSale, type DiscountType } from '@/lib/services/sales';
import type { PaymentStatus } from '@/lib/services/shared';

export const dynamic = 'force-dynamic';

interface OfflineSalePayload {
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

function parseDiscountValue(type: DiscountType, raw: unknown): number {
    if (type === 'PERCENT') {
        const pct = Number(raw);
        if (Number.isNaN(pct)) return 0;
        return Math.min(Math.max(pct, 0), 100);
    }
    if (type === 'AMOUNT') {
        const amount = Number(raw);
        if (Number.isNaN(amount)) return 0;
        return Math.max(Math.round(amount * 100), 0);
    }
    return 0;
}

function toDiscountType(value: unknown): DiscountType {
    if (value === 'PERCENT' || value === 'AMOUNT') return value;
    return 'NONE';
}

function toPaymentStatus(value: unknown): PaymentStatus {
    if (value === 'PAID' || value === 'PART_PAID' || value === 'UNPAID') return value;
    return 'PAID';
}

export async function POST(request: NextRequest) {
    try {
        const user = await getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const payload = await request.json() as OfflineSalePayload;
        if (!payload?.id || !payload.storeId || !payload.tillId || !Array.isArray(payload.lines)) {
            return NextResponse.json({ error: 'Invalid offline payload' }, { status: 400 });
        }

        const store = await prisma.store.findFirst({
            where: { id: payload.storeId, businessId: user.businessId },
            select: { id: true }
        });
        if (!store) {
            return NextResponse.json({ error: 'Store not found' }, { status: 400 });
        }

        const till = await prisma.till.findFirst({
            where: { id: payload.tillId, storeId: store.id, active: true },
            select: { id: true }
        });
        if (!till) {
            return NextResponse.json({ error: 'Till not found' }, { status: 400 });
        }

        if (payload.customerId) {
            const customer = await prisma.customer.findFirst({
                where: { id: payload.customerId, businessId: user.businessId },
                select: { id: true }
            });
            if (!customer) {
                return NextResponse.json({ error: 'Customer not found' }, { status: 400 });
            }
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
            return NextResponse.json({
                success: true,
                message: 'Sale already synced',
                invoiceId: existingSale.id
            });
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
            return NextResponse.json({ error: 'No valid sale lines to sync' }, { status: 400 });
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

        return NextResponse.json({
            success: true,
            invoiceId: invoice.id
        });
    } catch (error) {
        console.error('Sync sale error:', error);
        if (error instanceof Error) {
            const message = error.message;
            if (
                message.includes('not found') ||
                message.includes('No items') ||
                message.includes('Insufficient stock') ||
                message.includes('required')
            ) {
                return NextResponse.json({ error: message }, { status: 400 });
            }
        }
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to sync sale' },
            { status: 500 }
        );
    }
}
