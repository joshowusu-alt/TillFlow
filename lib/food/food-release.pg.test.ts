/**
 * Throwaway-Postgres stress of the food release.
 * Skipped unless the guarded test database is local Postgres.
 * Never points at Neon or production.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import { rankRecognisedProductSales } from '@/lib/reports/product-rank';
import { summarizeInventoryRisk } from '@/lib/reports/operational-metrics';
import type { DishDraft } from '@/lib/food/dish-draft';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: () => undefined,
  revalidatePath: () => undefined,
}));
vi.mock('@/lib/services/risk-monitor', () => ({
  detectExcessiveDiscountRisk: vi.fn().mockResolvedValue(undefined),
  detectNegativeMarginRisk: vi.fn().mockResolvedValue(undefined),
  detectVoidFrequencyRisk: vi.fn().mockResolvedValue(undefined),
}));

const describePg = canRunLivePostgresTests() ? describe : describe.skip;

function draft(partial: Partial<DishDraft> & { name: string; startingPriceCedis: string }): DishDraft {
  return {
    estimatedCostCedis: '',
    description: '',
    showOnline: true,
    stockMode: 'NOT_COUNTED',
    soldOut: false,
    lowAt: 0,
    sizes: [],
    inclusions: [],
    groups: [],
    ...partial,
  };
}

describePg('food release stress on throwaway Postgres', () => {
  let db: PrismaClient;
  let businessId = '';
  let storeId = '';
  let userId = '';
  let tillId = '';
  let unitId = '';
  let sales: typeof import('@/lib/services/sales');
  let returns: typeof import('@/lib/services/returns');
  let checkout: typeof import('@/lib/services/online-orders');
  let prep: typeof import('@/lib/food/prepare-service');
  let dishes: typeof import('@/lib/food/save-dish');
  let expiryRunner: typeof import('@/lib/services/online-order-expiry-runner');
  let menus: typeof import('@/lib/food/load-menus');

  beforeAll(async () => {
    ({ prisma: db } = await openTestPrismaClient());
    sales = await import('@/lib/services/sales');
    returns = await import('@/lib/services/returns');
    checkout = await import('@/lib/services/online-orders');
    prep = await import('@/lib/food/prepare-service');
    dishes = await import('@/lib/food/save-dish');
    expiryRunner = await import('@/lib/services/online-order-expiry-runner');
    menus = await import('@/lib/food/load-menus');
    const { ensureChartOfAccounts } = await import('@/lib/accounting');
    const stamp = Date.now();
    businessId = (await db.business.create({
      data: {
        name: `Food stress ${stamp}`,
        currency: 'GHS',
        businessCategory: 'FOOD_DISHES',
        vatEnabled: false,
        timezone: 'Africa/Accra',
        plan: 'PRO',
        storefrontEnabled: true,
        storefrontSlug: `food-stress-${stamp}`,
        storefrontPaymentMode: 'MOMO_NUMBER',
        storefrontMomoNumber: '0241234567',
        storefrontMomoNetwork: 'MTN',
        addonOnlineStorefront: true,
        discountApprovalThresholdBps: 5000,
      },
    })).id;
    storeId = (await db.store.create({ data: { businessId, name: 'Kitchen' } })).id;
    userId = (await db.user.create({
      data: {
        businessId,
        name: 'Owner',
        email: `food-stress-${stamp}@example.invalid`,
        role: 'OWNER',
        passwordHash: 'fixture',
        active: true,
      },
    })).id;
    tillId = (await db.till.create({ data: { storeId, name: 'Counter' } })).id;
    await db.shift.create({ data: { tillId, userId, status: 'OPEN', openKey: tillId } });
    unitId = (await db.unit.create({ data: { name: `Plate ${stamp}`, pluralName: 'Plates' } })).id;
    await ensureChartOfAccounts(businessId, db);
  }, 120000);

  afterAll(async () => {
    if (!db || !businessId) return;
    await runTestTeardown(db, [
      () => db.salesReturn.deleteMany({ where: { salesInvoice: { businessId } } }),
      () => db.onlineOrder.deleteMany({ where: { businessId } }),
      () => db.salesInvoice.deleteMany({ where: { businessId } }),
      () => db.foodPreparation.deleteMany({ where: { businessId } }),
      () => db.stockMovement.deleteMany({ where: { store: { businessId } } }),
      () => db.stockBatch.deleteMany({ where: { businessId } }),
      () => db.inventoryBalance.deleteMany({ where: { store: { businessId } } }),
      () => db.journalEntry.deleteMany({ where: { businessId } }),
      () => db.foodDish.deleteMany({ where: { businessId } }),
      () => db.product.deleteMany({ where: { businessId } }),
      () => db.cashDrawerEntry.deleteMany({ where: { businessId } }),
      () => db.businessSequence.deleteMany({ where: { businessId } }),
      () => db.account.deleteMany({ where: { businessId } }),
      () => db.shift.deleteMany({ where: { tillId } }),
      () => db.till.deleteMany({ where: { storeId } }),
      () => db.store.deleteMany({ where: { businessId } }),
      () => db.unit.deleteMany({ where: { id: unitId } }),
      () => db.user.deleteMany({ where: { businessId } }),
      () => db.business.delete({ where: { id: businessId } }),
    ]);
  }, 120000);

  async function balanced(referenceId: string) {
    const entries = await db.journalEntry.findMany({
      where: { businessId, referenceId },
      include: { lines: true },
    });
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.lines.reduce((sum, line) => sum + line.debitPence - line.creditPence, 0)).toBe(0);
    }
  }

  async function onHand(productId: string) {
    const row = await db.inventoryBalance.findUnique({ where: { storeId_productId: { storeId, productId } } });
    return row?.qtyOnHandBase ?? 0;
  }

  async function baseUnit(productId: string) {
    const row = await db.productUnit.findFirstOrThrow({ where: { productId, isBaseUnit: true } });
    return row.unitId;
  }

  it('sells sized plates, free extras, quantity, a retail line, a discount, and a balanced ledger', async () => {
    const banku = await dishes.saveDish({
      businessId,
      draft: draft({
        name: 'Banku',
        startingPriceCedis: '25',
        estimatedCostCedis: '10',
        stockMode: 'COUNTED',
        lowAt: 3,
        inclusions: [{ name: 'bowl of banku', qty: 1, counts: true }],
        groups: [{
          name: 'Extras',
          selection: 'MANY',
          required: false,
          addons: [
            { name: 'extra banku', priceCedis: '5', maxQty: 3, stockPortions: 1 },
            { name: 'pepper', priceCedis: '0', maxQty: 2, stockPortions: 0 },
          ],
        }],
      }),
    });
    const jollof = await dishes.saveDish({
      businessId,
      draft: draft({
        name: 'Jollof',
        startingPriceCedis: '15',
        stockMode: 'NOT_COUNTED',
        sizes: [
          { name: 'Small', priceCedis: '20', isDefault: false },
          { name: 'Medium', priceCedis: '30', isDefault: true },
          { name: 'Large', priceCedis: '40', isDefault: false },
        ],
        groups: [{
          name: 'Protein',
          selection: 'SINGLE',
          required: true,
          addons: [
            { name: 'chicken', priceCedis: '15', maxQty: 1, stockPortions: 0 },
            { name: 'goat', priceCedis: '20', maxQty: 1, stockPortions: 0 },
          ],
        }],
      }),
    });
    const water = await db.product.create({
      data: {
        businessId,
        name: 'Water',
        sellingPriceBasePence: 300,
        defaultCostBasePence: 100,
        productUnits: { create: { unitId, isBaseUnit: true, conversionToBase: 1 } },
      },
    });
    await db.inventoryBalance.create({
      data: { storeId, productId: water.id, qtyOnHandBase: 20, avgCostBasePence: 100, knownValuePence: 2000, unvaluedQtyBase: 0 },
    });
    await prep.addPreparedPortions({ businessId, storeId, productId: banku.id, userId, qty: 8, note: 'lunch pot' });
    const journalsAfterPrep = await db.journalEntry.count({ where: { businessId } });
    expect(await onHand(banku.id)).toBe(8);

    const catalogue = await menus.loadFoodCatalogue(businessId, [banku.id, jollof.id]);
    const extra = catalogue.menus.get(banku.id)!.groups[0].addons.find((addon) => addon.name === 'extra banku')!;
    const pepper = catalogue.menus.get(banku.id)!.groups[0].addons.find((addon) => addon.name === 'pepper')!;
    const large = catalogue.menus.get(jollof.id)!.sizes.find((size) => size.name === 'Large')!;
    const chicken = catalogue.menus.get(jollof.id)!.groups[0].addons.find((addon) => addon.name === 'chicken')!;

    const invoice = await sales.createSale({
      businessId,
      storeId,
      tillId,
      cashierUserId: userId,
      paymentStatus: 'PAID',
      orderDiscountType: 'PERCENT',
      orderDiscountValue: 10,
      payments: [{ method: 'CASH', amountPence: 10890 }],
      lines: [
        { productId: banku.id, unitId: await baseUnit(banku.id), qtyInUnit: 2, plate: { addons: [{ addonId: extra.id, qty: 1 }, { addonId: pepper.id, qty: 1 }] } },
        { productId: jollof.id, unitId: await baseUnit(jollof.id), qtyInUnit: 1, plate: { sizeId: large.id, addons: [{ addonId: chicken.id, qty: 1 }] } },
        { productId: water.id, unitId, qtyInUnit: 2 },
      ],
    });

    // 2 x (25 + 5 + 0) = 60, large jollof 40 + chicken 15 = 55, water 3 x 2 = 6. Subtotal 121 cedis, 10% off = 108.90? 
    // Wait pesewas: banku 3000 * 2 = 6000, jollof 5500, water 600. Subtotal 12100. 10% = 1210. Total 10890.
    // I passed 9900 which is wrong. The test will fail and I'll correct the payment after seeing the error.
    expect(invoice.totalPence).toBe(10890);
    const lines = await db.salesInvoiceLine.findMany({ where: { salesInvoiceId: invoice.id }, orderBy: { createdAt: 'asc' } });
    const bankuLine = lines.find((line) => line.productId === banku.id)!;
    const jollofLine = lines.find((line) => line.productId === jollof.id)!;
    expect(bankuLine.qtyBase).toBe(4);
    expect(bankuLine.unitPricePence).toBe(3000);
    expect(JSON.parse(bankuLine.plateSnapshotJson!).addons.map((addon: { name: string }) => addon.name)).toEqual(['extra banku', 'pepper']);
    expect(jollofLine.qtyBase).toBe(0);
    expect(jollofLine.unitPricePence).toBe(5500);
    expect(await onHand(banku.id)).toBe(4);
    expect(await onHand(water.id)).toBe(18);
    const ranked = rankRecognisedProductSales({
      paymentStatus: 'PAID',
      discountPence: invoice.discountPence,
      vatPence: invoice.vatPence,
      totalPence: invoice.totalPence,
      lines: lines.map((line) => ({
        productId: line.productId,
        lineSubtotalPence: line.lineSubtotalPence,
        lineDiscountPence: line.lineDiscountPence,
        promoDiscountPence: line.promoDiscountPence,
        lineVatPence: line.lineVatPence,
        lineTotalPence: line.lineTotalPence,
      })),
    });
    expect(ranked.ok).toBe(true);
    expect(ranked.lines.reduce((sum, line) => sum + line.amountPence, 0)).toBe(invoice.totalPence);
    const bankuRank = ranked.lines.find((line) => line.productId === banku.id)!.amountPence;
    expect(bankuRank).toBeGreaterThan(5000);
    expect(bankuRank).toBeLessThan(7000);
    await balanced(invoice.id);
    const prepJournals = await db.journalEntry.count({ where: { businessId, description: { contains: 'Inventory increase' } } });
    expect(prepJournals).toBe(0);
    expect(await db.journalEntry.count({ where: { businessId } })).toBeGreaterThan(journalsAfterPrep);

    const snapshot = bankuLine.plateSnapshotJson;
    await dishes.saveDish({
      businessId,
      draft: draft({
        productId: banku.id,
        name: 'Banku',
        startingPriceCedis: '25',
        stockMode: 'COUNTED',
        lowAt: 3,
        inclusions: [{ name: 'bowl of banku', qty: 1, counts: true }],
        groups: [{
          name: 'Extras',
          selection: 'MANY',
          required: false,
          addons: [{ name: 'extra banku', priceCedis: '7', maxQty: 2, stockPortions: 1 }],
        }],
      }),
    });
    const afterEdit = await db.salesInvoiceLine.findUniqueOrThrow({ where: { id: bankuLine.id } });
    expect(afterEdit.plateSnapshotJson).toBe(snapshot);
    expect(afterEdit.unitPricePence).toBe(3000);

    await db.product.update({ where: { id: jollof.id }, data: { active: false } });
    await expect(sales.createSale({
      businessId, storeId, tillId, cashierUserId: userId, paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 2000 }],
      lines: [{ productId: jollof.id, unitId: await baseUnit(jollof.id), qtyInUnit: 1, plate: { addons: [{ addonId: chicken.id, qty: 1 }] } }],
    })).rejects.toThrow(/no longer on the menu/i);
  }, 60000);

  it('rejects a tampered online price, an unknown extra, and a sold-out dish, and releases a reservation on expiry', async () => {
    const dish = await dishes.saveDish({
      businessId,
      draft: draft({
        name: 'Kenkey',
        startingPriceCedis: '10',
        stockMode: 'COUNTED',
        showOnline: true,
        inclusions: [{ name: 'ball', qty: 1, counts: true }],
        groups: [{
          name: 'Extras',
          selection: 'MANY',
          required: false,
          addons: [{ name: 'extra kenkey', priceCedis: '4', maxQty: 2, stockPortions: 1 }],
        }],
      }),
    });
    await prep.addPreparedPortions({ businessId, storeId, productId: dish.id, userId, qty: 5 });
    const catalogue = await menus.loadFoodCatalogue(businessId, [dish.id]);
    const extra = catalogue.menus.get(dish.id)!.groups[0].addons[0];
    const slug = (await db.business.findUniqueOrThrow({ where: { id: businessId } })).storefrontSlug!;

    await expect(checkout.createOnlineCheckout({
      slug, storeId, customerName: 'Ama', customerPhone: '0241234567',
      items: [{ productId: dish.id, unitId: await baseUnit(dish.id), qtyInUnit: 1, plate: { addons: [{ addonId: extra.id, qty: 1 }], expectedPricePence: 100 } }],
    })).rejects.toThrow(/price of this Kenkey plate changed/i);
    expect(await onHand(dish.id)).toBe(5);

    await expect(checkout.createOnlineCheckout({
      slug, storeId, customerName: 'Ama', customerPhone: '0241234567',
      items: [{ productId: dish.id, unitId: await baseUnit(dish.id), qtyInUnit: 1, plate: { addons: [{ addonId: 'missing-addon', qty: 1 }] } }],
    })).rejects.toThrow(/no longer on the menu/i);

    const placed = await checkout.createOnlineCheckout({
      slug, storeId, customerName: 'Ama', customerPhone: '0241234567',
      checkoutKey: `kenkey-${Date.now()}-abcd1234`,
      items: [{ productId: dish.id, unitId: await baseUnit(dish.id), qtyInUnit: 1, plate: { addons: [{ addonId: extra.id, qty: 1 }], expectedPricePence: 1400 } }],
    });
    expect(await onHand(dish.id)).toBe(3);
    const order = await db.onlineOrder.findUniqueOrThrow({ where: { id: placed.orderId }, include: { lines: true } });
    expect(order.totalPence).toBe(1400);
    expect(order.lines[0].qtyBase).toBe(2);

    await db.onlineOrder.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) } });
    const expired = await expiryRunner.expireOnlineOrders(businessId, order.id);
    expect(expired.expired).toBe(1);
    expect(expired.errors).toEqual([]);
    expect(await onHand(dish.id)).toBe(5);
    expect((await db.onlineOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('EXPIRED');

    const plain = await dishes.saveDish({
      businessId,
      draft: draft({ name: 'Sobolo', startingPriceCedis: '5', stockMode: 'NOT_COUNTED', soldOut: true, showOnline: true }),
    });
    await expect(checkout.createOnlineCheckout({
      slug, storeId, customerName: 'Ama', customerPhone: '0241234567',
      items: [{ productId: plain.id, unitId: await baseUnit(plain.id), qtyInUnit: 3 }],
    })).rejects.toThrow(/sold out/i);
  }, 60000);

  it('lets only one of two simultaneous sales take the last portion', async () => {
    const dish = await dishes.saveDish({
      businessId,
      draft: draft({
        name: 'Waakye',
        startingPriceCedis: '12',
        stockMode: 'COUNTED',
        inclusions: [{ name: 'pack', qty: 1, counts: true }],
      }),
    });
    await prep.addPreparedPortions({ businessId, storeId, productId: dish.id, userId, qty: 1 });
    const sellUnit = await baseUnit(dish.id);
    const attempt = () => sales.createSale({
      businessId, storeId, tillId, cashierUserId: userId, paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 1200 }],
      lines: [{ productId: dish.id, unitId: sellUnit, qtyInUnit: 1 }],
    });
    const results = await Promise.allSettled([attempt(), attempt()]);
    if (results.every((result) => result.status === 'rejected')) {
      throw new Error(results.map((result) => result.status === 'rejected' ? String(result.reason) : '').join(' | '));
    }
    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result) => result.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(await onHand(dish.id)).toBe(0);
  }, 60000);

  it('returns a counted plate once and keeps an expiring retail batch separate from cooked portions', async () => {
    const dish = await dishes.saveDish({
      businessId,
      draft: draft({
        name: 'Fufu',
        startingPriceCedis: '20',
        stockMode: 'COUNTED',
        lowAt: 4,
        inclusions: [{ name: 'pound', qty: 1, counts: true }],
      }),
    });
    await prep.addPreparedPortions({ businessId, storeId, productId: dish.id, userId, qty: 3 });
    const invoice = await sales.createSale({
      businessId, storeId, tillId, cashierUserId: userId, paymentStatus: 'PAID',
      payments: [{ method: 'CASH', amountPence: 2000 }],
      lines: [{ productId: dish.id, unitId: await baseUnit(dish.id), qtyInUnit: 1 }],
    });
    expect(await onHand(dish.id)).toBe(2);
    await returns.createSalesReturn({
      businessId,
      salesInvoiceId: invoice.id,
      userId,
      type: 'VOID',
      reasonCode: 'WRONG_ITEM_SCANNED',
      managerApprovedByUserId: userId,
      refundMethod: 'CASH',
    });
    expect(await onHand(dish.id)).toBe(3);
    const rice = await db.product.create({
      data: {
        businessId,
        name: 'Rice',
        sellingPriceBasePence: 1000,
        defaultCostBasePence: 400,
        reorderPointBase: 2,
        productUnits: { create: { unitId, isBaseUnit: true, conversionToBase: 1 } },
      },
    });
    await db.inventoryBalance.create({
      data: { storeId, productId: rice.id, qtyOnHandBase: 6, avgCostBasePence: 400, knownValuePence: 2400, unvaluedQtyBase: 0 },
    });
    await db.stockBatch.create({
      data: {
        businessId,
        storeId,
        productId: rice.id,
        qtyReceivedBase: 6,
        expiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        source: 'PURCHASE',
      },
    });
    const { loadExpiryReport } = await import('@/lib/inventory/load-expiry-report');
    const report = await loadExpiryReport(db, { businessId, storeIds: [storeId], timeZone: 'Africa/Accra' });
    expect(report.rows.map((row) => row.productName)).toEqual(['Rice']);
    expect(report.counts.within7).toBeGreaterThan(0);
    const balances = await db.inventoryBalance.findMany({
      where: { storeId, productId: { in: [dish.id, rice.id] } },
      include: { product: { select: { reorderPointBase: true } } },
    });
    const risk = summarizeInventoryRisk(balances.map((row) => ({
      qtyOnHandBase: row.qtyOnHandBase,
      reorderPointBase: row.product.reorderPointBase,
    })));
    const fufu = balances.find((row) => row.productId === dish.id);
    const riceRow = balances.find((row) => row.productId === rice.id);
    expect(fufu?.qtyOnHandBase).toBe(3);
    expect(fufu?.product.reorderPointBase).toBe(4);
    expect(riceRow?.qtyOnHandBase).toBe(6);
    expect(riceRow?.product.reorderPointBase).toBe(2);
    expect(risk.urgentReorderCount).toBe(1);
    expect(risk.totalTrackedProducts).toBe(2);
  }, 60000);

  it('loads 200 dishes in one menu query', async () => {
    const stamp = Date.now();
    const ids: string[] = [];
    for (let index = 0; index < 200; index += 1) {
      const product = await db.product.create({
        data: {
          businessId,
          name: `Dish ${stamp}-${index}`,
          sellingPriceBasePence: 1000 + index,
          defaultCostBasePence: 0,
          active: true,
          storefrontPublished: true,
          productUnits: { create: { unitId, isBaseUnit: true, conversionToBase: 1 } },
        },
      });
      ids.push(product.id);
    }
    await db.foodDish.createMany({
      data: ids.map((productId) => ({ businessId, productId, stockMode: 'NOT_COUNTED', soldOut: false, lowAt: 0 })),
    });
    const dishRows = await db.foodDish.findMany({ where: { productId: { in: ids } }, select: { id: true } });
    await db.foodAddonGroup.createMany({
      data: dishRows.map((row, index) => ({ dishId: row.id, name: 'Extras', selection: 'MANY', required: false, sortOrder: index })),
    });
    const groups = await db.foodAddonGroup.findMany({ where: { dishId: { in: dishRows.map((row) => row.id) } }, select: { id: true } });
    await db.foodAddon.createMany({
      data: groups.flatMap((group) => [0, 1, 2].map((addon) => ({
        groupId: group.id,
        name: `extra ${addon}`,
        pricePence: addon * 100,
        maxQty: 2,
        stockPortions: 0,
        sortOrder: addon,
      }))),
    });
    const started = Date.now();
    const loaded = await menus.loadFoodCatalogue(businessId, ids);
    const elapsed = Date.now() - started;
    expect(loaded.menus.size).toBe(200);
    expect([...loaded.menus.values()].every((menu) => menu.groups[0].addons.length === 3)).toBe(true);
    expect(elapsed).toBeLessThan(3000);
  }, 60000);
});
