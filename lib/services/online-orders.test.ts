import { describe, expect, it } from 'vitest';
import {
  createOnlineOrderNumber,
  getOnlineOrderStateForCollectionStatus,
  normalizeStorefrontSlug,
} from './online-orders';

describe('normalizeStorefrontSlug', () => {
  it('normalizes a business name into a URL-safe slug', () => {
    expect(normalizeStorefrontSlug('  Tish Group Market  ')).toBe('tish-group-market');
  });

  it('removes unsupported characters and trims long slugs', () => {
    expect(normalizeStorefrontSlug('***Big & Busy Store!!!***')).toBe('big-busy-store');
  });
});

describe('createOnlineOrderNumber', () => {
  it('creates a stable web order number shape', () => {
    expect(createOnlineOrderNumber(new Date('2026-04-27T12:00:00Z'), 27)).toBe('WEB-20260427-0027');
  });
});

describe('getOnlineOrderStateForCollectionStatus', () => {
  it('marks confirmed collections as paid orders', () => {
    expect(getOnlineOrderStateForCollectionStatus('CONFIRMED')).toEqual({
      status: 'PAID',
      paymentStatus: 'PAID',
    });
  });

  it('marks failed or timed out collections as payment failures', () => {
    expect(getOnlineOrderStateForCollectionStatus('FAILED')).toEqual({
      status: 'PAYMENT_FAILED',
      paymentStatus: 'FAILED',
    });
    expect(getOnlineOrderStateForCollectionStatus('TIMEOUT')).toEqual({
      status: 'PAYMENT_FAILED',
      paymentStatus: 'FAILED',
    });
  });
});
