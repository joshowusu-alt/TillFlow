/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  canonicaliseSourceBranchKey,
  SOURCE_BRANCH_KEY_MAX_LENGTH,
} from '@/lib/migration/source-branch-key';
import { assertNoDuplicateSourceBranchKeys } from '@/lib/migration/tenant-policy';
import { MigrationContractError } from '@/lib/migration/errors';
import { MigrationPolicyError } from '@/lib/migration/errors';

describe('canonicaliseSourceBranchKey', () => {
  it('normalises case, whitespace, and NFC identically', () => {
    expect(canonicaliseSourceBranchKey('HQ')).toBe('hq');
    expect(canonicaliseSourceBranchKey('hq')).toBe('hq');
    expect(canonicaliseSourceBranchKey('  HQ  ')).toBe('hq');
    expect(canonicaliseSourceBranchKey('caf\u00e9')).toBe(canonicaliseSourceBranchKey('cafe\u0301'));
  });

  it('rejects empty, non-string, and overlong keys', () => {
    expect(() => canonicaliseSourceBranchKey('')).toThrow(MigrationContractError);
    expect(() => canonicaliseSourceBranchKey('   ')).toThrow(MigrationContractError);
    expect(() => canonicaliseSourceBranchKey(1 as unknown as string)).toThrow(MigrationContractError);
    expect(() =>
      canonicaliseSourceBranchKey('x'.repeat(SOURCE_BRANCH_KEY_MAX_LENGTH + 1)),
    ).toThrow(/at most/);
  });

  it('feeds the same identity into duplicate detection', () => {
    expect(() =>
      assertNoDuplicateSourceBranchKeys([
        { sourceBranchKey: 'HQ' },
        { sourceBranchKey: ' hq ' },
      ]),
    ).toThrow(MigrationPolicyError);
  });
});
