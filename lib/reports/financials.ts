import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { unstable_cache } from 'next/cache';

type AccountType = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY';

type StatementLine = {
  accountCode: string;
  name: string;
  type: AccountType;
  balancePence: number;
};

function applyBalance(type: AccountType, debit: number, credit: number) {
  if (type === 'ASSET' || type === 'EXPENSE') {
    return debit - credit;
  }
  return credit - debit;
}

async function _getIncomeStatement(businessId: string, startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);

  const [grouped, accounts] = await Promise.all([
    prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: { businessId, entryDate: { gte: start, lte: end } }
      },
      _sum: { debitPence: true, creditPence: true },
    }),
    prisma.account.findMany({
      where: { businessId },
      select: { id: true, code: true, type: true },
    }),
  ]);

  const accountMap = new Map(accounts.map(a => [a.id, a]));

  let revenue = 0;
  let cogs = 0;
  let otherExpenses = 0;

  for (const g of grouped) {
    const account = accountMap.get(g.accountId);
    if (!account) continue;
    const accountType = account.type as AccountType;
    const debit = g._sum.debitPence ?? 0;
    const credit = g._sum.creditPence ?? 0;
    const balance = applyBalance(accountType, debit, credit);
    if (accountType === 'INCOME') {
      revenue += balance;
    }
    if (account.code === ACCOUNT_CODES.cogs) {
      cogs += balance;
    } else if (accountType === 'EXPENSE') {
      otherExpenses += balance;
    }
  }

  const grossProfit = revenue - cogs;

  return {
    revenue,
    cogs,
    otherExpenses,
    grossProfit,
    netProfit: grossProfit - otherExpenses
  };
}

const cachedIncomeStatement = unstable_cache(
  _getIncomeStatement,
  ['report-income-statement'],
  { revalidate: 300, tags: ['reports'] }
);

export function getIncomeStatement(businessId: string, start: Date, end: Date) {
  return cachedIncomeStatement(businessId, start.toISOString(), end.toISOString());
}

async function _getBalanceSheet(businessId: string, asOfIso: string) {
  const asOf = new Date(asOfIso);

  const [business, grouped, accounts] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { openingCapitalPence: true } }),
    prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { journalEntry: { businessId, entryDate: { lte: asOf } } },
      _sum: { debitPence: true, creditPence: true },
    }),
    prisma.account.findMany({
      where: { businessId },
      select: { id: true, code: true, name: true, type: true },
    }),
  ]);

  const openingCapital = business.openingCapitalPence ?? 0;
  const accountMap = new Map(accounts.map(a => [a.id, a]));

  const map = new Map<string, StatementLine>();
  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const g of grouped) {
    const account = accountMap.get(g.accountId);
    if (!account) continue;
    const accountType = account.type as AccountType;
    const debit = g._sum.debitPence ?? 0;
    const credit = g._sum.creditPence ?? 0;
    const balance = applyBalance(accountType, debit, credit);

    map.set(account.id, {
      accountCode: account.code,
      name: account.name,
      type: accountType,
      balancePence: balance,
    });

    if (accountType === 'INCOME') incomeTotal += balance;
    if (accountType === 'EXPENSE') expenseTotal += balance;
  }

  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];

  // Add opening capital to Cash on Hand (the owner's investment)
  for (const entry of map.values()) {
    if (entry.accountCode === ACCOUNT_CODES.cash && openingCapital > 0) {
      entry.balancePence += openingCapital;
    }
    if (entry.type === 'ASSET') assets.push(entry);
    if (entry.type === 'LIABILITY') liabilities.push(entry);
    if (entry.type === 'EQUITY') equity.push(entry);
  }

  // If no Cash account from journals but we have opening capital, add it
  if (openingCapital > 0 && !assets.find(a => a.accountCode === ACCOUNT_CODES.cash)) {
    assets.push({
      accountCode: ACCOUNT_CODES.cash,
      name: 'Cash on Hand',
      type: 'ASSET',
      balancePence: openingCapital
    });
  }

  // Add Owner's Capital to equity (balancing entry)
  if (openingCapital > 0) {
    equity.push({
      accountCode: 'OWNER_CAPITAL',
      name: "Owner's Capital",
      type: 'EQUITY',
      balancePence: openingCapital
    });
  }

  const netIncome = incomeTotal - expenseTotal;
  if (netIncome !== 0) {
    equity.push({
      accountCode: 'CURRENT_PROFIT',
      name: 'Current Period Profit',
      type: 'EQUITY',
      balancePence: netIncome
    });
  }

  const totalAssets = assets.reduce((sum, line) => sum + line.balancePence, 0);
  const totalLiabilities = liabilities.reduce((sum, line) => sum + line.balancePence, 0);
  const totalEquity = equity.reduce((sum, line) => sum + line.balancePence, 0);

  return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity };
}

const cachedBalanceSheet = unstable_cache(
  _getBalanceSheet,
  ['report-balance-sheet'],
  { revalidate: 900, tags: ['reports'] }
);

export function getBalanceSheet(businessId: string, asOf: Date) {
  return cachedBalanceSheet(businessId, asOf.toISOString());
}

async function getAccountBalance(businessId: string, code: string, asOf: Date) {
  const account = await prisma.account.findFirst({
    where: { businessId, code },
    select: { id: true, type: true },
  });
  if (!account) return 0;

  const agg = await prisma.journalLine.aggregate({
    where: {
      accountId: account.id,
      journalEntry: { entryDate: { lte: asOf } },
    },
    _sum: { debitPence: true, creditPence: true },
  });
  return applyBalance(
    account.type as AccountType,
    agg._sum.debitPence ?? 0,
    agg._sum.creditPence ?? 0
  );
}

async function _getCashflow(businessId: string, startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);

  const [business, income] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { openingCapitalPence: true } }),
    _getIncomeStatement(businessId, startIso, endIso)
  ]);

  const openingCapital = business.openingCapitalPence ?? 0;

  const [startAr, endAr, startAp, endAp, startInv, endInv, startCash] = await Promise.all([
    getAccountBalance(businessId, ACCOUNT_CODES.ar, start),
    getAccountBalance(businessId, ACCOUNT_CODES.ar, end),
    getAccountBalance(businessId, ACCOUNT_CODES.ap, start),
    getAccountBalance(businessId, ACCOUNT_CODES.ap, end),
    getAccountBalance(businessId, ACCOUNT_CODES.inventory, start),
    getAccountBalance(businessId, ACCOUNT_CODES.inventory, end),
    getAccountBalance(businessId, ACCOUNT_CODES.cash, start),
  ]);

  const arChange = endAr - startAr;
  const apChange = endAp - startAp;
  const invChange = endInv - startInv;

  const netCashFromOps = income.netProfit - arChange - invChange + apChange;
  const beginningCash = startCash + openingCapital;
  const endingCash = beginningCash + netCashFromOps;

  return {
    netProfit: income.netProfit,
    arChange,
    apChange,
    invChange,
    netCashFromOps,
    openingCapital,
    beginningCash,
    endingCash
  };
}

const cachedCashflow = unstable_cache(
  _getCashflow,
  ['report-cashflow'],
  { revalidate: 300, tags: ['reports'] }
);

export function getCashflow(businessId: string, start: Date, end: Date) {
  return cachedCashflow(businessId, start.toISOString(), end.toISOString());
}
