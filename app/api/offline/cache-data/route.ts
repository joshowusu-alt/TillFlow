import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth';
import { checkCacheDataRateLimit } from '@/lib/security/sync-throttle';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const user = await getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const requestedBusinessId = request.nextUrl.searchParams.get('businessId');
        if (requestedBusinessId && requestedBusinessId !== user.businessId) {
            return NextResponse.json({ error: 'Business scope mismatch' }, { status: 403 });
        }

        const throttle = await checkCacheDataRateLimit(user.id);
        if (throttle.blocked) {
            return NextResponse.json(
                { error: 'Too many cache refresh requests. Please wait before retrying.' },
                { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds ?? 3600) } }
            );
        }

        const business = await prisma.business.findUnique({
            where: { id: user.businessId },
            select: {
                id: true,
                currency: true,
                vatEnabled: true
            }
        });

        if (!business) {
            return NextResponse.json({ error: 'Business not found' }, { status: 404 });
        }

        const requestedStoreId = request.nextUrl.searchParams.get('storeId');
        const availableStores = requestedStoreId
            ? []
            : await prisma.store.findMany({
                where: { businessId: business.id },
                select: { id: true, name: true },
                orderBy: { name: 'asc' }
            });

        const resolvedStoreId =
            requestedStoreId
                ?? (availableStores.length === 1 ? availableStores[0]?.id : null);

        if (!resolvedStoreId) {
            return NextResponse.json(
                { error: 'Store scope required for offline cache refresh' },
                { status: 400 }
            );
        }

        const store = await prisma.store.findFirst({
            where: { id: resolvedStoreId, businessId: business.id },
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
                        sellingPricePence: true,
                        defaultCostPence: true,
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
            businessId: business.id,
            storeId: store.id,
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
                isBaseUnit: pu.isBaseUnit,
                sellingPricePence: pu.sellingPricePence,
                defaultCostPence: pu.defaultCostPence
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
                businessId: business.id,
                id: store.id,
                name: store.name
            },
            customers: customers.map((c) => ({ businessId: business.id, id: c.id, name: c.name })),
            tills: store.tills.map((t) => ({ businessId: business.id, storeId: store.id, id: t.id, name: t.name }))
        });
    } catch (error) {
        console.error('[cache-data] error:', error);
        return NextResponse.json(
            { error: 'An internal error occurred' },
            { status: 500 }
        );
    }
}
