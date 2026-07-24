/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Phase 1 migration schema contract', () => {
  const sqlite = read('prisma/schema.prisma');
  const pg = read('prisma/schema.postgres.prisma');
  const sql = read('prisma/migrations/20260724120000_migration_framework_phase1/migration.sql');

  it('keeps dual Prisma schemas aligned on source-namespaced uniqueness', () => {
    for (const schema of [sqlite, pg]) {
      expect(schema).toContain('@@unique([businessId, sourceSystemKey, entityType, sourceReference])');
      expect(schema).toContain('@@unique([businessId, id])');
      expect(schema).toContain(
        'fields: [businessId, migrationBatchId], references: [businessId, id]',
      );
      expect(schema).toContain('model MigrationOpeningStockPosting');
      expect(schema).toContain('reconciliationStatus');
      expect(schema).toContain('approvedFileChecksum');
      expect(schema).toContain('sourceSystemKey');
      expect(schema).not.toMatch(/enum\s+Migration/);
    }
  });

  it('SQL enforces composite tenant FKs and CHECKs', () => {
    expect(sql).toContain('MigrationBatch_businessId_id_key');
    expect(sql).toContain(
      'FOREIGN KEY ("businessId", "migrationBatchId") REFERENCES "MigrationBatch"("businessId", "id")',
    );
    expect(sql).toContain(
      'MigrationEntityMap_businessId_sourceSystemKey_entityType_sourceReference_key',
    );
    expect(sql).toContain(
      'MigrationOpeningStockPosting_businessId_migrationBatchId_storeId_productId_key',
    );
    expect(sql).toContain("CHECK (\"status\" IN (");
    expect(sql).toContain("'READY_FOR_APPROVAL'");
    expect(sql).toContain("'COMPLETED_WITH_EXCEPTIONS'");
    expect(sql).toContain("CHECK (\"reconciliationStatus\" IN (");
    expect(sql).toContain("'MISMATCHED'");
    expect(sql).toContain("'ACCEPTED'");
    expect(sql).toContain('MigrationBatch_sourceSystemKey_check');
    expect(sql).toContain('ON DELETE SET NULL');
    expect(sql).toContain('ON DELETE CASCADE');
  });

  it('documents polymorphic targetId with no FK', () => {
    expect(sqlite).toMatch(/Polymorphic TillFlow id/);
    expect(sqlite).toMatch(/targetId\s+String/);
    expect(sql).not.toMatch(/MigrationEntityMap_targetId_fkey/);
  });
});
