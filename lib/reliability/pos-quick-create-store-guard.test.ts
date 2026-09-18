import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const getMock = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () => ({ get: getMock }),
}));

import { assertAuthoritativeOperationalStore } from './operational-store-cookie';
import {
  FOREIGN_OPERATIONAL_STORE_MSG,
  MISSING_OPERATIONAL_STORE_MSG,
  STALE_OPERATIONAL_STORE_MSG,
} from './operational-store';

describe('POS quick-create customer operational-store guard', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('states that customers are business-shared but still require operational context', () => {
    const src = readFileSync(join(process.cwd(), 'app/actions/customers.ts'), 'utf8');
    expect(src).toMatch(/Customers are business-shared/);
    expect(src).toContain('requireSelectedStoreContext(undefined, data.storeId)');
    expect(src).not.toContain('stores[0]');
  });

  it('rejects missing, foreign, and stale cookies, and accepts Store B', () => {
    getMock.mockReturnValue(undefined);
    expect(() => assertAuthoritativeOperationalStore('store-b', { authorisedStoreCount: 2 })).toThrow(
      MISSING_OPERATIONAL_STORE_MSG,
    );

    getMock.mockReturnValue({ value: 'store-foreign' });
    expect(() => assertAuthoritativeOperationalStore('store-b')).toThrow(STALE_OPERATIONAL_STORE_MSG);

    getMock.mockReturnValue({ value: 'store-a' });
    expect(() => assertAuthoritativeOperationalStore('store-b')).toThrow(STALE_OPERATIONAL_STORE_MSG);

    getMock.mockReturnValue({ value: 'store-b' });
    expect(assertAuthoritativeOperationalStore('store-b')).toBe('store-b');
    expect(FOREIGN_OPERATIONAL_STORE_MSG).toMatch(/not available|belong/i);
  });
});
