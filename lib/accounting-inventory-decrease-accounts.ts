import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { INVENTORY_LOSS_5100_NAME } from '@/lib/accounting-inventory-loss-5100';
import { isPostgresRuntimeEnv } from '@/lib/database-runtime';

/**
 * Accounts required for Inventory Decrease Phase 1 journal posting.
 * Deliberately excludes the rest of CHART_OF_ACCOUNTS so empty-COA tenants
 * do not burn the interactive-transaction budget seeding unrelated codes.
 */
export const INVENTORY_DECREASE_REQUIRED_ACCOUNTS = [
  {
    code: ACCOUNT_CODES.inventory,
    name: 'Inventory',
    type: 'ASSET' as const,
  },
  {
    code: ACCOUNT_CODES.inventoryLoss,
    name: INVENTORY_LOSS_5100_NAME,
    type: 'EXPENSE' as const,
  },
] as const;

export type InventoryDecreaseAccountSpec =
  (typeof INVENTORY_DECREASE_REQUIRED_ACCOUNTS)[number];

type AccountRow = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type TxLike = {
  account: {
    findMany: (args: any) => Promise<AccountRow[]>;
    upsert?: (args: any) => Promise<AccountRow>;
  };
  $executeRaw?: (query: TemplateStringsArray | Prisma.Sql, ...values: any[]) => Promise<number>;
};

function specForCode(code: string): InventoryDecreaseAccountSpec {
  const spec = INVENTORY_DECREASE_REQUIRED_ACCOUNTS.find((a) => a.code === code);
  if (!spec) {
    throw new Error(`Unsupported inventory-decrease account code ${code}`);
  }
  return spec;
}

/**
 * Reject incompatible existing mappings rather than posting to the wrong account.
 * Legacy unused 5100 "Operating Expenses" is handled by assertAccount5100SafeForInventoryLoss
 * before this helper runs; once renamed it matches INVENTORY_LOSS_5100_NAME.
 */
export function assertInventoryDecreaseAccountCompatible(account: AccountRow): void {
  const spec = specForCode(account.code);
  if (account.name !== spec.name || account.type !== spec.type) {
    throw new Error(
      `Account ${account.code} is configured as "${account.name}" (${account.type}) ` +
        `but inventory decrease requires "${spec.name}" (${spec.type}). ` +
        'Refusing to post to an incorrectly configured account.',
    );
  }
}

async function loadRequiredAccounts(
  client: TxLike,
  businessId: string,
): Promise<Map<string, AccountRow>> {
  const rows = await client.account.findMany({
    where: {
      businessId,
      code: { in: INVENTORY_DECREASE_REQUIRED_ACCOUNTS.map((a) => a.code) },
    },
    select: { id: true, code: true, name: true, type: true },
  });
  return new Map(rows.map((row) => [row.code, row]));
}

/**
 * Resolve or create only 1200 and 5100 inside the caller's transaction client.
 *
 * - Empty COA → creates exactly those two accounts
 * - Partial COA → reuses existing, creates the missing one
 * - Complete → reuses both, creates none
 * - Concurrent → unique (businessId, code) + ON CONFLICT / upsert; re-read after insert
 * - Incompatible existing mapping → throws (caller must roll back)
 *
 * Returns code → accountId for postJournalEntry(accountMap).
 */
export async function ensureInventoryDecreaseAccounts(
  businessId: string,
  client: TxLike | PrismaClient,
): Promise<Map<string, string>> {
  const tx = client as TxLike;
  let byCode = await loadRequiredAccounts(tx, businessId);

  for (const existing of byCode.values()) {
    assertInventoryDecreaseAccountCompatible(existing);
  }

  const missing = INVENTORY_DECREASE_REQUIRED_ACCOUNTS.filter((a) => !byCode.has(a.code));
  if (missing.length === 0) {
    return new Map([...byCode.entries()].map(([code, row]) => [code, row.id]));
  }

  // Prefer a single INSERT ... ON CONFLICT when Postgres is available (Production
  // often has POSTGRES_* without DATABASE_URL). Fall back to per-code upsert.
  if (isPostgresRuntimeEnv(process.env) && typeof tx.$executeRaw === 'function') {
    const values = missing.map(
      (a) =>
        Prisma.sql`(gen_random_uuid()::text, ${businessId}, ${a.code}, ${a.name}, ${a.type}, NOW())`,
    );
    await tx.$executeRaw`
      INSERT INTO "Account" ("id", "businessId", "code", "name", "type", "createdAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("businessId", "code") DO NOTHING
    `;
  } else if (typeof tx.account.upsert === 'function') {
    for (const a of missing) {
      await tx.account.upsert({
        where: { businessId_code: { businessId, code: a.code } },
        update: {},
        create: { businessId, code: a.code, name: a.name, type: a.type },
      });
    }
  } else {
    throw new Error('Transaction client cannot create inventory-decrease accounts');
  }

  // Re-read after insert/conflict so concurrent creators resolve to the same IDs.
  byCode = await loadRequiredAccounts(tx, businessId);
  for (const spec of INVENTORY_DECREASE_REQUIRED_ACCOUNTS) {
    const row = byCode.get(spec.code);
    if (!row) {
      throw new Error(`Account not found for code ${spec.code}`);
    }
    assertInventoryDecreaseAccountCompatible(row);
  }

  return new Map([...byCode.entries()].map(([code, row]) => [code, row.id]));
}
