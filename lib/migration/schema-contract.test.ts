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

describe('migration P0 schema contract', () => {
  const sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20260806130000_migration_framework_p0/migration.sql'),
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
    expect(MIGRATION_PACKAGE_STATUSES).not.toContain('MATCHED' as never);
    expect(MIGRATION_RECONCILIATION_STATUSES).toContain('MATCHED');
  });

  it('migration SQL creates package-oriented tables with tenant composite FKs', () => {
    expect(sql).toContain('CREATE TABLE "MigrationPackage"');
    expect(sql).toContain('CREATE TABLE "MigrationFile"');
    expect(sql).toContain('CREATE TABLE "MigrationBranchMapping"');
    expect(sql).toContain('MigrationFile_packageId_entityType_key');
    expect(sql).toContain('MigrationBranchMapping_businessId_targetStoreId_fkey');
    expect(sql).toContain('REFERENCES "Store"("businessId", "id")');
    expect(sql).not.toContain('CREATE TABLE "MigrationBatch"');
    expect(sql).not.toContain('CREATE TABLE "MigrationEntityMap"');
    expect(sql).not.toContain('CREATE TABLE "MigrationChunkReceipt"');
    expect(sql).not.toContain('CREATE TABLE "MigrationOpeningStockPosting"');
  });
});
