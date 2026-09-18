import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('selected-store mutation fail-closed', () => {
  const files = {
    purchases: read('app/actions/purchases.ts'),
    payments: read('app/actions/payments.ts'),
    expenses: read('app/actions/expenses.ts'),
    expensePayments: read('app/actions/expense-payments.ts'),
    stocktake: read('app/actions/stocktake.ts'),
    inventory: read('app/actions/inventory.ts'),
    reversal: read('app/actions/inventory-reversal.ts'),
    shifts: read('app/actions/shifts.ts'),
  };

  it('does not let listed mutations call withBusinessStoreContext', () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source, name).not.toContain('withBusinessStoreContext(');
    }
  });

  it('requires an explicit store or derives it from the source record/till', () => {
    expect(files.purchases).toContain('requireSelectedStoreContext');
    expect(files.expenses).toContain('requireSelectedStoreContext');
    expect(files.expensePayments).toContain('requireSelectedStoreContext');
    expect(files.stocktake).toContain('requireSelectedStoreContext');
    expect(files.inventory).toContain('requireSelectedStoreContext');
    expect(files.reversal).toContain('requireSelectedStoreContext');
    expect(files.payments).toContain('assertRequestedStoreMatchesSource');
    expect(files.shifts).toContain('resolveStoreFromTill');
    expect(files.shifts).toContain('till: { store: { businessId } }');
  });

  it('mutation pages use sole-or-selected store resolution, not stores[0] fallback', () => {
    expect(read('app/(protected)/purchases/page.tsx')).toContain('resolveSoleOrSelectedStoreId');
    expect(read('app/(protected)/expenses/page.tsx')).toContain('resolveSoleOrSelectedStoreId');
    expect(read('app/(protected)/inventory/stocktake/page.tsx')).toContain('resolveSoleOrSelectedStoreId');
    expect(read('app/(protected)/inventory/adjustments/page.tsx')).toContain('resolveSoleOrSelectedStoreId');
    expect(read('app/(protected)/purchases/page.tsx')).not.toContain('stores[0]');
    expect(read('app/(protected)/settings/page.tsx')).toContain('resolveSoleOrSelectedStoreId');
    expect(read('app/(protected)/payments/reconciliation/card-transfer/page.tsx')).toContain(
      'resolveSoleOrSelectedStoreId',
    );
    expect(read('app/actions/settings.ts')).toContain('requireSelectedStoreContext');
    expect(read('app/actions/settings.ts')).not.toContain('withBusinessStoreContext');
    expect(read('lib/services/customers.ts')).toContain('Select a store before adding this customer.');
    expect(read('lib/services/online-orders.ts')).toContain('business.stores.length === 1');
    expect(read('app/(protected)/transfers/page.tsx')).toContain("stores.length === 1 ? stores[0]?.id ?? '' : ''");
    expect(read('app/actions/reorder.ts')).toContain('requireSelectedStoreContext');
    expect(read('app/actions/reorder.ts')).not.toContain('withBusinessStoreContext');
    expect(read('app/actions/reorder.ts')).not.toContain('defaultStoreId');
    expect(read('app/(protected)/reports/reorder-suggestions/page.tsx')).toContain(
      'resolveSoleOrSelectedStoreId',
    );
    expect(read('app/(protected)/reports/reorder-suggestions/page.tsx')).not.toContain(
      'requireBusinessStore',
    );
    expect(read('app/(protected)/shifts/page.tsx')).toContain('resolveSoleOrSelectedStoreId');
    expect(read('app/(protected)/shifts/page.tsx')).not.toContain('requireBusinessStore');
    expect(read('app/(protected)/shifts/drawer/page.tsx')).toContain('resolveSoleOrSelectedStoreId');
    expect(read('app/(protected)/shifts/variance/page.tsx')).toContain('resolveSoleOrSelectedStoreId');
    expect(read('app/(protected)/shifts/variance/[id]/page.tsx')).toContain(
      'resolveSoleOrSelectedStoreId',
    );
  });

  it('never substitutes stores[0] or defaultStoreId on these write paths', () => {
    for (const source of Object.values(files)) {
      expect(source).not.toContain('defaultStoreId');
      expect(source).not.toContain('stores[0]');
      expect(source).not.toMatch(/formString\(formData, 'storeId'\) \|\|/);
    }
  });
});
