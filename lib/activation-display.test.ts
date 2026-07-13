import { describe, expect, it } from 'vitest';
import { getStuckReasonMessage, getActivationStatusLabel } from './activation-display';

describe('activation-display', () => {
  it('hides ordinary setup stuck codes from owner-facing messages', () => {
    expect(getStuckReasonMessage('STUCK_NO_PRODUCTS')).toBeNull();
    expect(getStuckReasonMessage('STUCK_NO_STOCK')).toBeNull();
    expect(getStuckReasonMessage('STUCK_NO_SALE')).toBeNull();
    expect(getStuckReasonMessage('PAYMENT_OVERDUE')).toMatch(/payment/i);
  });

  it('labels readiness states for owners without Stuck', () => {
    expect(getActivationStatusLabel('GETTING_STARTED')).toBe('Getting ready');
    expect(getActivationStatusLabel('SETUP_IN_PROGRESS')).toBe('Getting ready');
    expect(getActivationStatusLabel('READY_TO_SELL')).toBe('Ready to sell');
    expect(getActivationStatusLabel('ACTIVE_BUSINESS')).toBe('Improving your records');
    expect(getActivationStatusLabel('STUCK')).toBe('Getting ready');
  });
});
