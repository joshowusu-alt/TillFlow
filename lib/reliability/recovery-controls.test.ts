import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
const { normalizeConstraintDefinition } = createRequire(import.meta.url)('../../scripts/pilot-full-database-recovery.cjs');
const constraint = (definition: string) => ({ kind: 'constraint', object: 'PurchaseInvoice', name: 'PurchaseInvoice_discount_check', definition, valid: true });
const nested = 'CHECK ((("discountBps" >= 0) AND ("discountBps" <= 10000)) AND ("discountPence" >= 0))';
const flat = 'CHECK (("discountBps" >= 0) AND ("discountBps" <= 10000) AND ("discountPence" >= 0))';
it('compares the equivalent nested and flattened conjunction produced by PostgreSQL dump/reparse', () => {
  expect(normalizeConstraintDefinition(constraint(nested))).toEqual(normalizeConstraintDefinition(constraint(flat)));
});
it('keeps a changed bound distinct', () => {
  expect(normalizeConstraintDefinition(constraint(flat.replace('10000', '10001')))).not.toEqual(normalizeConstraintDefinition(constraint(nested)));
});
it('does not discard OR, extra terms or NOT VALID', () => {
  for (const changed of [flat.replace(' AND ', ' OR '), flat + ' NOT VALID', flat.replace('>= 0))', '>= 0) AND false)')]) {
    expect(normalizeConstraintDefinition(constraint(changed))).not.toEqual(normalizeConstraintDefinition(constraint(nested)));
  }
});
it('does not normalize any other constraint', () => {
  const row = { ...constraint(nested), name: 'Unrelated_discount_check' };
  expect(normalizeConstraintDefinition(row)).toBe(row);
});
