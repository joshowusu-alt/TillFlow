import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth';

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
        method: 'CASH' | 'CARD' | 'TRANSFER';
        amountPence: number;
    }>;
    orderDiscountType: string;
    orderDiscountValue: string;
    createdAt: string;
}

export async function POST(request: NextRequest) {
    try {
        const user = await getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const payload = await request.json() as OfflineSalePayload;

        const business = await prisma.business.findFirst();
        if (!business) {
            return NextResponse.json({ error: 'Business not found' }, { status: 404 });
        }

        // Check if this offline sale was already synced (by checking referenceId pattern)
        const existingSale = await prisma.salesInvoice.findFirst({
            where: {
                businessId: business.id,
                // We encode the offline ID in a way we can check
                createdAt: {
                    gte: new Date(payload.createdAt),
                    lte: new Date(new Date(payload.createdAt).getTime() + 1000) // 1 second window
                },
                storeId: payload.storeId,
                tillId: payload.tillId
            }
        });

        if (existingSale) {
            // Already synced, return success
            return NextResponse.json({
                success: true,
                message: 'Sale already synced',
                invoiceId: existingSale.id
            });
        }

        // Fetch products for price calculations
        const productIds = payload.lines.map((l) => l.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            include: { productUnits: true }
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        // Calculate line totals
        let subtotalPence = 0;
        let vatPence = 0;
        let discountPence = 0;

        const lineData = payload.lines.map((line) => {
            const product = productMap.get(line.productId);
            if (!product) throw new Error(`Product ${line.productId} not found`);

            const productUnit = product.productUnits.find((pu) => pu.unitId === line.unitId);
            const conversionToBase = productUnit?.conversionToBase ?? 1;
            const qtyBase = line.qtyInUnit * conversionToBase;
            const unitPricePence = conversionToBase * product.sellingPriceBasePence;
            const lineSubtotalPence = unitPricePence * line.qtyInUnit;

            // Calculate line discount
            let lineDiscountPence = 0;
            if (line.discountType === 'PERCENT' && line.discountValue) {
                const pct = Math.min(Math.max(parseFloat(line.discountValue) || 0, 0), 100);
                lineDiscountPence = Math.round((lineSubtotalPence * pct) / 100);
            } else if (line.discountType === 'AMOUNT' && line.discountValue) {
                lineDiscountPence = Math.min(Math.round(parseFloat(line.discountValue) * 100) || 0, lineSubtotalPence);
            }

            const netSubtotal = lineSubtotalPence - lineDiscountPence;
            const lineVatPence = business.vatEnabled
                ? Math.round((netSubtotal * product.vatRateBps) / 10000)
                : 0;
            const lineTotalPence = netSubtotal + lineVatPence;

            subtotalPence += lineSubtotalPence;
            vatPence += lineVatPence;
            discountPence += lineDiscountPence;

            return {
                productId: line.productId,
                unitId: line.unitId,
                qtyInUnit: line.qtyInUnit,
                conversionToBase,
                qtyBase,
                unitPricePence,
                lineDiscountPence,
                promoDiscountPence: 0,
                lineSubtotalPence: netSubtotal,
                lineVatPence,
                lineTotalPence
            };
        });

        // Calculate order-level discount
        const netAfterLineDiscount = subtotalPence - discountPence;
        let orderDiscountPence = 0;
        if (payload.orderDiscountType === 'PERCENT' && payload.orderDiscountValue) {
            const pct = Math.min(Math.max(parseFloat(payload.orderDiscountValue) || 0, 0), 100);
            orderDiscountPence = Math.round((netAfterLineDiscount * pct) / 100);
        } else if (payload.orderDiscountType === 'AMOUNT' && payload.orderDiscountValue) {
            orderDiscountPence = Math.min(Math.round(parseFloat(payload.orderDiscountValue) * 100) || 0, netAfterLineDiscount);
        }

        const totalPence = netAfterLineDiscount - orderDiscountPence + vatPence;

        // Create the sale
        const invoice = await prisma.salesInvoice.create({
            data: {
                businessId: business.id,
                storeId: payload.storeId,
                tillId: payload.tillId,
                cashierUserId: user.id,
                customerId: payload.customerId || null,
                paymentStatus: payload.paymentStatus,
                discountPence: discountPence + orderDiscountPence,
                subtotalPence: subtotalPence - discountPence - orderDiscountPence,
                vatPence,
                totalPence,
                createdAt: new Date(payload.createdAt),
                lines: {
                    create: lineData
                },
                payments: {
                    create: payload.payments.map((p) => ({
                        method: p.method,
                        amountPence: p.amountPence
                    }))
                }
            }
        });

        // Update inventory
        for (const line of lineData) {
            await prisma.inventoryBalance.updateMany({
                where: {
                    storeId: payload.storeId,
                    productId: line.productId
                },
                data: {
                    qtyOnHandBase: { decrement: line.qtyBase }
                }
            });

            await prisma.stockMovement.create({
                data: {
                    storeId: payload.storeId,
                    productId: line.productId,
                    qtyBase: -line.qtyBase,
                    type: 'SALE',
                    referenceType: 'SalesInvoice',
                    referenceId: invoice.id,
                    userId: user.id
                }
            });
        }

        return NextResponse.json({
            success: true,
            invoiceId: invoice.id
        });
    } catch (error) {
        console.error('Sync sale error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to sync sale' },
            { status: 500 }
        );
    }
}
