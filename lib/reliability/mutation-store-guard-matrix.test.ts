import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const MUTATION_GUARD = 'requireSelectedStoreContext';

const MATRIX: Array<{ path: string; writes: string[]; notes: string }> = [
  { path: 'app/actions/sales.ts', writes: ['createSaleAction', 'completeSaleAction', 'amendSaleAction'], notes: 'POS checkout + sale amend' },
  { path: 'app/actions/customers.ts', writes: ['createCustomerAction', 'quickCreateCustomerAction'], notes: 'POS quick-create; customers business-shared' },
  { path: 'app/actions/payments.ts', writes: ['recordCustomerPaymentAction', 'recordSupplierPaymentAction'], notes: 'receipts and supplier payments' },
  { path: 'app/actions/purchases.ts', writes: ['createPurchaseAction'], notes: 'purchases' },
  { path: 'app/actions/expenses.ts', writes: ['createExpenseAction'], notes: 'expenses' },
  { path: 'app/actions/expense-payments.ts', writes: ['recordExpensePaymentAction'], notes: 'expense payments' },
  { path: 'app/actions/inventory.ts', writes: ['createStockAdjustmentAction'], notes: 'stock adjustments' },
  { path: 'app/actions/inventory-reversal.ts', writes: ['reverseInventoryAdjustmentAction'], notes: 'reversals' },
  { path: 'app/actions/stocktake.ts', writes: ['createStocktakeAction'], notes: 'stocktakes' },
  { path: 'app/actions/transfers.ts', writes: ['requestStockTransferAction', 'approveStockTransferActionSafe'], notes: 'transfers + approval' },
  { path: 'app/actions/shifts.ts', writes: ['openShiftAction', 'addCashToTillAction', 'closeShiftAction', 'closeShiftOwnerOverrideAction', 'assignCashVarianceAction', 'explainCashVarianceAction', 'resolveCashVarianceAction', 'approveCashVarianceAction'], notes: 'shift open/add/close + variance' },
  { path: 'app/actions/returns.ts', writes: ['createSalesReturnAction', 'createPurchaseReturnAction'], notes: 'sale/purchase reversals' },
  { path: 'app/actions/opening-stock.ts', writes: ['createOpeningStockAction'], notes: 'opening stock; no first-store inference' },
  { path: 'app/actions/import-stock.ts', writes: ['importStockAction'], notes: 'import stock uses operational cookie, not stores[0]' },
  { path: 'app/actions/stocktake.ts', writes: ['createStocktakeAction', 'saveStocktakeCountsAction', 'completeStocktakeAction', 'cancelStocktakeAction'], notes: 'stocktake lifecycle' },
  { path: 'app/actions/reorder.ts', writes: ['markAsOrdered'], notes: 'reorder is store-scoped' },
  { path: 'app/actions/products.ts', writes: ['createProductAction'], notes: 'product opening stock uses operational store' },
  { path: 'app/actions/opening-balances.ts', writes: ['saveOpeningAR', 'saveOpeningAP'], notes: 'opening AR/AP invoices use operational store' },
];

describe('authoritative mutation store guard matrix', () => {
  it('wires requireSelectedStoreContext → assertAuthoritativeMutationStore on every listed write path', () => {
    expect(read('lib/action-utils.ts')).toContain('assertAuthoritativeMutationStore');
    expect(read('lib/reliability/operational-store-cookie.ts')).toContain('assertAuthoritativeOperationalStore');
    expect(read('lib/reliability/operational-store.ts')).toContain('STORE_DEACTIVATION_SUPPORTED = false');

    for (const row of MATRIX) {
      const src = read(row.path);
      expect(src, row.path).toContain(MUTATION_GUARD);
      expect(src, `${row.path} must not infer stores[0]`).not.toMatch(/stores\[0\]/);
      for (const write of row.writes) {
        const exported = src.indexOf(`export async function ${write}`);
        const internal = src.indexOf(`async function ${write}`);
        const start = exported === -1 ? internal : exported;
        expect(start, `${row.path} ${write}`).toBeGreaterThan(-1);
        const nextExport = src.indexOf('export async function', start + 10);
        const body = write === 'importStockAction' ? src : nextExport === -1 ? src.slice(start) : src.slice(start, nextExport);
        expect(
          body.includes(MUTATION_GUARD) || body.includes('requireVarianceOperationalStore'),
          `${row.path} ${write} uses ${MUTATION_GUARD}`,
        ).toBe(true);
      }
    }

    const offline = read('app/api/offline/process-offline-sale.ts');
    expect(offline).toContain('assertAuthoritativeMutationStore');
    expect(offline).toContain("reject('stale_operational_store')");
  });
});
