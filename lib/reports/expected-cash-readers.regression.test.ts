import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveReadinessExpectedCashPence } from '@/lib/reports/home-expected-cash';

const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

describe('A8 expected cash readers use drawer entries', () => {
  it('does not fall back to stored shift totals', async () => {
    const source = read('lib/reports/home-expected-cash.ts');
    expect(source).not.toContain('openShiftExpectedCashPence');
    await expect(resolveReadinessExpectedCashPence({
      openShiftExpectedCashPence: [50_000],
    } as never)).rejects.toThrow();
  });

  it('home, owner brief, today KPIs and cash drawer read entries', () => {
    const home = read('lib/reports/home-performance-kpis.ts');
    const brief = read('lib/reports/owner-dashboard.ts');
    const kpis = read('lib/reports/today-kpis.ts');
    const drawer = read('app/(protected)/reports/cash-drawer/page.tsx');
    const close = read('lib/services/shifts.ts');
    for (const source of [home, brief, kpis, drawer, close]) {
      expect(source).toContain('expectedCashPenceFromEntries');
    }
    expect(home).not.toContain('openShiftExpectedCashPence');
    expect(brief).not.toMatch(/_sum:\s*\{\s*expectedCashPence:\s*true\s*\}/);
    expect(kpis).not.toMatch(/_sum:\s*\{\s*expectedCashPence:\s*true\s*\}/);
  });

  it('scopes entries and returns no figure when nothing is open', async () => {
    await expect(resolveReadinessExpectedCashPence({ openShifts: [] })).resolves.toBeNull();
    const value = await resolveReadinessExpectedCashPence({
      openShifts: [
        {
          businessId: 'biz-1',
          storeId: 'store-1',
          tillId: 'till-1',
          shiftId: 'shift-1',
          entries: [
            { entryType: 'OPEN_FLOAT', amountPence: 2_000, businessId: 'biz-1', storeId: 'store-1', tillId: 'till-1', shiftId: 'shift-1' },
            { entryType: 'CASH_SALE', amountPence: 9_999, businessId: 'biz-2', storeId: 'store-1', tillId: 'till-1', shiftId: 'shift-1' },
          ],
        },
        {
          businessId: 'biz-1',
          storeId: 'store-1',
          tillId: 'till-2',
          shiftId: 'shift-2',
          entries: [
            { entryType: 'OPEN_FLOAT', amountPence: 500, businessId: 'biz-1', storeId: 'store-1', tillId: 'till-2', shiftId: 'shift-2' },
          ],
        },
      ],
    });
    expect(value).toBe(2_500);
  });
});
