import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_NUMBER_PREFIXES, formatDocumentNumber } from '@/lib/reliability/walkthrough-contracts';

describe('document number generation coverage', () => {
  const payments = readFileSync(join(process.cwd(), 'lib/services/payments.ts'), 'utf8');
  const purchases = readFileSync(join(process.cwd(), 'lib/services/purchases.ts'), 'utf8');
  const sales = readFileSync(join(process.cwd(), 'lib/services/sales.ts'), 'utf8');
  const expenses = readFileSync(join(process.cwd(), 'lib/services/expenses.ts'), 'utf8');
  const expensePayments = readFileSync(join(process.cwd(), 'lib/services/expensePayments.ts'), 'utf8');
  const decrease = readFileSync(join(process.cwd(), 'lib/services/inventory-decrease.ts'), 'utf8');
  const increase = readFileSync(join(process.cwd(), 'lib/services/inventory-increase.ts'), 'utf8');
  const stocktake = readFileSync(join(process.cwd(), 'app/actions/stocktake.ts'), 'utf8');
  const shifts = readFileSync(join(process.cwd(), 'lib/services/shifts.ts'), 'utf8');
  const variance = readFileSync(join(process.cwd(), 'lib/services/cash-variance.ts'), 'utf8');

  it('defines every contracted prefix', () => {
    expect(formatDocumentNumber('supplier_payment', 1)).toBe('SPAY-000001');
    expect(formatDocumentNumber('customer_receipt', 2)).toBe('RCPT-000002');
    expect(Object.keys(DOCUMENT_NUMBER_PREFIXES).sort()).toEqual([
      'cash_variance',
      'customer_receipt',
      'expense',
      'expense_payment',
      'invoice',
      'purchase',
      'shift_closure',
      'stock_adjustment',
      'stocktake',
      'supplier_payment',
    ]);
  });

  it('actually reserves every declared sequence on a write path', () => {
    expect(sales).toContain("reserveNextDocumentNumber(tx, input.businessId, 'customer_receipt')");
    expect(payments).toContain("reserveNextDocumentNumber(tx, businessId, 'customer_receipt')");
    expect(payments).toContain("reserveNextDocumentNumber(tx, businessId, 'supplier_payment')");
    expect(purchases).toContain("reserveNextDocumentNumber(client, input.businessId, 'supplier_payment')");
    expect(purchases).toContain("reserveNextDocumentNumber(client, input.businessId, 'purchase')");
    expect(expenses).toContain("reserveNextDocumentNumber(tx, input.businessId, 'expense')");
    expect(expensePayments).toContain("reserveNextDocumentNumber(tx, input.businessId, 'expense_payment')");
    expect(decrease).toContain("reserveNextDocumentNumber(");
    expect(increase).toContain("reserveNextDocumentNumber(");
    expect(stocktake).toContain("reserveNextDocumentNumber(tx, businessId, 'stocktake')");
    expect(shifts).toContain("reserveNextDocumentNumber(tx, businessId, 'shift_closure')");
    expect(variance).toContain("reserveNextDocumentNumber(tx, input.businessId, 'cash_variance')");
  });
});
