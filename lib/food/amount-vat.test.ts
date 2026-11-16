import { expect, it } from 'vitest';
import { amountLineVat } from './amount-vat';

it('extracts VAT from the typed amount to the nearest pesewa', () => {
  expect(amountLineVat(3500, 3500, 0, 1500)).toEqual({ net: 3043, vat: 457 });
  expect(amountLineVat(1, 1, 0, 1500)).toEqual({ net: 1, vat: 0 });
});
it('leaves extras VAT-exclusive and charges no VAT when switched off', () => {
  expect(amountLineVat(4000, 3500, 0, 1500)).toEqual({ net: 3543, vat: 532 });
  expect(amountLineVat(4000, 3500, 0, 0)).toEqual({ net: 4000, vat: 0 });
  expect(amountLineVat(4000, 0, 0, 1500)).toEqual({ net: 4000, vat: 600 });
});
