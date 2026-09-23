import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('today KPI balances', () => {
  it('does not apply a 90-day createdAt cutoff to AR or AP', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/reports/today-kpis.ts'), 'utf8');
    expect(source).not.toContain('ninetyDaysAgo');
    expect(source).not.toContain('90 * 86_400_000');
    expect(source).toContain('receivableDocumentBalance');
    expect(source).toContain('payableDocumentBalance');
  });
});
