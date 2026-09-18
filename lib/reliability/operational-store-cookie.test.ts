import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => ({ get: getMock }),
}));

import { assertAuthoritativeOperationalStore } from './operational-store-cookie';
import {
  ALL_BRANCHES_NOT_OPERATIONAL_MSG,
  MISSING_OPERATIONAL_STORE_MSG,
  STALE_OPERATIONAL_STORE_MSG,
} from './operational-store';

describe('operational cookie vs submitted store', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('rejects Store A after the cookie switched to Store B', () => {
    getMock.mockReturnValue({ value: 'store-b' });
    expect(() => assertAuthoritativeOperationalStore('store-a')).toThrow(STALE_OPERATIONAL_STORE_MSG);
  });

  it('accepts Store B when the cookie is Store B', () => {
    getMock.mockReturnValue({ value: 'store-b' });
    expect(assertAuthoritativeOperationalStore('store-b')).toBe('store-b');
  });

  it('fails closed when the cookie is missing in a multi-store business', () => {
    getMock.mockReturnValue(undefined);
    expect(() => assertAuthoritativeOperationalStore('store-b', { authorisedStoreCount: 2 })).toThrow(
      MISSING_OPERATIONAL_STORE_MSG,
    );
  });

  it('rejects ALL even when the cookie is present', () => {
    getMock.mockReturnValue({ value: 'store-b' });
    expect(() => assertAuthoritativeOperationalStore('ALL')).toThrow(ALL_BRANCHES_NOT_OPERATIONAL_MSG);
  });

  it('allows a sole authorised store without a cookie', () => {
    getMock.mockReturnValue(undefined);
    expect(assertAuthoritativeOperationalStore('store-b', { authorisedStoreCount: 1 })).toBe('store-b');
  });
});
