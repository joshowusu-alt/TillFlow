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
  let writeOff: typeof import('@/lib/food/write-off-service');

  beforeAll(async () => {
    ({ prisma: db } = await openTestPrismaClient());
    sales = await import('@/lib/services/sales');
    returns = await import('@/lib/services/returns');
    checkout = await import('@/lib/services/online-orders');
    prep = await import('@/lib/food/prepare-service');
    dishes = await import('@/lib/food/save-dish');
    expiryRunner = await import('@/lib/services/online-order-expiry-runner');
    menus = await import('@/lib/food/load-menus');
    writeOff = await import('@/lib/food/write-off-service');
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
      () => db.stockAdjustment.deleteMany({ where: { storeId } }),
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

  it('charges VAT on a sized plate, an extra, a discount and a retail bottle, and keeps the journal balanced', async () => {
    await db.business.update({ where: { id: businessId }, data: { vatEnabled: true } });
    try {
      const dish = await dishes.saveDish({
        businessId,
        draft: draft({
          name: 'VAT Jollof',
          startingPriceCedis: '15',
          stockMode: 'NOT_COUNTED',
          sizes: [
            { name: 'Small', priceCedis: '20', isDefault: false },
            { name: 'Large', priceCedis: '40', isDefault: true },
          ],
          groups: [{
            name: 'Protein',
            selection: 'SINGLE',
            required: true,
            addons: [{ name: 'chicken', priceCedis: '5', maxQty: 1, stockPortions: 0 }],
          }],
        }),
      });
      await db.product.update({ where: { id: dish.id }, data: { vatRateBps: 1500 } });
      const water = await db.product.create({
        data: {
          businessId,
          name: 'VAT water',
          sellingPriceBasePence: 300,
          defaultCostBasePence: 100,
          vatRateBps: 0,
          productUnits: { create: { unitId, isBaseUnit: true, conversionToBase: 1 } },
        },
      });
      await db.inventoryBalance.create({
        data: { storeId, productId: water.id, qtyOnHandBase: 10, avgCostBasePence: 100, knownValuePence: 1000, unvaluedQtyBase: 0 },
      });
      const catalogue = await menus.loadFoodCatalogue(businessId, [dish.id]);
      const large = catalogue.menus.get(dish.id)!.sizes.find((size) => size.name === 'Large')!;
      const chicken = catalogue.menus.get(dish.id)!.groups[0].addons[0];
      const invoice = await sales.createSale({
        businessId, storeId, tillId, cashierUserId: userId, paymentStatus: 'PAID',
        orderDiscountType: 'PERCENT', orderDiscountValue: 10,
        payments: [{ method: 'CASH', amountPence: 5198 }],
        lines: [
          {
            productId: dish.id,
            unitId: await baseUnit(dish.id),
            qtyInUnit: 1,
            plate: { sizeId: large.id, addons: [{ addonId: chicken.id, qty: 1 }], expectedPricePence: 4500 },
          },
          { productId: water.id, unitId, qtyInUnit: 2, unitPricePence: 300 },
        ],
      });
      // Plate GH₵45.00 + water GH₵6.00 = GH₵51.00. 10% off leaves GH₵45.90.
      // VAT is 15% of the plate only (GH₵6.75) scaled by the same 10%: GH₵6.08.
      expect(invoice.subtotalPence).toBe(4590);
      expect(invoice.vatPence).toBe(608);
      expect(invoice.totalPence).toBe(5198);
      const entry = await db.journalEntry.findFirstOrThrow({
        where: { referenceType: 'SALES_INVOICE', referenceId: invoice.id },
        include: { lines: { include: { account: true } } },
      });
      const debit = entry.lines.reduce((sum, line) => sum + line.debitPence, 0);
      const credit = entry.lines.reduce((sum, line) => sum + line.creditPence, 0);
      expect(debit).toBe(credit);
      expect(entry.lines.find((line) => line.account.code === '2100')?.creditPence).toBe(608);
      expect(entry.lines.find((line) => line.account.code === '4000')?.creditPence).toBe(4590);
      expect(entry.lines.find((line) => line.account.code === '1000')?.debitPence).toBe(5198);
    } finally {
      await db.business.update({ where: { id: businessId }, data: { vatEnabled: false } });
    }
  }, 60000);

  it('writes off cooked leftovers at the portion cost, and posts nothing when no cost is set', async () => {
    const dish = await dishes.saveDish({
      businessId,
      draft: draft({
        name: 'Leftover banku',
        startingPriceCedis: '20',
        stockMode: 'COUNTED',
        costPerPortionCedis: '2.50',
        inclusions: [{ name: 'ball', qty: 1, counts: true }],
      }),
    });
    await prep.addPreparedPortions({ businessId, storeId, productId: dish.id, userId, qty: 5 });
    const cashier = await db.user.create({
      data: { businessId, name: 'Cashier', email: `cashier-${Date.now()}@example.invalid`, role: 'CASHIER', passwordHash: 'fixture', active: true },
    });
    await expect(writeOff.writeOffCookedPortions({
      businessId, storeId, productId: dish.id, userId: cashier.id, userRole: 'CASHIER', qty: 1, reasonCode: 'END_OF_DAY_LEFTOVER',
    })).rejects.toThrow(/owner or a manager/i);

    const posted = await writeOff.writeOffCookedPortions({
      businessId, storeId, productId: dish.id, userId, userRole: 'OWNER', qty: 2,
      reasonCode: 'END_OF_DAY_LEFTOVER', note: 'Left after dinner', idempotencyKey: `left-${dish.id}`,
    });
    expect(posted.valuePence).toBe(500);
    expect(await onHand(dish.id)).toBe(3);
    const adjustment = await db.stockAdjustment.findUniqueOrThrow({ where: { id: posted.id } });
    expect(adjustment.direction).toBe('DECREASE');
    expect(adjustment.reasonCode).toBe('END_OF_DAY_LEFTOVER');
    expect(adjustment.qtyBase).toBe(-2);
    expect(adjustment.valuePence).toBe(500);
    expect(adjustment.userId).toBe(userId);
    await balanced(posted.id);
    const loss = await db.journalEntry.findFirstOrThrow({
      where: { referenceType: 'STOCK_ADJUSTMENT', referenceId: posted.id },
      include: { lines: { include: { account: true } } },
    });
    expect(loss.lines.find((line) => line.account.code === '5100')?.debitPence).toBe(500);
    expect(loss.lines.find((line) => line.account.code === '1200')?.creditPence).toBe(500);

    const replay = await writeOff.writeOffCookedPortions({
      businessId, storeId, productId: dish.id, userId, userRole: 'MANAGER', qty: 2,
      reasonCode: 'END_OF_DAY_LEFTOVER', idempotencyKey: `left-${dish.id}`,
    });
    expect(replay.replayed).toBe(true);
    expect(await onHand(dish.id)).toBe(3);

    await db.foodDish.update({ where: { productId: dish.id }, data: { costPerPortionPence: null } });
    const free = await writeOff.writeOffCookedPortions({
      businessId, storeId, productId: dish.id, userId, userRole: 'OWNER', qty: 1, reasonCode: 'SPOILED',
    });
    expect(free.valuePence).toBe(0);
    expect(await onHand(dish.id)).toBe(2);
    expect(await db.journalEntry.count({ where: { referenceId: free.id } })).toBe(0);
    const listed = await db.stockAdjustment.findMany({ where: { storeId, productId: dish.id } });
    expect(listed).toHaveLength(2);
  }, 60000);

  it('holds and releases a 55-line online order and rejects a tampered price without reserving stock', async () => {
    const stamp = Date.now();
    const ids: string[] = [];
    for (let index = 0; index < 55; index += 1) {
      const product = await db.product.create({
        data: {
          businessId,
          name: `Bowl ${stamp}-${index}`,
          sellingPriceBasePence: 1000,
          defaultCostBasePence: 0,
          active: true,
          storefrontPublished: true,
          productUnits: { create: { unitId, isBaseUnit: true, conversionToBase: 1 } },
        },
      });
      ids.push(product.id);
    }
    await db.foodDish.createMany({
      data: ids.map((productId) => ({ businessId, productId, stockMode: 'COUNTED', soldOut: false, lowAt: 0 })),
    });
    for (const productId of ids) {
      await prep.addPreparedPortions({ businessId, storeId, productId, userId, qty: 3 });
    }
    const dishRows = await db.foodDish.findMany({ where: { productId: { in: ids } }, select: { id: true, productId: true } });
    await db.foodAddonGroup.createMany({
      data: dishRows.map((row) => ({ dishId: row.id, name: 'Extras', selection: 'MANY', required: false, sortOrder: 0 })),
    });
    const groups = await db.foodAddonGroup.findMany({ where: { dishId: { in: dishRows.map((row) => row.id) } }, select: { id: true, dishId: true } });
    await db.foodAddon.createMany({
      data: groups.map((group) => ({ groupId: group.id, name: 'extra', pricePence: 100, maxQty: 2, stockPortions: 1, sortOrder: 0 })),
    });
    const catalogue = await menus.loadFoodCatalogue(businessId, ids);
    const slug = (await db.business.findUniqueOrThrow({ where: { id: businessId } })).storefrontSlug!;
    const items = dishRows.map((row) => {
      const extra = catalogue.menus.get(row.productId)!.groups[0].addons[0];
      return {
        productId: row.productId,
        unitId,
        qtyInUnit: 1,
        plate: { addons: [{ addonId: extra.id, qty: 1 }], expectedPricePence: 1100 },
      };
    });
    const tampered = items.map((item, index) => index === 0 ? { ...item, plate: { ...item.plate, expectedPricePence: 1 } } : item);
    await expect(checkout.createOnlineCheckout({
      slug, storeId, customerName: 'Ama', customerPhone: '0241234567',
      checkoutKey: `big-bad-${stamp}`,
      items: tampered,
    })).rejects.toThrow(/price of this/i);
    expect(await onHand(ids[0])).toBe(3);

    const started = Date.now();
    const placed = await checkout.createOnlineCheckout({
      slug, storeId, customerName: 'Ama', customerPhone: '0241234567',
      checkoutKey: `big-ok-${stamp}-abcd1234`,
      items,
    });
    const elapsed = Date.now() - started;
    const order = await db.onlineOrder.findUniqueOrThrow({ where: { id: placed.orderId }, include: { lines: true } });
    expect(order.lines).toHaveLength(55);
    expect(order.totalPence).toBe(55 * 1100);
    expect(order.lines.every((line) => line.qtyBase === 2)).toBe(true);
    for (const productId of ids) expect(await onHand(productId)).toBe(1);
    expect(elapsed).toBeLessThan(20000);

    await db.onlineOrder.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) } });
    const expired = await expiryRunner.expireOnlineOrders(businessId, order.id);
    expect(expired.expired).toBe(1);
    expect(expired.errors).toEqual([]);
    for (const productId of ids) expect(await onHand(productId)).toBe(3);
  }, 120000);
});
