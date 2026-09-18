import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('owner walkthrough permission matrix (server-side)', () => {
  const supplierActions = read('app/actions/suppliers.ts');
  const reversalActions = read('app/actions/inventory-reversal.ts');
  const shiftActions = read('app/actions/shifts.ts');
  const expenseActions = read('app/actions/expenses.ts');
  const purchasesService = read('lib/services/purchases.ts');
  const purchaseActions = read('app/actions/purchases.ts');
  const expensesService = read('lib/services/expenses.ts');
  const lossGuard = read('lib/services/inventory-loss-expense-guard.ts');
  const stocktakeActions = read('app/actions/stocktake.ts');
  const stocktakeState = read('app/(protected)/inventory/stocktake/stocktake-state.ts');

  it('assignOrphanPurchaseSupplierAction uses withBusinessContext([\'OWNER\'])', () => {
    expect(supplierActions).toContain('export async function assignOrphanPurchaseSupplierAction');
    expect(supplierActions).toContain("withBusinessContext(['OWNER'])");
    expect(supplierActions).not.toMatch(
      /assignOrphanPurchaseSupplierAction[\s\S]{0,400}withBusinessContext\(\[?'MANAGER'/,
    );
  });

  it('reverseInventoryAdjustmentAction uses OWNER', () => {
    expect(reversalActions).toContain('export async function reverseInventoryAdjustmentAction');
    expect(reversalActions).toContain("requireSelectedStoreContext(");
    expect(reversalActions).toContain("['OWNER']");
    expect(reversalActions).not.toMatch(/requireSelectedStoreContext\(\[[^\]]*['"]CASHIER['"]/);
    expect(reversalActions).not.toMatch(/requireSelectedStoreContext\(\[[^\]]*['"]MANAGER['"]/);
  });

  it('approveCashVarianceAction uses OWNER', () => {
    const start = shiftActions.indexOf('export async function approveCashVarianceAction');
    expect(start).toBeGreaterThanOrEqual(0);
    const next = shiftActions.indexOf('export async function', start + 1);
    const approveBlock = shiftActions.slice(start, next === -1 ? undefined : next);
    expect(approveBlock).toContain("withBusinessContext(['OWNER'])");
    expect(approveBlock).not.toContain("'MANAGER'");
    expect(approveBlock).not.toContain("'CASHIER'");
  });

  it('createExpenseAction uses MANAGER/OWNER', () => {
    expect(expenseActions).toContain('export async function createExpenseAction');
    expect(expenseActions).toContain('requireSelectedStoreContext');
    expect(expenseActions).toContain("['MANAGER', 'OWNER']");
    expect(expenseActions).not.toMatch(
      /createExpenseAction[\s\S]{0,250}requireSelectedStoreContext\(\[[^\]]*['"]CASHIER['"]/,
    );
  });

  it('credit purchase reject lives in purchases.ts service (not only UI)', () => {
    expect(purchasesService).toContain("from '@/lib/reliability/walkthrough-contracts'");
    expect(purchasesService).toContain('creditPurchaseRequiresSupplier');
    expect(purchasesService).toContain('Credit purchases require a supplier.');
    expect(purchaseActions).toContain("withBusinessContext(['MANAGER', 'OWNER'])");
  });

  it('5100 guard lives in createExpense service', () => {
    expect(expensesService).toContain('assertInventoryLossExpenseAllowed');
    expect(lossGuard).toContain('INVENTORY_LOSS_ACCOUNT_CODE');
    expect(lossGuard).toContain('INVENTORY_LOSS_OVERRIDE_REQUIRED_MSG');
    expect(expenseActions).toContain('inventoryLossOverride');
  });

  it('complete stocktake refuses uncounted without allowPartial', () => {
    expect(stocktakeActions).toContain('assertStocktakeReadyToComplete');
    expect(stocktakeActions).toContain('allowPartial');
    expect(stocktakeState).toContain('if (!input.allowPartial)');
    expect(stocktakeState).toContain('Uncounted lines are not treated as zero.');
  });

  it('stocktake save/complete/cancel load by id + storeId + businessId', () => {
    expect(stocktakeActions).toContain('scopedStocktakeWhere');
    expect(stocktakeActions).toContain('store: { businessId }');
    expect(stocktakeActions).not.toMatch(/stocktake\.findUnique\(\s*\{\s*where:\s*\{\s*id:/);
    expect(stocktakeActions).toContain('storeId: stocktake.storeId');
  });
});
