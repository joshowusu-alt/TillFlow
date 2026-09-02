import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureCashierStorageKey,
  captureShiftStorageKey,
  peekCapturedCashierUserId,
  peekCapturedShiftId,
  rememberOfflineCaptureContext,
} from './capture';

describe('offline capture context', () => {
  beforeEach(() => {
    rememberOfflineCaptureContext({ cashierUserId: null, shiftsByTill: {} });
    window.localStorage.clear();
  });

  it('remembers shift and cashier for later queue capture', () => {
    rememberOfflineCaptureContext(
      { cashierUserId: 'cashier-1', shiftsByTill: { 'till-1': 'shift-1' } },
      { businessId: 'biz-1' },
    );

    expect(peekCapturedCashierUserId()).toBe('cashier-1');
    expect(peekCapturedShiftId('till-1')).toBe('shift-1');
    expect(window.localStorage.getItem(captureCashierStorageKey('biz-1'))).toBe('cashier-1');
    expect(window.localStorage.getItem(captureShiftStorageKey('biz-1', 'till-1'))).toBe('shift-1');
  });
});
