import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('forecast confirmed inflow', () => {
  it('uses CONFIRMED cash and MoMo inside a half-open business window', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/reports/forecast.ts'), 'utf8');
    expect(source).toContain("status: 'CONFIRMED'");
    expect(source).toContain("method: { in: ['CASH', 'MOBILE_MONEY'] }");
    expect(source).toContain('businessDayWindow');
    expect(source).toContain('lt: trailingEnd');
    const cashQuery = source.slice(source.indexOf('Avg daily confirmed cash'));
    expect(cashQuery).not.toContain("paymentStatus: { notIn: ['RETURNED', 'VOID'] }");
    expect(source).not.toContain('PENDING_MANUAL');
  });
});
