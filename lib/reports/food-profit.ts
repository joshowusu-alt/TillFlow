import type { Prisma } from '@prisma/client';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { isFoodBusiness } from '@/lib/food/business';
import type { MarginSetResult } from './margin-line';

type FoodLedger = Pick<Prisma.TransactionClient, 'journalLine'>;
type Period = { businessId: string; startInclusive: Date; endExclusive: Date };

export async function loadFoodCostTotal(db: FoodLedger, period: Period) {
  const totals = await db.journalLine.aggregate({
    where: {
      journalEntry: { businessId: period.businessId, entryDate: { gte: period.startInclusive, lt: period.endExclusive } },
      account: { businessId: period.businessId, type: 'EXPENSE', OR: [
        { code: ACCOUNT_CODES.foodCosts, name: 'Food costs' },
        { code: ACCOUNT_CODES.foodWaste, name: 'Food waste' },
      ] },
    },
    _sum: { debitPence: true, creditPence: true },
  });
  return (totals._sum.debitPence ?? 0) - (totals._sum.creditPence ?? 0);
}

/** Food journals are business-wide. Branch-only sales cannot be matched to those costs. */
export async function applyFoodProfit(
  db: FoodLedger,
  period: Period & { businessCategory?: string | null; branchScoped?: boolean },
  margin: MarginSetResult,
): Promise<MarginSetResult & { seeProfitAndLoss?: true }> {
  if (!isFoodBusiness(period.businessCategory)) return margin;
  if (period.branchScoped) return { ...margin, grossProfitPence: null, grossProfitPercent: null, seeProfitAndLoss: true };
  if (margin.grossProfitPence == null) return margin;
  const grossProfitPence = margin.grossProfitPence - await loadFoodCostTotal(db, period);
  return {
    ...margin,
    grossProfitPence,
    grossProfitPercent: margin.recognisedSalesPence > 0 ? Math.round(grossProfitPence * 100 / margin.recognisedSalesPence) : 0,
  };
}
