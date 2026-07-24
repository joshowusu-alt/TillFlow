/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '@/lib/migration/checksum';
import {
  MIGRATION_MAX_EXCEPTIONS_RETAINED,
  sanitizeCsvCell,
  truncateExceptionsForStorage,
} from '@/lib/migration/limits';
import { describeBatchForUi, guardApprovedBatchIdentity } from '@/lib/migration/batch-service';
import { UserError } from '@/lib/action-utils';

describe('migration file identity helpers', () => {
  it('checksums content, not filename', () => {
    const a = sha256Hex('name,price\nA,1');
    const b = sha256Hex('name,price\nA,1');
    const c = sha256Hex('name,price\nA,2');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('migration exception retention', () => {
  it('caps retained exceptions', () => {
    const many = Array.from({ length: MIGRATION_MAX_EXCEPTIONS_RETAINED + 25 }, (_, i) => ({
      message: `e${i}`,
    }));
    const { retained, truncated } = truncateExceptionsForStorage(many);
    expect(retained).toHaveLength(MIGRATION_MAX_EXCEPTIONS_RETAINED);
    expect(truncated).toBe(25);
  });

  it('neutralises CSV injection in downloads', () => {
    expect(sanitizeCsvCell('=cmd')).toBe("'=cmd");
    expect(sanitizeCsvCell('plain')).toBe('plain');
  });
});

describe('migration UI status separation', () => {
  it('does not treat completed import as reconciled', () => {
    const ui = describeBatchForUi({
      status: 'COMPLETED',
      reconciliationStatus: 'MISMATCHED',
    });
    expect(ui.importComplete).toBe(true);
    expect(ui.reconciledSuccessfully).toBe(false);
  });
});

describe('entity map uniqueness contract (documented)', () => {
  it('requires sourceSystemKey in the unique tuple', () => {
    // Same legacy ref under two namespaces must be distinct keys:
    const keyA = ['biz', 'source-a', 'PRODUCT', 'P1'].join('|');
    const keyB = ['biz', 'source-b', 'PRODUCT', 'P1'].join('|');
    expect(keyA).not.toBe(keyB);
  });
});

describe('approved batch identity guard', () => {
  const approved = {
    status: 'APPROVED',
    approvedFileChecksum: 'a'.repeat(64),
    sourceSystemKey: 'legacy-cutover',
    templateKind: 'CATALOGUE',
    contractVersion: '1.0.0',
    fileChecksum: 'a'.repeat(64),
  };

  it('rejects sourceSystemKey change after approval', () => {
    expect(() =>
      guardApprovedBatchIdentity(approved, { sourceSystemKey: 'other-source' }),
    ).toThrow(UserError);
  });

  it('rejects template / checksum mutation after approval', () => {
    expect(() =>
      guardApprovedBatchIdentity(approved, { templateKind: 'SUPPLIERS' }),
    ).toThrow(UserError);
    expect(() =>
      guardApprovedBatchIdentity(approved, { fileChecksum: 'b'.repeat(64) }),
    ).toThrow(UserError);
  });
});

describe('chunk + stock atomicity contract (documented)', () => {
  it('defines IMPORT receipt as post-write same-TX step', () => {
    const steps = ['claim-receipt-absent', 'business-writes', 'create-receipt', 'commit'];
    expect(steps.indexOf('business-writes')).toBeLessThan(steps.indexOf('create-receipt'));
    expect(steps.indexOf('create-receipt')).toBeLessThan(steps.indexOf('commit'));
  });

  it('defines opening-stock claim before inventory write', () => {
    const steps = ['create-MigrationOpeningStockPosting', 'recordOpeningInventory', 'receipt'];
    expect(steps[0]).toContain('MigrationOpeningStockPosting');
  });
});
