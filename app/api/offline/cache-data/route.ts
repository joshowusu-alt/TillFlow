import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth';

export async function GET() {
    try {
        const user = await getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const business = await prisma.business.findFirst({
            select: {
                id: true,
                currency: true,
                vatEnabled: true
            }
        });

        if (!business) {
            return NextResponse.json({ error: 'Business not found' }, { status: 404 });
        }

        const store = await prisma.store.findFirst({
            select: {
                id: true,
                name: true,
                tills: {
                    where: { active: true },
                    select: { id: true, name: true }
                }
            }
        });

        if (!store) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        const inventory = await prisma.inventoryBalance.findMany({
            where: { storeId: store.id },
            select: { productId: true, qtyOnHandBase: true }
        });
        const inventoryMap = new Map(inventory.map((item) => [item.productId, item.qtyOnHandBase]));

        const products = await prisma.product.findMany({
            where: { businessId: business.id, active: true },
            select: {
                id: true,
                name: true,
                barcode: true,
                sellingPriceBasePence: true,
                vatRateBps: true,
                promoBuyQty: true,
                promoGetQty: true,
                productUnits: {
                    select: {
                        unitId: true,
                        conversionToBase: true,
                        isBaseUnit: true,
                        unit: {
                            select: {
                                id: true,
                                name: true,
                                pluralName: true
                            }
                        }
                    }
                }
            }
        });

        const productDtos = products.map((product) => ({
            id: product.id,
            name: product.name,
            barcode: product.barcode,
            sellingPriceBasePence: product.sellingPriceBasePence,
            vatRateBps: product.vatRateBps,
            promoBuyQty: product.promoBuyQty,
            promoGetQty: product.promoGetQty,
            onHandBase: inventoryMap.get(product.id) ?? 0,
            units: product.productUnits.map((pu) => ({
                id: pu.unit.id,
                name: pu.unit.name,
                pluralName: pu.unit.pluralName,
                conversionToBase: pu.conversionToBase,
                isBaseUnit: pu.isBaseUnit
            }))
        }));

        const customers = await prisma.customer.findMany({
            where: { businessId: business.id },
            select: { id: true, name: true }
        });

        return NextResponse.json({
            products: productDtos,
            business: {
                id: business.id,
                currency: business.currency,
                vatEnabled: business.vatEnabled
            },
            store: {
                id: store.id,
                name: store.name
            },
            customers: customers.map((c) => ({ id: c.id, name: c.name })),
            tills: store.tills.map((t) => ({ id: t.id, name: t.name }))
        });
    } catch (error) {
        console.error('Cache data error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch cache data' },
            { status: 500 }
        );
    }
}
