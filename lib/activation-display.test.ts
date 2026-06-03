import { describe, expect, it } from 'vitest';
import { getStuckReasonMessage, getActivationStatusLabel } from './activation-display';

describe('activation-display', () => {
  it('maps stuck codes to plain language', () => {
    expect(getStuckReasonMessage('STUCK_NO_PRODUCTS')).toContain('products');
    expect(getStuckReasonMessage('STUCK_NO_STOCK')).toContain('opening stock');
    expect(getStuckReasonMessage('STUCK_NO_SALE')).toContain('first sale');
  });

  it('labels readiness states for owners', () => {
    expect(getActivationStatusLabel('READY_TO_SELL')).toBe('Ready to sell');
    expect(getActivationStatusLabel('STUCK')).toBe('Stuck');
  });
});
