import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { canRunLivePostgresTests, openTestPrismaClient, runTestTeardown } from '@/lib/test/test-prisma';
import {
  PROTECTED_FOOD_SWITCH_BUSINESS_ID,
  foodBusinessSwitchDataSql,
  foodBusinessSwitchReverseSql,
} from '@/lib/food/switch-food-businesses';

const describePg = canRunLivePostgresTests() ? describe : describe.skip;

describePg('food business switch on throwaway Postgres', () => {
  let db: PrismaClient;
  const ids: string[] = [];

  beforeAll(async () => {
    ({ prisma: db } = await openTestPrismaClient());
  });

  afterAll(async () => {
    if (!db) return;
    await runTestTeardown(db, [
      () => db.product.deleteMany({ where: { businessId: { in: ids } } }),
      () => db.foodBusinessTypeSwitch.deleteMany({ where: { businessId: { in: ids } } }),
      () => db.business.deleteMany({ where: { id: { in: ids } } }),
    ]);
  });

  async function business(id: string, category: string) {
    ids.push(id);
    return db.business.create({
      data: { id, name: id, currency: 'GHS', businessCategory: category, plan: 'STARTER' },
    });
  }

  it('switches old food businesses once, leaves everyone else, and can be reversed', async () => {
    await db.foodBusinessTypeSwitch.deleteMany({ where: { businessId: PROTECTED_FOOD_SWITCH_BUSINESS_ID } });
    await db.business.deleteMany({ where: { id: PROTECTED_FOOD_SWITCH_BUSINESS_ID } });
    const food = await business(`food-switch-${Date.now()}`, 'RESTAURANT_STOCK');
    const supermarket = await business(`market-switch-${Date.now()}`, 'SUPERMARKET');
    const bookshop = await business(`books-switch-${Date.now()}`, 'OTHER');
    const protectedFood = await business(PROTECTED_FOOD_SWITCH_BUSINESS_ID, 'RESTAURANT_STOCK');
    const product = await db.product.create({
      data: { businessId: food.id, name: 'Existing rice', sellingPriceBasePence: 1234, defaultCostBasePence: 400 },
    });

    const [insert, update] = foodBusinessSwitchDataSql();
    await db.$executeRawUnsafe(insert);
    await db.$executeRawUnsafe(update);
    await db.$executeRawUnsafe(insert);
    await db.$executeRawUnsafe(update);

    expect((await db.business.findUniqueOrThrow({ where: { id: food.id } })).businessCategory).toBe('FOOD_DISHES');
    expect((await db.business.findUniqueOrThrow({ where: { id: supermarket.id } })).businessCategory).toBe('SUPERMARKET');
    expect((await db.business.findUniqueOrThrow({ where: { id: bookshop.id } })).businessCategory).toBe('OTHER');
    expect((await db.business.findUniqueOrThrow({ where: { id: protectedFood.id } })).businessCategory).toBe('RESTAURANT_STOCK');
    const kept = await db.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(kept.sellingPriceBasePence).toBe(1234);
    expect(kept.name).toBe('Existing rice');
    const log = await db.foodBusinessTypeSwitch.findMany({ where: { businessId: { in: ids } } });
    expect(log.map((row) => row.businessId)).toEqual([food.id]);
    expect(log[0].fromCategory).toBe('RESTAURANT_STOCK');

    for (const statement of foodBusinessSwitchReverseSql().split(';').map((part) => part.trim()).filter(Boolean)) {
      await db.$executeRawUnsafe(statement);
    }
    expect((await db.business.findUniqueOrThrow({ where: { id: food.id } })).businessCategory).toBe('RESTAURANT_STOCK');
    expect(await db.foodBusinessTypeSwitch.count({ where: { businessId: food.id } })).toBe(0);
    expect((await db.business.findUniqueOrThrow({ where: { id: protectedFood.id } })).businessCategory).toBe('RESTAURANT_STOCK');
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).sellingPriceBasePence).toBe(1234);
  }, 60000);
});
