import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES } from '@/lib/accounting';

export type ForecastDay = {
  date: string;
  expectedInflowPence: number;
  expectedOutflowPence: number;
  projectedBalancePence: number;
  scenarioBestPence: number;
  scenarioWorstPence: number;
};

export type ForecastResult = {
  startingCashPence: number;
  days: ForecastDay[];
  summary: {
    daysUntilNegative: number | null;
    lowestPointPence: number;
    lowestPointDate: string;
  };
};

export type ForecastInputs = {
  startingCashPence: number;
  arByDay: Map<string, number>; // dateKey -> total expected inflow
  apByDay: Map<string, number>; // dateKey -> total expected outflow
  avgDailyExpensesPence: number;
  avgDailyCashSalesPence: number;
  days: number;
};

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function projectCashflow(inputs: ForecastInputs): ForecastResult {
  const days: ForecastDay[] = [];
  let runningBalance = inputs.startingCashPence;
  let runningBest = inputs.startingCashPence;
  let runningWorst = inputs.startingCashPence;

  let lowestPence = inputs.startingCashPence;
  let lowestDate = dateKey(new Date());
  let daysUntilNegative: number | null = null;

  for (let i = 1; i <= inputs.days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dk = dateKey(d);

    const arInflow = inputs.arByDay.get(dk) ?? 0;
    const apOutflow = inputs.apByDay.get(dk) ?? 0;

    // Expected scenario: 85% AR collection + baseline cash sales
    const expectedInflow = Math.round(arInflow * 0.85) + inputs.avgDailyCashSalesPence;
    const expectedOutflow = apOutflow + inputs.avgDailyExpensesPence;

    runningBalance += expectedInflow - expectedOutflow;

    // Best: 100% AR + 110% cash sales
    const bestInflow = arInflow + Math.round(inputs.avgDailyCashSalesPence * 1.1);
    runningBest += bestInflow - expectedOutflow;

    // Worst: 60% AR + 80% cash sales
    const worstInflow = Math.round(arInflow * 0.6) + Math.round(inputs.avgDailyCashSalesPence * 0.8);
    runningWorst += worstInflow - expectedOutflow;

    days.push({
      date: dk,
      expectedInflowPence: expectedInflow,
      expectedOutflowPence: expectedOutflow,
      projectedBalancePence: runningBalance,
      scenarioBestPence: runningBest,
      scenarioWorstPence: runningWorst,
    });

    if (runningBalance < lowestPence) {
      lowestPence = runningBalance;
      lowestDate = dk;
    }

    if (daysUntilNegative === null && runningBalance < 0) {
      daysUntilNegative = i;
    }
  }

  return {
    startingCashPence: inputs.startingCashPence,
    days,
    summary: {
      daysUntilNegative,
      lowestPointPence: lowestPence,
      lowestPointDate: lowestDate,
    },
  };
}

export async function getCashflowForecast(
  businessId: string,
  days: 7 | 14 | 30 = 14
): Promise<ForecastResult> {
  const now = new Date();

  // 1. Starting cash: sum journal lines for cash account
  const cashLines = await prisma.journalLine.findMany({
    where: {
      account: { businessId, code: ACCOUNT_CODES.cash },
      journalEntry: { entryDate: { lte: now } },
    },
    include: { account: true },
  });
  const cashBalance = cashLines.reduce((sum, line) => {
    if (line.account.type === 'ASSET') return sum + line.debitPence - line.creditPence;
    return sum + line.creditPence - line.debitPence;
  }, 0);

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { openingCapitalPence: true },
  });
  const startingCash = cashBalance + (business.openingCapitalPence ?? 0);

  // 2. AR: unpaid sales invoices grouped by due date
  const unpaidSales = await prisma.salesInvoice.findMany({
    where: {
      businessId,
      paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
    },
    select: {
      totalPence: true,
      dueDate: true,
      createdAt: true,
      payments: { select: { amountPence: true } },
      customer: { select: { paymentTermsDays: true } },
    },
  });

  const arByDay = new Map<string, number>();
  for (const inv of unpaidSales) {
    const paid = inv.payments.reduce((s, p) => s + p.amountPence, 0);
    const remaining = Math.max(inv.totalPence - paid, 0);
    if (remaining <= 0) continue;

    let expectedDate: Date;
    if (inv.dueDate) {
      expectedDate = new Date(inv.dueDate);
    } else {
      const termDays = inv.customer?.paymentTermsDays ?? 7;
      expectedDate = new Date(inv.createdAt);
      expectedDate.setDate(expectedDate.getDate() + termDays);
    }

    // If already past due, assume collection spread over next 7 days
    if (expectedDate < now) {
      const dailyPortion = Math.round(remaining / 7);
      for (let i = 1; i <= 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const dk = dateKey(d);
        arByDay.set(dk, (arByDay.get(dk) ?? 0) + dailyPortion);
      }
    } else {
      const dk = dateKey(expectedDate);
      arByDay.set(dk, (arByDay.get(dk) ?? 0) + remaining);
    }
  }

  // 3. AP: unpaid purchase invoices + unpaid expenses grouped by due date
  const unpaidPurchases = await prisma.purchaseInvoice.findMany({
    where: {
      businessId,
      paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
    },
    select: {
      totalPence: true,
      dueDate: true,
      createdAt: true,
      payments: { select: { amountPence: true } },
    },
  });

  const apByDay = new Map<string, number>();
  for (const inv of unpaidPurchases) {
    const paid = inv.payments.reduce((s, p) => s + p.amountPence, 0);
    const remaining = Math.max(inv.totalPence - paid, 0);
    if (remaining <= 0) continue;

    const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.createdAt);
    if (!inv.dueDate) dueDate.setDate(dueDate.getDate() + 14); // default 14 days for AP

    const dk = dateKey(dueDate < now ? now : dueDate);
    apByDay.set(dk, (apByDay.get(dk) ?? 0) + remaining);
  }

  // Unpaid expenses
  const unpaidExpenses = await prisma.expense.findMany({
    where: {
      businessId,
      paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
    },
    select: {
      amountPence: true,
      dueDate: true,
      createdAt: true,
      payments: { select: { amountPence: true } },
    },
  });

  for (const exp of unpaidExpenses) {
    const paid = exp.payments.reduce((s, p) => s + p.amountPence, 0);
    const remaining = Math.max(exp.amountPence - paid, 0);
    if (remaining <= 0) continue;

    const dueDate = exp.dueDate ? new Date(exp.dueDate) : new Date(exp.createdAt);
    if (!exp.dueDate) dueDate.setDate(dueDate.getDate() + 7);

    const dk = dateKey(dueDate < now ? now : dueDate);
    apByDay.set(dk, (apByDay.get(dk) ?? 0) + remaining);
  }

  // 4. Avg daily expenses (trailing 30 days)
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentExpenses = await prisma.expense.findMany({
    where: {
      businessId,
      createdAt: { gte: thirtyDaysAgo },
      paymentStatus: 'PAID',
    },
    select: { amountPence: true },
  });
  const totalExpenses30d = recentExpenses.reduce((s, e) => s + e.amountPence, 0);
  const avgDailyExpenses = Math.round(totalExpenses30d / 30);

  // 5. Avg daily cash sales (trailing 14 days, cash + mobile money only)
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const recentCashPayments = await prisma.salesPayment.findMany({
    where: {
      receivedAt: { gte: fourteenDaysAgo },
      method: { in: ['CASH', 'MOBILE_MONEY'] },
      salesInvoice: { businessId },
    },
    select: { amountPence: true },
  });
  const totalCash14d = recentCashPayments.reduce((s, p) => s + p.amountPence, 0);
  const avgDailyCashSales = Math.round(totalCash14d / 14);

  return projectCashflow({
    startingCashPence: startingCash,
    arByDay,
    apByDay,
    avgDailyExpensesPence: avgDailyExpenses,
    avgDailyCashSalesPence: avgDailyCashSales,
    days,
  });
}
