import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { INVENTORY_GAIN_4100_NAME } from '@/lib/accounting-inventory-gain-4100';
import { isPostgresRuntimeEnv } from '@/lib/database-runtime';

/**
 * Accounts required for Inventory Increase Phase 2 journal posting.
 * Deliberately excludes the rest of CHART_OF_ACCOUNTS so empty-COA tenants
 * do not burn the interactive-transaction budget seeding unrelated codes.
 */
export const INVENTORY_INCREASE_REQUIRED_ACCOUNTS = [
  {
    code: ACCOUNT_CODES.inventory,
    name: 'Inventory',
    type: 'ASSET' as const,
  },
  {
    code: ACCOUNT_CODES.inventoryGain,
    name: INVENTORY_GAIN_4100_NAME,
    type: 'INCOME' as const,
  },
] as const;

export type InventoryIncreaseAccountSpec =
  (typeof INVENTORY_INCREASE_REQUIRED_ACCOUNTS)[number];

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

function specForCode(code: string): InventoryIncreaseAccountSpec {
  const spec = INVENTORY_INCREASE_REQUIRED_ACCOUNTS.find((a) => a.code === code);
  if (!spec) {
    throw new Error(`Unsupported inventory-increase account code ${code}`);
  }
  return spec;
}

/**
 * Reject incompatible existing mappings rather than posting to the wrong account.
 */
export function assertInventoryIncreaseAccountCompatible(account: AccountRow): void {
  const spec = specForCode(account.code);
  if (account.name !== spec.name || account.type !== spec.type) {
    throw new Error(
      `Account ${account.code} is configured as "${account.name}" (${account.type}) ` +
        `but inventory increase requires "${spec.name}" (${spec.type}). ` +
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
      code: { in: INVENTORY_INCREASE_REQUIRED_ACCOUNTS.map((a) => a.code) },
    },
    select: { id: true, code: true, name: true, type: true },
  });
  return new Map(rows.map((row) => [row.code, row]));
}

/**
 * Resolve or create only 1200 and 4100 inside the caller's transaction client.
 */
export async function ensureInventoryIncreaseAccounts(
  businessId: string,
  client: TxLike | PrismaClient,
): Promise<Map<string, string>> {
  const tx = client as TxLike;
  let byCode = await loadRequiredAccounts(tx, businessId);

  for (const existing of byCode.values()) {
    assertInventoryIncreaseAccountCompatible(existing);
  }

  const missing = INVENTORY_INCREASE_REQUIRED_ACCOUNTS.filter((a) => !byCode.has(a.code));
  if (missing.length === 0) {
    return new Map([...byCode.entries()].map(([code, row]) => [code, row.id]));
  }

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
    throw new Error('Transaction client cannot create inventory-increase accounts');
  }

  byCode = await loadRequiredAccounts(tx, businessId);
  for (const spec of INVENTORY_INCREASE_REQUIRED_ACCOUNTS) {
    const row = byCode.get(spec.code);
    if (!row) {
      throw new Error(`Account not found for code ${spec.code}`);
    }
    assertInventoryIncreaseAccountCompatible(row);
  }

  return new Map([...byCode.entries()].map(([code, row]) => [code, row.id]));
}
