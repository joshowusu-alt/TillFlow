import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(path.join(process.cwd(), 'lib/services/owner-sale-cleanup.ts'), 'utf8');

describe('A9 closed shift cleanup preserves reconciliation', () => {
  it('rejects cleanup that would rewrite a closed snapshot', () => {
    expect(source).toContain('CLOSED_SHIFT_CLEANUP_REJECTED');
    expect(source).not.toContain('parsed.expectedCashPence = input.expectedCashPence');
    expect(source).not.toContain('parsed.variancePence = input.variance');
  });

  it('does not delete drawer history or rewrite variance for a closed shift', () => {
    const closedBranch = source.slice(source.indexOf('if (shift.closedAt'));
    expect(closedBranch).not.toContain('expectedCashPence: nextExpectedCashPence');
    expect(closedBranch).not.toContain('cashDrawerEntry.deleteMany');
    expect(source).toContain('status === \'CLOSED\'');
  });
});
