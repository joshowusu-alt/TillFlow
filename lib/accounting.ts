import { prisma } from '@/lib/prisma';
import type { PrismaClient } from '@prisma/client';

export const ACCOUNT_CODES = {
  cash: '1000',
  bank: '1010',
  ar: '1100',
  inventory: '1200',
  vatReceivable: '1300',
  ap: '2000',
  vatPayable: '2100',
  equity: '3000',
  sales: '4000',
  cogs: '5000',
  operatingExpenses: '6000'
};

/** Full chart of accounts used for every business. */
export const CHART_OF_ACCOUNTS = [
  { code: '1000', name: 'Cash on Hand',          type: 'ASSET' as const },
  { code: '1010', name: 'Bank',                   type: 'ASSET' as const },
  { code: '1100', name: 'Accounts Receivable',    type: 'ASSET' as const },
  { code: '1200', name: 'Inventory',              type: 'ASSET' as const },
  { code: '1300', name: 'VAT Receivable',         type: 'ASSET' as const },
  { code: '2000', name: 'Accounts Payable',       type: 'LIABILITY' as const },
  { code: '2100', name: 'VAT Payable',            type: 'LIABILITY' as const },
  { code: '3000', name: 'Retained Earnings',      type: 'EQUITY' as const },
  { code: '4000', name: 'Sales Revenue',          type: 'INCOME' as const },
  { code: '5000', name: 'Cost of Goods Sold',     type: 'EXPENSE' as const },
  { code: '6000', name: 'Operating Expenses',     type: 'EXPENSE' as const },
  { code: '6100', name: 'Rent',                   type: 'EXPENSE' as const },
  { code: '6200', name: 'Utilities',              type: 'EXPENSE' as const },
  { code: '6300', name: 'Salaries',               type: 'EXPENSE' as const },
  { code: '6400', name: 'Repairs & Maintenance',  type: 'EXPENSE' as const },
  { code: '6500', name: 'Fuel & Transport',       type: 'EXPENSE' as const },
  { code: '6600', name: 'Marketing',              type: 'EXPENSE' as const },
];

/**
 * Idempotently ensures all standard chart-of-accounts entries exist for a business.
 * Safe to call multiple times — existing accounts are not modified.
 */
export async function ensureChartOfAccounts(businessId: string, client: PrismaClient = prisma) {
  await client.account.createMany({
    data: CHART_OF_ACCOUNTS.map(a => ({ businessId, ...a })),
    skipDuplicates: true,
  });
}

type JournalLineInput = {
  accountCode: string;
  debitPence?: number;
  creditPence?: number;
  memo?: string;
};

export async function postJournalEntry({
  businessId,
  description,
  referenceType,
  referenceId,
  entryDate,
  lines,
  prismaClient,
  accountMap: preloadedAccountMap
}: {
  businessId: string;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  entryDate?: Date;
  lines: JournalLineInput[];
  prismaClient?: PrismaClient;
  /** Pre-fetched account code → id map. Skips the DB lookup when provided. */
  accountMap?: Map<string, string>;
}) {
  const client = prismaClient ?? prisma;

  let accountMap = preloadedAccountMap;
  if (!accountMap) {
    const accounts = await client.account.findMany({
      where: { businessId, code: { in: lines.map((line) => line.accountCode) } }
    });
    accountMap = new Map(accounts.map((acc) => [acc.code, acc.id]));
  }

  // If any account is missing, auto-seed the full chart and retry lookup once.
  const missing = lines.find((line) => !accountMap!.get(line.accountCode));
  if (missing) {
    await ensureChartOfAccounts(businessId, client as PrismaClient);
    const accounts = await client.account.findMany({
      where: { businessId, code: { in: lines.map((line) => line.accountCode) } }
    });
    accountMap = new Map(accounts.map((acc) => [acc.code, acc.id]));

    // If still missing after seeding, the code itself is unknown — hard fail.
    const stillMissing = lines.find((line) => !accountMap!.get(line.accountCode));
    if (stillMissing) {
      throw new Error(`Account not found for code ${stillMissing.accountCode}`);
    }
  }

  const totals = lines.reduce(
    (acc, line) => {
      acc.debit += line.debitPence ?? 0;
      acc.credit += line.creditPence ?? 0;
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  if (totals.debit !== totals.credit) {
    throw new Error(`Unbalanced journal entry: ${totals.debit} != ${totals.credit}`);
  }

  return client.journalEntry.create({
    data: {
      businessId,
      description,
      referenceType,
      referenceId,
      entryDate: entryDate ?? new Date(),
      lines: {
        create: lines.map((line) => ({
          accountId: accountMap!.get(line.accountCode) as string,
          debitPence: line.debitPence ?? 0,
          creditPence: line.creditPence ?? 0,
          memo: line.memo
        }))
      }
    }
  });
}

export function sum(lines: { debitPence: number; creditPence: number }[]) {
  return lines.reduce(
    (acc, line) => {
      acc.debit += line.debitPence;
      acc.credit += line.creditPence;
      return acc;
    },
    { debit: 0, credit: 0 }
  );
}
