'use server';

import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

/** Get (or create) the demo business. */
export async function getDemoBusiness() {
  return prisma.business.findFirst({ where: { isDemo: true } });
}

/**
 * Seed a demo business with sample products, customers, and a few sales.
 * Idempotent: if the demo business already exists, just returns it.
 */
export async function seedDemoAction(): Promise<{ ok: boolean; businessId?: string; error?: string }> {
  // Must be an OWNER/MANAGER of a real business to trigger seeding
  const { business: callerBusiness } = await requireBusiness(['OWNER', 'MANAGER']);
  if (!callerBusiness) return { ok: false, error: 'Unauthorized' };

  const existing = await getDemoBusiness();
  if (existing) return { ok: true, businessId: existing.id };

  const demo = await prisma.business.create({
    data: {
      name: '🛒 Demo Supermarket',
      currency: 'GHS',
      vatEnabled: true,
      vatNumber: 'DEMO-VAT-0000',
      mode: 'ADVANCED',
      momoEnabled: true,
      momoProvider: 'MTN',
      momoNumber: '0240000000',
      isDemo: true,
    },
  });

  // Create a default store
  const store = await prisma.store.create({
    data: { businessId: demo.id, name: 'Demo Main Store', address: 'Accra, Ghana' },
  });

  // Create categories
  const [groceries, beverages, household] = await Promise.all([
    prisma.category.create({ data: { businessId: demo.id, name: 'Groceries', colour: '#22c55e' } }),
    prisma.category.create({ data: { businessId: demo.id, name: 'Beverages', colour: '#3b82f6' } }),
    prisma.category.create({ data: { businessId: demo.id, name: 'Household', colour: '#f59e0b' } }),
  ]);

  // Create units
  const unit = await prisma.unit.findFirst({ where: { name: 'Each' } }) ??
    await prisma.unit.create({ data: { name: 'Each', pluralName: 'Each', symbol: 'ea' } });

  // Create sample products
  const productsData = [
    { name: 'Cowbell Milk 400g', categoryId: groceries.id, sellingPriceBasePence: 2400, defaultCostBasePence: 1800, vatRateBps: 0, barcode: 'DEMO001' },
    { name: 'Milo 400g', categoryId: groceries.id, sellingPriceBasePence: 3500, defaultCostBasePence: 2800, vatRateBps: 0, barcode: 'DEMO002' },
    { name: 'Voltic Water 1.5L', categoryId: beverages.id, sellingPriceBasePence: 500, defaultCostBasePence: 300, vatRateBps: 0, barcode: 'DEMO003' },
    { name: 'Coca-Cola 1L', categoryId: beverages.id, sellingPriceBasePence: 800, defaultCostBasePence: 550, vatRateBps: 0, barcode: 'DEMO004' },
    { name: 'Fan Ice 2L', categoryId: beverages.id, sellingPriceBasePence: 1200, defaultCostBasePence: 900, vatRateBps: 0, barcode: 'DEMO005' },
    { name: 'Indomie Noodles (pack)', categoryId: groceries.id, sellingPriceBasePence: 600, defaultCostBasePence: 400, vatRateBps: 0, barcode: 'DEMO006' },
    { name: 'Sunlight Dishwashing Liquid', categoryId: household.id, sellingPriceBasePence: 1500, defaultCostBasePence: 1000, vatRateBps: 1500, barcode: 'DEMO007' },
    { name: 'Omo Detergent 500g', categoryId: household.id, sellingPriceBasePence: 1800, defaultCostBasePence: 1200, vatRateBps: 1500, barcode: 'DEMO008' },
    { name: 'Tom Brown 1kg', categoryId: groceries.id, sellingPriceBasePence: 2800, defaultCostBasePence: 2000, vatRateBps: 0, barcode: 'DEMO009' },
    { name: 'Pineapple Juice 500ml', categoryId: beverages.id, sellingPriceBasePence: 700, defaultCostBasePence: 480, vatRateBps: 0, barcode: 'DEMO010' },
  ];

  for (const p of productsData) {
    const product = await prisma.product.create({
      data: {
        businessId: demo.id,
        name: p.name,
        barcode: p.barcode,
        categoryId: p.categoryId,
        sellingPriceBasePence: p.sellingPriceBasePence,
        defaultCostBasePence: p.defaultCostBasePence,
        vatRateBps: p.vatRateBps,
      },
    });
    await prisma.productUnit.create({
      data: { productId: product.id, unitId: unit.id, conversionToBase: 1, isBaseUnit: true },
    });
    await prisma.inventoryBalance.create({
      data: { storeId: store.id, productId: product.id, qtyOnHandBase: 200 },
    });
  }

  revalidatePath('/demo');
  return { ok: true, businessId: demo.id };
}

/**
 * Reset demo data: delete all sales, re-stock inventory to 200 units.
 * Called nightly by the cron reset job.
 */
export async function resetDemoAction(): Promise<{ ok: boolean; error?: string }> {
  const demo = await getDemoBusiness();
  if (!demo) return { ok: false, error: 'Demo business not found' };

  const storeIds = (await prisma.store.findMany({ where: { businessId: demo.id }, select: { id: true } })).map((s) => s.id);

  // Delete sales data
  await prisma.$transaction([
    prisma.salesInvoiceLine.deleteMany({ where: { salesInvoice: { businessId: demo.id } } }),
    prisma.salesInvoice.deleteMany({ where: { businessId: demo.id } }),
    prisma.mobileMoneyCollection.deleteMany({ where: { businessId: demo.id } }),
    prisma.cashDrawerEntry.deleteMany({ where: { store: { businessId: demo.id } } }),
  ]);

  // Restore stock levels
  await prisma.inventoryBalance.updateMany({
    where: { storeId: { in: storeIds } },
    data: { qtyOnHandBase: 200 },
  });

  revalidatePath('/demo');
  return { ok: true };
}
