import type { Prisma } from '@prisma/client';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { UserError } from '@/lib/action-utils';
import { issueStockValue, UNVERIFIED_STOCK_V1 } from '@/lib/inventory-value';
import { upsertInventoryBalance } from '@/lib/services/shared/inventory-utils';

export type Ingredient = { productId: string; qty: number };

export async function validateIngredients(tx: Prisma.TransactionClient, businessId: string, rows: Ingredient[], recipe = false) {
  if (!Array.isArray(rows) || rows.length > 30 || rows.some(row =>
    !row || typeof row.productId !== 'string' || !Number.isFinite(row.qty) || row.qty > 1000000 ||
    (recipe ? row.qty < 0.001 || row.qty !== Math.round(row.qty * 1000) / 1000 : row.qty < 1 || !Number.isInteger(row.qty))
  )) throw new UserError(recipe ? 'Enter recipe quantities with up to three decimal places.' : 'Enter whole quantities in the stock units shown.');
  const ids = rows.map(row => row.productId);
  if (new Set(ids).size !== ids.length) throw new UserError('Add each ingredient once.');
  const products = await tx.product.findMany({
    where: { id: { in: ids }, businessId, active: true, foodDish: null },
    select: { id: true, name: true },
  });
  if (products.length !== ids.length) throw new UserError('Choose active stock products for the ingredients.');
  return new Map(products.map(product => [product.id, product.name]));
}

export async function postFoodCost(tx: Prisma.TransactionClient, input: {
  businessId: string; referenceType: string; referenceId: string; value: number; waste?: boolean;
}) {
  if (!input.value) return;
  for (const [code, name] of [[ACCOUNT_CODES.foodCosts, 'Food costs'], ...(input.waste ? [[ACCOUNT_CODES.foodWaste, 'Food waste']] : [])]) {
    const account = await tx.account.upsert({
      where: { businessId_code: { businessId: input.businessId, code } },
      create: { businessId: input.businessId, code, name, type: 'EXPENSE' },
      update: {},
    });
    if (account.type !== 'EXPENSE' || account.name !== name) throw new UserError(`Account ${code} is already used for another purpose.`);
  }
  await postJournalEntry({
    businessId: input.businessId,
    description: input.waste ? 'Cooked food waste' : 'Ingredients used',
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    prismaClient: tx as never,
    lines: [
      { accountCode: input.waste ? ACCOUNT_CODES.foodWaste : ACCOUNT_CODES.foodCosts, debitPence: input.value },
      { accountCode: input.waste ? ACCOUNT_CODES.foodCosts : ACCOUNT_CODES.inventory, creditPence: input.value },
    ],
  });
}

/** Caller locks all affected stock balances before issuing. StockBatch receipts are immutable. */
export async function issueIngredients(tx: Prisma.TransactionClient, input: {
  businessId: string; storeId: string; userId: string; referenceType: string; referenceId: string;
  rows: Ingredient[]; portions: number;
}) {
  const names = await validateIngredients(tx, input.businessId, input.rows, input.referenceType === 'FOOD_PREPARATION');
  let value = 0;
  for (const row of input.rows) {
    const qty = Math.round(row.qty * input.portions);
    if (qty === 0) throw new UserError(`This batch uses less than half a stock unit of ${names.get(row.productId)}. Add more portions or adjust the recipe.`);
    const before = await tx.inventoryBalance.findUnique({
      where: { storeId_productId: { storeId: input.storeId, productId: row.productId } },
    });
    if (!before || before.qtyOnHandBase < qty) throw new UserError(`There is not enough ${names.get(row.productId)} in stock.`);
    const issued = issueStockValue(before, qty, before.avgCostBasePence);
    if (issued.costBasis === UNVERIFIED_STOCK_V1) throw new UserError(`Record a stock cost for ${names.get(row.productId)} before using it.`);
    value += issued.costPence;
    if (value > 2147483647) throw new UserError('The ingredient cost is too large.');
    await upsertInventoryBalance(tx, input.storeId, row.productId, issued.after.qtyOnHandBase, issued.after.avgCostBasePence, issued.after);
    await tx.stockMovement.create({ data: {
      storeId: input.storeId, productId: row.productId, userId: input.userId,
      type: 'FOOD_INGREDIENT_USAGE', referenceType: input.referenceType, referenceId: input.referenceId,
      qtyBase: -qty, beforeQtyBase: before.qtyOnHandBase, afterQtyBase: issued.after.qtyOnHandBase,
      unitCostBasePence: Math.round(issued.costPence / qty), valuePence: -issued.costPence, costBasis: issued.costBasis,
    } });
  }
  await postFoodCost(tx, { ...input, value });
  return value;
}
