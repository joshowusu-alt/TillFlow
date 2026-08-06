/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  assertCanAccessMigration,
  assertCanApproveMigrationPackage,
  assertAuthenticatedMigrationActor,
  assertSameBusinessActor,
  canAccessMigration,
  canApproveMigrationPackage,
  canUploadOrValidateMigration,
} from '@/lib/migration/roles';
import {
  assertBranchMappingsResolved,
  assertPackageHasExactlyThreePhase1Files,
  assertPackageFileTenantMatch,
  assertStoreBelongsToPackageBusiness,
} from '@/lib/migration/tenant-policy';
import { MigrationPolicyError } from '@/lib/migration/errors';
import { sha256Hex } from '@/lib/migration/checksum';
import {
  isOpeningStockBlockedByExistingActivity,
  mappedTargetMissingCode,
  EXISTING_RECORD_POLICY,
} from '@/lib/migration/existing-record-policy';

describe('migration role policy', () => {
  it('denies Cashier and unauthenticated actors', () => {
    expect(canAccessMigration('CASHIER')).toBe(false);
    expect(canApproveMigrationPackage('CASHIER')).toBe(false);
    expect(() => assertCanAccessMigration('CASHIER')).toThrow(MigrationPolicyError);
    expect(() =>
      assertAuthenticatedMigrationActor({ userId: null, role: null }),
    ).toThrow(/Authentication required/);
  });

  it('allows Manager upload/validate but denies Manager approval', () => {
    expect(canAccessMigration('MANAGER')).toBe(true);
    expect(canUploadOrValidateMigration('MANAGER')).toBe(true);
    expect(canApproveMigrationPackage('MANAGER')).toBe(false);
    expect(() => assertCanApproveMigrationPackage('MANAGER')).toThrow(/Only an Owner/);
  });

  it('allows Owner approval', () => {
    expect(canApproveMigrationPackage('OWNER')).toBe(true);
    expect(() => assertCanApproveMigrationPackage('OWNER')).not.toThrow();
  });

  it('denies cross-tenant actors at service-policy level', () => {
    expect(() =>
      assertSameBusinessActor({ actorBusinessId: 'biz_a', packageBusinessId: 'biz_b' }),
    ).toThrow(/Cross-tenant/);
  });
});

describe('migration tenant and branch constraints', () => {
  it('rejects cross-business store mapping', () => {
    expect(() =>
      assertStoreBelongsToPackageBusiness({
        packageBusinessId: 'biz_a',
        storeBusinessId: 'biz_b',
        sourceBranchKey: 'HQ',
      }),
    ).toThrow(/outside this business/);
  });

  it('rejects duplicate source branch mappings and unresolved keys', () => {
    expect(() =>
      assertBranchMappingsResolved({
        packageBusinessId: 'biz_a',
        mappings: [
          { sourceBranchKey: 'HQ', targetStoreId: 's1', targetStoreBusinessId: 'biz_a' },
          { sourceBranchKey: 'hq', targetStoreId: 's2', targetStoreBusinessId: 'biz_a' },
        ],
        requiredSourceBranchKeys: ['HQ'],
      }),
    ).toThrow(/Duplicate source branch/);

    expect(() =>
      assertBranchMappingsResolved({
        packageBusinessId: 'biz_a',
        mappings: [
          { sourceBranchKey: 'HQ', targetStoreId: 's1', targetStoreBusinessId: 'biz_a' },
        ],
        requiredSourceBranchKeys: ['HQ', 'BRANCH-2'],
      }),
    ).toThrow(/no target store mapping/);
  });

  it('requires exactly three Phase 1 files and matching tenants', () => {
    expect(() =>
      assertPackageHasExactlyThreePhase1Files([
        { entityType: 'SUPPLIERS', uploadChecksum: sha256Hex('a') },
        { entityType: 'PRODUCTS', uploadChecksum: sha256Hex('b') },
      ]),
    ).toThrow(/missing required OPENING_STOCK/);

    expect(() =>
      assertPackageHasExactlyThreePhase1Files([
        { entityType: 'SUPPLIERS', uploadChecksum: sha256Hex('a') },
        { entityType: 'PRODUCTS', uploadChecksum: sha256Hex('b') },
        { entityType: 'OPENING_STOCK', uploadChecksum: sha256Hex('c') },
      ]),
    ).not.toThrow();

    expect(() =>
      assertPackageFileTenantMatch({ packageBusinessId: 'biz_a', fileBusinessId: 'biz_b' }),
    ).toThrow(/does not match/);
  });
});

describe('existing-record safety policy', () => {
  it('blocks opening stock when inventory or trading exists and forbids fuzzy matching', () => {
    expect(EXISTING_RECORD_POLICY.fuzzyMatching).toBe(false);
    expect(EXISTING_RECORD_POLICY.ownerOverrideForLiveStock).toBe(false);
    expect(
      isOpeningStockBlockedByExistingActivity({
        hasInventoryBalance: true,
        hasTradingActivity: false,
      }),
    ).toBe(true);
    expect(mappedTargetMissingCode()).toBe('MAPPED_TARGET_MISSING');
  });
});
