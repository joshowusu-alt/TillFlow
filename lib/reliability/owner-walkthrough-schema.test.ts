import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sqlite = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const postgres = readFileSync(join(process.cwd(), 'prisma/schema.postgres.prisma'), 'utf8');
const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260917180000_owner_walkthrough_integrity/migration.sql'),
  'utf8',
);
const numbersMigration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260918140000_walkthrough_store_numbers/migration.sql'),
  'utf8',
);

describe('owner walkthrough additive schema', () => {
  it('keeps the migration additive (no DROP / destructive rewrite)', () => {
    expect(migration).not.toMatch(/DROP TABLE/i);
    expect(migration).not.toMatch(/DROP COLUMN/i);
    expect(migration).toContain('ALTER TABLE "PurchaseInvoice" ADD COLUMN "transactionNumber"');
    expect(migration).toContain('CREATE TABLE "CashVarianceInvestigation"');
    expect(migration).toContain('ADD COLUMN "countState"');
    expect(migration).toContain('ADD COLUMN "reversalOfId"');
    expect(numbersMigration).not.toMatch(/DROP TABLE/i);
    expect(numbersMigration).toContain('SalesPayment');
    expect(numbersMigration).toContain('StockAdjustment_storeId_transactionNumber_key');
    expect(numbersMigration).toContain('Stocktake_storeId_transactionNumber_key');
    expect(numbersMigration).toContain('Shift_tillId_closureNumber_key');
  });

  it('mirrors presentation numbers, count state, and variance investigation on both schemas', () => {
    for (const schema of [sqlite, postgres]) {
      expect(schema).toContain('model CashVarianceInvestigation');
      expect(schema).toContain('reversalOfId');
      expect(schema).toContain('countState');
      expect(schema).toContain('sourceAdjustmentId');
      expect(schema).toContain('closureNumber');
    }
  });
});
