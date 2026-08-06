import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('P2 cash drawer mobile shift ledger', () => {
  const src = read('app/(protected)/reports/cash-drawer/page.tsx');

  it('renders a dedicated mobile shift ledger with essential fields', () => {
    expect(src).toContain('data-cash-drawer-mobile-ledger');
    expect(src).toContain('lg:hidden');
    expect(src).toContain('DataCard');
    expect(src).toContain('Cash expected');
    expect(src).toContain('Cash counted');
    expect(src).toContain('Difference');
    expect(src).toContain('Manager approval');
    expect(src).toContain('Drawer movements');
    expect(src).toContain('No shifts found in this date range.');
    expect(src).toContain('break-words');
    expect(src).toContain('tabular-nums');
  });

  it('preserves the desktop shift table behind lg breakpoint', () => {
    expect(src).toContain('hidden lg:block');
    expect(src).toContain('ReportTableCard');
    expect(src).toContain('min-w-[56rem]');
    expect(src).toContain('Opening float');
    expect(src).toContain('Cash sales');
  });

  it('does not introduce client-side financial recalculation', () => {
    expect(src).not.toContain("'use client'");
    expect(src).toContain('summarizeCashDrawerEntries');
    expect(src).toContain('expectedCashPence');
    expect(src).toContain('actualCashPence');
    expect(src).toContain('shift.variance');
    // Totals still come from server-side reduce over persisted shift values.
    expect(src).toContain('shifts.reduce((sum, shift) => sum + shift.expectedCashPence, 0)');
    expect(src).toContain("requireBusiness(['MANAGER', 'OWNER'])");
  });
});
