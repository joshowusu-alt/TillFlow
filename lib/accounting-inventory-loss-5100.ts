import type { PrismaClient } from '@prisma/client';
import { ACCOUNT_CODES } from '@/lib/accounting';

export const LEGACY_5100_OPERATING_EXPENSES_NAME = 'Operating Expenses';
export const INVENTORY_LOSS_5100_NAME = 'Inventory Loss & Shrinkage';

export type Account5100Conflict = {
  businessId: string;
  accountId: string;
  name: string;
  journalLineCount: number;
  debitPence: number;
  creditPence: number;
};

type TxLike = {
  account: {
    findMany: (args: any) => Promise<any[]>;
    updateMany: (args: any) => Promise<{ count: number }>;
  };
  journalLine: {
    groupBy: (args: any) => Promise<any[]>;
  };
  $executeRaw?: (...args: any[]) => Promise<number>;
};

/**
 * Inspect every account coded 5100.
 * Used for pre-deploy evidence and runtime conflict detection.
 */
export async function inspectAccount5100Usage(
  client: TxLike | PrismaClient,
): Promise<{
  totalAccounts: number;
  legacyUnused: Account5100Conflict[];
  legacyWithPostings: Account5100Conflict[];
  alreadyCorrect: Account5100Conflict[];
  customNamed: Account5100Conflict[];
}> {
  const accounts = await client.account.findMany({
    where: { code: ACCOUNT_CODES.inventoryLoss },
    select: { id: true, businessId: true, name: true },
  });

  if (accounts.length === 0) {
    return {
      totalAccounts: 0,
      legacyUnused: [],
      legacyWithPostings: [],
      alreadyCorrect: [],
      customNamed: [],
    };
  }

  const totals = await client.journalLine.groupBy({
    by: ['accountId'],
    where: { accountId: { in: accounts.map((a) => a.id) } },
    _count: { _all: true },
    _sum: { debitPence: true, creditPence: true },
  });
  const totalsByAccount = new Map(
    totals.map((row) => [
      row.accountId as string,
      {
        journalLineCount: row._count._all as number,
        debitPence: (row._sum.debitPence as number | null) ?? 0,
        creditPence: (row._sum.creditPence as number | null) ?? 0,
      },
    ]),
  );

  const legacyUnused: Account5100Conflict[] = [];
  const legacyWithPostings: Account5100Conflict[] = [];
  const alreadyCorrect: Account5100Conflict[] = [];
  const customNamed: Account5100Conflict[] = [];

  for (const account of accounts) {
    const usage = totalsByAccount.get(account.id) ?? {
      journalLineCount: 0,
      debitPence: 0,
      creditPence: 0,
    };
    const row: Account5100Conflict = {
      businessId: account.businessId,
      accountId: account.id,
      name: account.name,
      ...usage,
    };

    if (account.name === INVENTORY_LOSS_5100_NAME) {
      alreadyCorrect.push(row);
      continue;
    }
    if (account.name === LEGACY_5100_OPERATING_EXPENSES_NAME) {
      if (row.journalLineCount === 0) legacyUnused.push(row);
      else legacyWithPostings.push(row);
      continue;
    }
    customNamed.push(row);
  }

  return {
    totalAccounts: accounts.length,
    legacyUnused,
    legacyWithPostings,
    alreadyCorrect,
    customNamed,
  };
}

/**
 * Idempotent, tenant-safe rename:
 * only code 5100 + exact legacy name "Operating Expenses" + zero journal lines.
 * Never touches custom names or posted accounts.
 */
export async function renameLegacyUnusedOperatingExpenses5100(
  client: TxLike | PrismaClient,
): Promise<{ renamed: number }> {
  const inspection = await inspectAccount5100Usage(client);
  if (inspection.legacyUnused.length === 0) {
    return { renamed: 0 };
  }

  const result = await client.account.updateMany({
    where: {
      code: ACCOUNT_CODES.inventoryLoss,
      name: LEGACY_5100_OPERATING_EXPENSES_NAME,
      id: { in: inspection.legacyUnused.map((row) => row.accountId) },
      journalLines: { none: {} },
    },
    data: { name: INVENTORY_LOSS_5100_NAME },
  });

  return { renamed: result.count };
}

/**
 * Runtime / pre-deploy gate: refuse inventory-loss posting when 5100 is still
 * the legacy Operating Expenses label (especially if it has historic lines).
 */
export async function assertAccount5100SafeForInventoryLoss(
  client: TxLike | PrismaClient,
  businessId: string,
): Promise<void> {
  const accounts = await client.account.findMany({
    where: { businessId, code: ACCOUNT_CODES.inventoryLoss },
    select: { id: true, name: true },
  });
  if (accounts.length === 0) return; // ensureChartOfAccounts will create the correct name

  const account = accounts[0];
  if (account.name === INVENTORY_LOSS_5100_NAME) return;

  if (account.name === LEGACY_5100_OPERATING_EXPENSES_NAME) {
    const usage = await client.journalLine.groupBy({
      by: ['accountId'],
      where: { accountId: account.id },
      _count: { _all: true },
    });
    const lineCount = usage[0]?._count._all ?? 0;
    if (lineCount > 0) {
      throw new Error(
        `Account 5100 is still named "${LEGACY_5100_OPERATING_EXPENSES_NAME}" and has ${lineCount} journal line(s). ` +
          'Do not rename it silently. Use a dedicated inventory-loss account or an explicit reclassification plan.',
      );
    }
    // Unused legacy name should have been renamed by migration; fix opportunistically.
    await client.account.updateMany({
      where: {
        id: account.id,
        code: ACCOUNT_CODES.inventoryLoss,
        name: LEGACY_5100_OPERATING_EXPENSES_NAME,
        journalLines: { none: {} },
      },
      data: { name: INVENTORY_LOSS_5100_NAME },
    });
    return;
  }

  throw new Error(
    `Account 5100 is named "${account.name}" and is not the approved Inventory Loss & Shrinkage account. ` +
      'Refusing to post inventory decreases to a customised or conflicting account.',
  );
}
