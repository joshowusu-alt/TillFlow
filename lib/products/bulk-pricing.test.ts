import { expect, it } from 'vitest';
import { calculateBulkPrice, parseBulkPricingInput, type BulkPricingInput } from './bulk-pricing';
const input: BulkPricingInput = { categoryId: '', divisionId: '', groupId: '', search: '', basis: 'SELLING_PRICE', operation: 'INCREASE', method: 'PERCENT', value: '20', decimals: 2, units: 'BASE_ONLY' };
it('calculates exact percentage and amount changes in minor units', () => {
  expect(calculateBulkPrice(6000, input)).toBe(7200);
  expect(calculateBulkPrice(6000, { ...input, operation: 'DECREASE' })).toBe(4800);
  expect(calculateBulkPrice(1999, { ...input, value: '2.55' })).toBe(2050);
  expect(calculateBulkPrice(6000, { ...input, method: 'AMOUNT', value: '0.25' })).toBe(6025);
  expect(calculateBulkPrice(6000, { ...input, method: 'AMOUNT', operation: 'DECREASE', value: '1.01' })).toBe(5899);
});
it('rounds once directly to the selected precision, half up', () => {
  expect(calculateBulkPrice(1049, { ...input, value: '0.01', decimals: 0 })).toBe(1000);
  expect(calculateBulkPrice(1050, { ...input, method: 'AMOUNT', value: '0.01', decimals: 0 })).toBe(1100);
  expect(calculateBulkPrice(1000, { ...input, value: '0.05' })).toBe(1001);
  expect(calculateBulkPrice(1000, { ...input, method: 'AMOUNT', value: '0.05', decimals: 1 })).toBe(1010);
});
it('rejects zero, negative, overflowing and rounded-to-zero prices', () => {
  for (const basis of [-1, 1.1, NaN, Infinity, 2_147_483_648]) expect(() => calculateBulkPrice(basis, input)).toThrow();
  expect(() => calculateBulkPrice(1000, { ...input, method: 'AMOUNT', operation: 'DECREASE', value: '10' })).toThrow();
  expect(() => calculateBulkPrice(1, { ...input, decimals: 0 })).toThrow();
  expect(() => calculateBulkPrice(2_147_483_647, input)).toThrow();
});
it('rejects malformed controls instead of silently defaulting a bulk write', () => {
  for (const patch of [{ value: '-1' }, { value: 'NaN' }, { value: '1e2' }, { value: '1.234' }, { value: '0' }, { value: '1001' }, { operation: 'DECREASE', value: '100' }, { method: 'SET' }, { basis: 'AVERAGE_COST' }, { decimals: '2' }, { units: 'anything' }, { categoryId: 42 }]) expect(() => parseBulkPricingInput({ ...input, ...patch })).toThrow();
  expect(parseBulkPricingInput({ ...input, search: ' book ' }).search).toBe('book');
});
