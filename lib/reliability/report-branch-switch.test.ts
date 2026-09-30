import { describe, expect, it } from 'vitest';
import { pathAfterOperationalSwitch } from '@/lib/reliability/operational-store';

describe('Report branch switch', () => {
  it('replaces a stale report store id and keeps the section', () => {
    expect(pathAfterOperationalSwitch('/reports?section=activity&storeId=store-a&from=2026-09-01', 'store-b'))
      .toBe('/reports?section=activity&from=2026-09-01&storeId=store-b');
  });

  it('does not leave ALL in place after the till moves to one branch', () => {
    expect(pathAfterOperationalSwitch('/reports?storeId=ALL', 'store-b')).toBe('/reports?storeId=store-b');
  });

  it('still drops an unrelated query and still stamps an operational route', () => {
    expect(pathAfterOperationalSwitch('/settings?storeId=store-a', 'store-b')).toBe('/settings');
    expect(pathAfterOperationalSwitch('/expenses?storeId=store-a', 'store-b')).toBe('/expenses?storeId=store-b');
  });
});
