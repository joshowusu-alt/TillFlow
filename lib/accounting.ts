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
  prismaClient
}: {
  businessId: string;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  entryDate?: Date;
  lines: JournalLineInput[];
  prismaClient?: PrismaClient;
}) {
  const client = prismaClient ?? prisma;
  const accounts = await client.account.findMany({
    where: { businessId, code: { in: lines.map((line) => line.accountCode) } }
  });

  const accountMap = new Map(accounts.map((acc) => [acc.code, acc.id]));
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

  const missing = lines.find((line) => !accountMap.get(line.accountCode));
  if (missing) {
    throw new Error(`Account not found for code ${missing.accountCode}`);
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
          accountId: accountMap.get(line.accountCode) as string,
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
