import type { Prisma } from '@prisma/client';
import { ACCOUNT_CODES } from '@/lib/accounting';

export async function readFoodCostBalance(tx: Prisma.TransactionClient, businessId: string) {
  const { _sum } = await tx.journalLine.aggregate({
    where: {
      account: { businessId, code: ACCOUNT_CODES.foodCosts, name: 'Food costs', type: 'EXPENSE' },
      journalEntry: { businessId },
    },
    _sum: { debitPence: true, creditPence: true },
  });
  return (_sum.debitPence ?? 0) - (_sum.creditPence ?? 0);
}
