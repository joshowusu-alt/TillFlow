import { expect, it } from 'vitest';
import { resolveStorefrontPickupAddress } from './storefront-pickup';
it('preserves the selected branch address', () => {
  expect(resolveStorefrontPickupAddress(' North pickup counter ', 'Business office', 2)).toBe('North pickup counter');
});
it('uses the existing business address for a single branch', () => {
  expect(resolveStorefrontPickupAddress(null, ' Fictional Station ', 1)).toBe('Fictional Station');
});
it('does not assign a head-office address to an unknown branch', () => {
  expect(resolveStorefrontPickupAddress(null, 'Business office', 2)).toBeNull();
  expect(resolveStorefrontPickupAddress(' ', 'Business office', 0)).toBeNull();
});
it('retains the missing-address state when nothing has been supplied', () => {
  expect(resolveStorefrontPickupAddress(null, ' ', 1)).toBeNull();
});
