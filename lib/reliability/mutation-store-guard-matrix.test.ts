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
  { path: 'app/actions/shifts.ts', writes: ['openShiftAction', 'addCashToTillAction', 'closeShiftAction', 'closeShiftOwnerOverrideAction'], notes: 'shift open/add/close' },
  { path: 'app/actions/returns.ts', writes: ['createSalesReturnAction', 'createPurchaseReturnAction'], notes: 'sale/purchase reversals' },
];

describe('authoritative mutation store guard matrix', () => {
  it('wires requireSelectedStoreContext → assertAuthoritativeMutationStore on every listed write path', () => {
    expect(read('lib/action-utils.ts')).toContain('assertAuthoritativeMutationStore');
    expect(read('lib/reliability/operational-store-cookie.ts')).toContain('assertAuthoritativeOperationalStore');
    expect(read('lib/reliability/operational-store.ts')).toContain('STORE_DEACTIVATION_SUPPORTED = false');

    for (const row of MATRIX) {
      const src = read(row.path);
      expect(src, row.path).toContain(MUTATION_GUARD);
      for (const write of row.writes) {
        const start = src.indexOf(`export async function ${write}`);
        expect(start, `${row.path} ${write}`).toBeGreaterThan(-1);
        const nextExport = src.indexOf('export async function', start + 10);
        const body = nextExport === -1 ? src.slice(start) : src.slice(start, nextExport);
        expect(body, `${row.path} ${write} uses ${MUTATION_GUARD}`).toContain(MUTATION_GUARD);
      }
    }
  });
});
