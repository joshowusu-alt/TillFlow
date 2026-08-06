/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIGRATION_CONTRACT_VERSION,
  MIGRATION_ENTITY_TYPES,
  MIGRATION_PACKAGE_STATUSES,
  MIGRATION_RECONCILIATION_STATUSES,
} from '@/lib/migration/types';
import {
  MIGRATION_APPROVAL_VALIDITY_DAYS,
  MIGRATION_COMPRESSION_ALLOWED,
  MIGRATION_MAX_COLUMNS,
  MIGRATION_MAX_ROWS,
  MIGRATION_MAX_UNCOMPRESSED_BYTES,
  MIGRATION_MAX_UPLOAD_BYTES,
  MIGRATION_UNAPPROVED_EXPIRY_DAYS,
} from '@/lib/migration/limits';

describe('migration P1 schema contract', () => {
  const p0Sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20260806130000_migration_framework_p0/migration.sql'),
    'utf8',
  );
  const p1Sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260806170000_migration_framework_p1_slice1_schema/migration.sql',
    ),
    'utf8',
  );

  it('locks contract version and Phase 1 entity set', () => {
    expect(MIGRATION_CONTRACT_VERSION).toBe('1');
    expect([...MIGRATION_ENTITY_TYPES]).toEqual(['SUPPLIERS', 'PRODUCTS', 'OPENING_STOCK']);
  });

  it('keeps package lifecycle and reconciliation statuses distinct', () => {
    for (const status of MIGRATION_RECONCILIATION_STATUSES) {
      expect(MIGRATION_PACKAGE_STATUSES).not.toContain(status as never);
    }
    expect(MIGRATION_PACKAGE_STATUSES).toContain('SUPERSEDED');
    expect(MIGRATION_PACKAGE_STATUSES).not.toContain('MATCHED' as never);
    expect(MIGRATION_RECONCILIATION_STATUSES).toContain('MATCHED');
  });

  it('locks P1 contractual file limits', () => {
    expect(MIGRATION_MAX_UPLOAD_BYTES).toBe(26_214_400);
    expect(MIGRATION_MAX_UNCOMPRESSED_BYTES).toBe(26_214_400);
    expect(MIGRATION_MAX_ROWS).toBe(50_000);
    expect(MIGRATION_MAX_COLUMNS).toBe(32);
    expect(MIGRATION_UNAPPROVED_EXPIRY_DAYS).toBe(14);
    expect(MIGRATION_APPROVAL_VALIDITY_DAYS).toBe(14);
    expect(MIGRATION_COMPRESSION_ALLOWED).toBe(false);
  });

  it('P0 migration SQL creates package-oriented tables with tenant composite FKs', () => {
    expect(p0Sql).toContain('CREATE TABLE "MigrationPackage"');
    expect(p0Sql).toContain('CREATE TABLE "MigrationFile"');
    expect(p0Sql).toContain('CREATE TABLE "MigrationBranchMapping"');
    expect(p0Sql).toContain('MigrationFile_packageId_entityType_key');
    expect(p0Sql).toContain('MigrationBranchMapping_businessId_targetStoreId_fkey');
    expect(p0Sql).toContain('REFERENCES "Store"("businessId", "id")');
  });

  it('P1 migration SQL adds lineage, evidence tables, and invariants', () => {
    expect(p1Sql).toContain('CREATE TABLE "MigrationValidationRun"');
    expect(p1Sql).toContain('CREATE TABLE "MigrationApprovalHistory"');
    expect(p1Sql).toContain('User_businessId_id_key');
    expect(p1Sql).toContain('MigrationPackage_predecessorPackageId_key');
    expect(p1Sql).toContain('MigrationPackage_businessId_predecessorPackageId_fkey');
    expect(p1Sql).toContain('MigrationPackage_predecessor_not_self_check');
    expect(p1Sql).toContain('MigrationPackage_recon_imported_only_check');
    expect(p1Sql).toContain("'SUPERSEDED'");
    expect(p1Sql).toContain('storageStatus');
    expect(p1Sql).not.toContain('supersededByPackageId');
    expect(p1Sql).not.toContain('CREATE TABLE "MigrationEntityMap"');
    expect(p1Sql).not.toContain('CREATE TABLE "MigrationChunkReceipt"');
  });

  it('P1 ownership correction enforces same-business and same-package latest runs', () => {
    const ownershipSql = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20260806183000_migration_p1_slice1_latest_run_ownership/migration.sql',
      ),
      'utf8',
    );
    expect(ownershipSql).toContain('MigrationValidationRun_id_packageId_key');
    expect(ownershipSql).toContain('MigrationPackage_businessId_latestValidationRunId_fkey');
    expect(ownershipSql).toContain('MigrationPackage_latestValidationRunId_id_fkey');
    expect(ownershipSql).toContain('ON DELETE RESTRICT');
    expect(ownershipSql).toMatch(/constraint strengthening|Constraint strengthening/i);
  });

  it('documents that uniqueness is at-most-one per entity type, not completeness', () => {
    expect(MIGRATION_ENTITY_TYPES).toHaveLength(3);
  });
});
