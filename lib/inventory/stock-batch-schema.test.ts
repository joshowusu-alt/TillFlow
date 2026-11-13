import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('stock batch schema', () => {
  const migration = read('prisma/migrations/20261113180000_stock_batches/migration.sql');

  it('adds the receipt table without rewriting existing stock', () => {
    expect(migration).toContain('CREATE TABLE "StockBatch"');
    expect(migration).not.toMatch(/DROP /i);
    expect(migration).not.toMatch(/DELETE FROM/i);
    expect(migration).not.toMatch(/ALTER TABLE "InventoryBalance"/);
    expect(migration).toContain("CHECK (\"source\" IN ('PURCHASE', 'OPENING_STOCK', 'IMPORT'))");
    expect(migration).toContain('"expiryDate" >= "productionDate"');
  });

  it('mirrors the model on the sqlite and postgres schemas', () => {
    for (const schema of [read('prisma/schema.prisma'), read('prisma/schema.postgres.prisma')]) {
      expect(schema).toContain('model StockBatch');
      expect(schema).toContain('qtyReceivedBase');
      expect(schema).toContain('productionDate');
      expect(schema).toContain('expiryDate');
      expect(schema).toContain('openingReferenceId');
      expect(schema).toContain('stockBatches           StockBatch[]');
    }
  });
});
