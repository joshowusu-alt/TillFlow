import { describe, expect, it } from 'vitest';
import {
  OLD_FOOD_WITH_STOCK_CATEGORY,
  PROTECTED_FOOD_SWITCH_BUSINESS_ID,
  SWITCHED_FOOD_CATEGORY,
  foodBusinessSwitchDataSql,
  foodBusinessSwitchReverseSql,
  readFoodBusinessSwitchMigration,
} from '@/lib/food/switch-food-businesses';

describe('food business switch migration', () => {
  const sql = readFoodBusinessSwitchMigration();

  it('moves only the old food-with-stock type and never the named supermarket', () => {
    expect(sql).toContain(`'${OLD_FOOD_WITH_STOCK_CATEGORY}'`);
    expect(sql).toContain(`'${SWITCHED_FOOD_CATEGORY}'`);
    expect(sql).toContain(PROTECTED_FOOD_SWITCH_BUSINESS_ID);
    expect(sql).not.toMatch(/UPDATE "Product"/);
    expect(sql).not.toMatch(/UPDATE "InventoryBalance"/);
    expect(sql).not.toMatch(/UPDATE "SalesInvoice"/);
    const [insert, update] = foodBusinessSwitchDataSql(sql);
    expect(insert).toContain('ON CONFLICT ("businessId") DO NOTHING');
    expect(update).toContain('AND b."businessCategory" = \'RESTAURANT_STOCK\'');
    expect(foodBusinessSwitchReverseSql()).toContain('SET "businessCategory" = s."fromCategory"');
  });
});
