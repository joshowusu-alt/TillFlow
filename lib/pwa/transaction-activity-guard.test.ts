import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deferPosServiceWorkerReload,
  flushPendingPosServiceWorkerReload,
  isPosTransactionActive,
  notifyPosTransactionActive,
  POS_TXN_ACTIVE_ATTR,
  resetPosTransactionGuardForTests,
} from './transaction-activity-guard';

describe('POS transaction activity guard', () => {
  beforeEach(() => {
    resetPosTransactionGuardForTests();
  });

  afterEach(() => {
    resetPosTransactionGuardForTests();
  });

  it('marks the document when a POS transaction is active', () => {
    notifyPosTransactionActive(true);
    expect(isPosTransactionActive()).toBe(true);
    expect(document.documentElement.getAttribute(POS_TXN_ACTIVE_ATTR)).toBe('true');

    notifyPosTransactionActive(false);
    expect(isPosTransactionActive()).toBe(false);
    expect(document.documentElement.getAttribute(POS_TXN_ACTIVE_ATTR)).toBeNull();
  });

  it('defers a service-worker reload until the transaction becomes inactive', () => {
    notifyPosTransactionActive(true);
    const reload = vi.fn();
    deferPosServiceWorkerReload(reload);

    flushPendingPosServiceWorkerReload();
    expect(reload).not.toHaveBeenCalled();

    notifyPosTransactionActive(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('collapses repeated deferrals into a single pending reload', () => {
    notifyPosTransactionActive(true);
    const first = vi.fn();
    const second = vi.fn();
    deferPosServiceWorkerReload(first);
    deferPosServiceWorkerReload(second);
    notifyPosTransactionActive(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not flush a deferred reload on inactive notify when flushOnInactive is false', () => {
    notifyPosTransactionActive(true);
    const reload = vi.fn();
    deferPosServiceWorkerReload(reload);
    notifyPosTransactionActive(false, { flushOnInactive: false });
    expect(isPosTransactionActive()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    flushPendingPosServiceWorkerReload();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when flush is called with no pending reload', () => {
    expect(() => flushPendingPosServiceWorkerReload()).not.toThrow();
  });
});
