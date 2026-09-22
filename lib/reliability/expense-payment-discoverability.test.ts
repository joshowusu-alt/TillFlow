import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('paying an existing expense is reachable from the Expenses list', () => {
  it('offers Record payment on unpaid and part-paid expense rows and cards', () => {
    const src = read('app/(protected)/expenses/page.tsx');
    // Both the mobile card and the desktop row carry the action, gated on a remaining balance.
    expect(src.match(/Record payment/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src).toContain('remainingBalancePence(expense.amountPence, paidPence) > 0');
    expect(src).toContain('/payments/expense-payments?expenseId=');
    expect(src).toContain('#expense-${expenseId}');
  });

  it('expense payments focuses the requested expense and keeps it in focus after paying', () => {
    const src = read('app/(protected)/payments/expense-payments/page.tsx');
    expect(src).toContain('searchParams?.expenseId');
    expect(src).toContain('searchParams?.paid');
    expect(src).toContain('id={`expense-${expense.id}`}');
    expect(src).toContain('HashScroll');
    expect(src).toContain('Show all unpaid expenses');
    expect(src).toContain('Back to Expenses');
  });
});
