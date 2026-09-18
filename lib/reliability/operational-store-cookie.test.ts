import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => ({ get: getMock }),
}));

import { assertSubmittedStoreMatchesOperationalCookie } from './operational-store-cookie';
import { STALE_OPERATIONAL_STORE_MSG } from './operational-store';

describe('operational cookie vs submitted store', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('rejects Store A after the cookie switched to Store B', () => {
    getMock.mockReturnValue({ value: 'store-b' });
    expect(() => assertSubmittedStoreMatchesOperationalCookie('store-a')).toThrow(
      STALE_OPERATIONAL_STORE_MSG,
    );
  });

  it('accepts Store B when the cookie is Store B', () => {
    getMock.mockReturnValue({ value: 'store-b' });
    expect(assertSubmittedStoreMatchesOperationalCookie('store-b')).toBe('store-b');
  });
});
