import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { DEMO_PRODUCTS } from '@/lib/demo-fixtures/products';
import {
  ADOM_RETAIL_DEMO_NAME,
  ADOM_RETAIL_DEMO_SLUG,
  DEMO_SANDBOX_QA_TAG,
} from './constants';

const DEMO_OWNER_EMAIL = 'demo-owner@tillflow.sample';
const DEMO_OWNER_PASSWORD = 'DemoShop2026!';

/**
 * Idempotent seed for the optional live storefront preview (/shop/adom-retail-demo).
 * Public /demo/* uses in-memory fixtures and does not require this seed.
 */
export async function seedAdomRetailDemoBusiness(): Promise<{ businessId: string; created: boolean }> {
  const existing = await prisma.business.findFirst({
    where: { OR: [{ storefrontSlug: ADOM_RETAIL_DEMO_SLUG }, { name: ADOM_RETAIL_DEMO_NAME, isDemo: true }] },
  });

  let businessId = existing?.id;
  let created = false;

  if (!existing) {
    const business = await prisma.business.create({
      data: {
        name: ADOM_RETAIL_DEMO_NAME,
        currency: 'GHS',
        isDemo: true,
        storefrontSlug: ADOM_RETAIL_DEMO_SLUG,
        storefrontEnabled: true,
        phone: '0200-000-000',
        address: 'Sample Street, Accra (demo only)',
        businessCategory: 'SUPERMARKET',
        plan: 'GROWTH',
        selectedPlan: 'GROWTH',
        subscriptionStatus: 'ACTIVE',
        planStatus: 'ACTIVE',
        timezone: 'Africa/Accra',
      },
    });
    businessId = business.id;
    created = true;
  } else {
    await prisma.business.update({
      where: { id: existing.id },
      data: {
        isDemo: true,
        storefrontSlug: ADOM_RETAIL_DEMO_SLUG,
        storefrontEnabled: true,
        name: ADOM_RETAIL_DEMO_NAME,
      },
    });
    businessId = existing.id;
  }

  if (!businessId) throw new Error('Demo business id missing after seed');

  const store =
    (await prisma.store.findFirst({ where: { businessId, isMainStore: true } })) ??
    (await prisma.store.create({
      data: { businessId, name: 'Main branch', isMainStore: true },
    }));

  const pieceUnit =
    (await prisma.unit.findFirst({ where: { name: 'Piece' } })) ??
    (await prisma.unit.create({
      data: { name: 'Piece', pluralName: 'Pieces', symbol: 'pc' },
    }));

  let owner = await prisma.user.findFirst({
    where: { businessId, email: DEMO_OWNER_EMAIL },
  });
  if (!owner) {
    const hash = await bcrypt.hash(DEMO_OWNER_PASSWORD, 10);
    owner = await prisma.user.create({
      data: {
        businessId,
        email: DEMO_OWNER_EMAIL,
        name: 'Demo Owner',
        role: 'OWNER',
        passwordHash: hash,
        active: true,
      },
    });
  }

  const categoryNames = [...new Set(DEMO_PRODUCTS.map((p) => p.categoryId))];
  const categoryMap = new Map<string, string>();
  for (const catKey of categoryNames) {
    const label = catKey.replace('CAT-', 'Category ');
    const row = await prisma.category.upsert({
      where: { businessId_name: { businessId, name: label } },
      create: { businessId, name: label },
      update: {},
    });
    categoryMap.set(catKey, row.id);
  }

  const subset = DEMO_PRODUCTS.slice(0, 60);
  for (const p of subset) {
    const existing = await prisma.product.findFirst({
      where: { OR: [{ barcode: p.barcode }, { businessId, name: p.name }] },
    });
    const product = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: {
            businessId,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            sellingPriceBasePence: p.sellingPricePence,
            defaultCostBasePence: p.costPricePence,
            reorderPointBase: p.reorderPoint,
            vatRateBps: p.vatRateBps,
            categoryId: categoryMap.get(p.categoryId) ?? null,
            qaTag: DEMO_SANDBOX_QA_TAG,
            storefrontPublished: true,
          },
        })
      : await prisma.product.create({
          data: {
            businessId,
            sku: p.sku,
            barcode: p.barcode,
            name: p.name,
            sellingPriceBasePence: p.sellingPricePence,
            defaultCostBasePence: p.costPricePence,
            reorderPointBase: p.reorderPoint,
            vatRateBps: p.vatRateBps,
            categoryId: categoryMap.get(p.categoryId) ?? null,
            qaTag: DEMO_SANDBOX_QA_TAG,
            storefrontPublished: true,
          },
        });

    await prisma.productUnit.upsert({
      where: { productId_unitId: { productId: product.id, unitId: pieceUnit.id } },
      create: {
        productId: product.id,
        unitId: pieceUnit.id,
        isBaseUnit: true,
        conversionToBase: 1,
      },
      update: {},
    });

    await prisma.inventoryBalance.upsert({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
      create: {
        storeId: store.id,
        productId: product.id,
        qtyOnHandBase: p.openingQty,
        avgCostBasePence: p.costPricePence,
      },
      update: { qtyOnHandBase: p.openingQty },
    });
  }

  return { businessId, created };
}
