import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  INVENTORY_LOSS_5100_NAME,
  LEGACY_5100_OPERATING_EXPENSES_NAME,
  assertAccount5100SafeForInventoryLoss,
  inspectAccount5100Usage,
  renameLegacyUnusedOperatingExpenses5100,
} from './accounting-inventory-loss-5100';

describe('5100 inventory-loss remediation migration SQL', () => {
  const sql = readFileSync(
    join(process.cwd(), 'prisma/migrations/20260802120000_inventory_decrease_phase1/migration.sql'),
    'utf8',
  );

  it('renames only unused legacy Operating Expenses on code 5100', () => {
    expect(sql).toContain("SET \"name\" = 'Inventory Loss & Shrinkage'");
    expect(sql).toContain("\"code\" = '5100'");
    expect(sql).toContain("\"name\" = 'Operating Expenses'");
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('"JournalLine"');
  });

  it('does not drop or recreate Account rows (preserves journal FKs)', () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"Account"/i);
    expect(sql).not.toMatch(/DROP\s+TABLE\s+"Account"/i);
  });
});

describe('inspectAccount5100Usage / renameLegacyUnusedOperatingExpenses5100', () => {
  const client = {
    account: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    journalLine: {
      groupBy: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies unused legacy, posted legacy, correct, and custom names', async () => {
    client.account.findMany.mockResolvedValue([
      { id: 'a1', businessId: 'b1', name: LEGACY_5100_OPERATING_EXPENSES_NAME },
      { id: 'a2', businessId: 'b2', name: LEGACY_5100_OPERATING_EXPENSES_NAME },
      { id: 'a3', businessId: 'b3', name: INVENTORY_LOSS_5100_NAME },
      { id: 'a4', businessId: 'b4', name: 'Custom Loss' },
    ]);
    client.journalLine.groupBy.mockResolvedValue([
      { accountId: 'a2', _count: { _all: 3 }, _sum: { debitPence: 1500, creditPence: 0 } },
    ]);

    const result = await inspectAccount5100Usage(client as any);
    expect(result.legacyUnused).toEqual([
      expect.objectContaining({ businessId: 'b1', journalLineCount: 0 }),
    ]);
    expect(result.legacyWithPostings).toEqual([
      expect.objectContaining({
        businessId: 'b2',
        journalLineCount: 3,
        debitPence: 1500,
      }),
    ]);
    expect(result.alreadyCorrect).toHaveLength(1);
    expect(result.customNamed).toHaveLength(1);
  });

  it('renames only unused legacy accounts and is idempotent when none remain', async () => {
    client.account.findMany.mockResolvedValue([
      { id: 'a1', businessId: 'b1', name: LEGACY_5100_OPERATING_EXPENSES_NAME },
    ]);
    client.journalLine.groupBy.mockResolvedValue([]);
    client.account.updateMany.mockResolvedValue({ count: 1 });

    const first = await renameLegacyUnusedOperatingExpenses5100(client as any);
    expect(first.renamed).toBe(1);
    expect(client.account.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: LEGACY_5100_OPERATING_EXPENSES_NAME,
          journalLines: { none: {} },
        }),
        data: { name: INVENTORY_LOSS_5100_NAME },
      }),
    );

    client.account.findMany.mockResolvedValue([
      { id: 'a1', businessId: 'b1', name: INVENTORY_LOSS_5100_NAME },
    ]);
    const second = await renameLegacyUnusedOperatingExpenses5100(client as any);
    expect(second.renamed).toBe(0);
  });

  it('does not rename legacy accounts that already have journal postings', async () => {
    client.account.findMany.mockResolvedValue([
      { id: 'a2', businessId: 'b2', name: LEGACY_5100_OPERATING_EXPENSES_NAME },
    ]);
    client.journalLine.groupBy.mockResolvedValue([
      { accountId: 'a2', _count: { _all: 2 }, _sum: { debitPence: 900, creditPence: 0 } },
    ]);

    const result = await renameLegacyUnusedOperatingExpenses5100(client as any);
    expect(result.renamed).toBe(0);
    expect(client.account.updateMany).not.toHaveBeenCalled();
  });
});

describe('assertAccount5100SafeForInventoryLoss', () => {
  const client = {
    account: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    journalLine: {
      groupBy: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows missing account (seed will create correct name)', async () => {
    client.account.findMany.mockResolvedValue([]);
    await expect(assertAccount5100SafeForInventoryLoss(client as any, 'b1')).resolves.toBeUndefined();
  });

  it('allows correctly named account', async () => {
    client.account.findMany.mockResolvedValue([{ id: 'a1', name: INVENTORY_LOSS_5100_NAME }]);
    await expect(assertAccount5100SafeForInventoryLoss(client as any, 'b1')).resolves.toBeUndefined();
  });

  it('renames unused legacy Operating Expenses opportunistically', async () => {
    client.account.findMany.mockResolvedValue([
      { id: 'a1', name: LEGACY_5100_OPERATING_EXPENSES_NAME },
    ]);
    client.journalLine.groupBy.mockResolvedValue([]);
    client.account.updateMany.mockResolvedValue({ count: 1 });
    await assertAccount5100SafeForInventoryLoss(client as any, 'b1');
    expect(client.account.updateMany).toHaveBeenCalled();
  });

  it('refuses posted legacy Operating Expenses without renaming', async () => {
    client.account.findMany.mockResolvedValue([
      { id: 'a1', name: LEGACY_5100_OPERATING_EXPENSES_NAME },
    ]);
    client.journalLine.groupBy.mockResolvedValue([{ accountId: 'a1', _count: { _all: 4 } }]);
    await expect(assertAccount5100SafeForInventoryLoss(client as any, 'b1')).rejects.toThrow(
      /Do not rename it silently/,
    );
    expect(client.account.updateMany).not.toHaveBeenCalled();
  });

  it('refuses customised non-approved 5100 names', async () => {
    client.account.findMany.mockResolvedValue([{ id: 'a1', name: 'Owner Special Expense' }]);
    await expect(assertAccount5100SafeForInventoryLoss(client as any, 'b1')).rejects.toThrow(
      /customised or conflicting account/,
    );
  });
});
