import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Supermarket that must never be reclassified, even if its category were ever wrong. */
export const PROTECTED_FOOD_SWITCH_BUSINESS_ID = 'cmmttryrq00015gcwrix832dg';

export const OLD_FOOD_WITH_STOCK_CATEGORY = 'RESTAURANT_STOCK';
export const SWITCHED_FOOD_CATEGORY = 'FOOD_DISHES';

const MIGRATION_PATH = 'prisma/migrations/20261114120000_food_business_switch/migration.sql';

export function readFoodBusinessSwitchMigration(): string {
  return readFileSync(join(process.cwd(), MIGRATION_PATH), 'utf8');
}

/** The data statements, in order. Schema statements are left to Prisma migrate. */
export function foodBusinessSwitchDataSql(sql = readFoodBusinessSwitchMigration()): string[] {
  const insert = sql.match(
    /^INSERT INTO "FoodBusinessTypeSwitch"[\s\S]*?ON CONFLICT \("businessId"\) DO NOTHING;/m,
  )?.[0];
  const update = sql.match(
    /^UPDATE "Business" AS b[\s\S]*?AND b\."id" <> 'cmmttryrq00015gcwrix832dg';/m,
  )?.[0];
  if (!insert || !update) {
    throw new Error('The food-business switch migration is missing its data statements.');
  }
  return [insert, update];
}

/**
 * Puts a switched business back on "Food business with stock".
 * Harmless when the business was not switched, or has since chosen another type:
 * the category is restored only when it is still the type this step wrote.
 */
export function foodBusinessSwitchReverseSql(): string {
  return `
UPDATE "Business" AS b
SET "businessCategory" = s."fromCategory"
FROM "FoodBusinessTypeSwitch" AS s
WHERE b."id" = s."businessId"
  AND b."businessCategory" = s."toCategory"
  AND b."id" <> '${PROTECTED_FOOD_SWITCH_BUSINESS_ID}';
DELETE FROM "FoodBusinessTypeSwitch" AS s
WHERE s."businessId" <> '${PROTECTED_FOOD_SWITCH_BUSINESS_ID}';
`.trim();
}
