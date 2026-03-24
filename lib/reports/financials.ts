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

  const [saleLines, grouped, accounts] = await Promise.all([
    // Revenue and COGS from sale lines — single source of truth
    prisma.salesInvoiceLine.findMany({
      where: {
        salesInvoice: {
          businessId,
          createdAt: { gte: start, lte: end },
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        lineSubtotalPence: true,
        lineCostPence: true,
        qtyBase: true,
        product: { select: { defaultCostBasePence: true } },
      },
    }),
    // Journals still needed for non-COGS expenses
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

  // Revenue and COGS from sale lines (consistent with dashboard/margins/analytics)
  let revenue = 0;
  let cogs = 0;
  for (const line of saleLines) {
    revenue += line.lineSubtotalPence;
    const cost = line.lineCostPence > 0
      ? line.lineCostPence
      : (line.product.defaultCostBasePence * line.qtyBase);
    cogs += cost;
  }

  // Other expenses from journals (excluding COGS which is derived above)
  let otherExpenses = 0;
  for (const g of grouped) {
    const account = accountMap.get(g.accountId);
    if (!account) continue;
    const accountType = account.type as AccountType;
    if (accountType === 'EXPENSE' && account.code !== ACCOUNT_CODES.cogs) {
      const debit = g._sum.debitPence ?? 0;
      const credit = g._sum.creditPence ?? 0;
      otherExpenses += applyBalance(accountType, debit, credit);
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

  const [business, obRecords, grouped, accounts, income] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { openingCapitalPence: true } }),
    prisma.openingBalance.findMany({ where: { businessId } }),
    prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { journalEntry: { businessId, entryDate: { lte: asOf } } },
      _sum: { debitPence: true, creditPence: true },
    }),
    prisma.account.findMany({
      where: { businessId },
      select: { id: true, code: true, name: true, type: true },
    }),
    // Sale-line-based NP (consistent with Income Statement)
    _getIncomeStatement(businessId, new Date(0).toISOString(), asOfIso),
  ]);

  // Backward compat: use legacy openingCapitalPence only when no OB records exist
  const hasOBRecords = obRecords.length > 0;
  const legacyCapital = !hasOBRecords ? (business.openingCapitalPence ?? 0) : 0;

  const accountMap = new Map(accounts.map(a => [a.id, a]));

  const map = new Map<string, StatementLine>();
  let journalIncomeTotal = 0;
  let journalExpenseTotal = 0;

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

    if (accountType === 'INCOME') journalIncomeTotal += balance;
    if (accountType === 'EXPENSE') journalExpenseTotal += balance;
  }

  // Adjustment: sale-line NP vs journal NP — applied to inventory to keep BS balanced
  const journalNP = journalIncomeTotal - journalExpenseTotal;
  const npAdjustment = income.netProfit - journalNP;

  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];

  // Legacy: add openingCapitalPence to Cash if no OpeningBalance records exist
  for (const entry of map.values()) {
    if (entry.accountCode === ACCOUNT_CODES.cash && legacyCapital > 0) {
      entry.balancePence += legacyCapital;
    }
    // Adjust inventory to reflect sale-line COGS (keeps BS balanced)
    if (entry.accountCode === ACCOUNT_CODES.inventory && npAdjustment !== 0) {
      entry.balancePence += npAdjustment;
    }
    if (entry.type === 'ASSET') assets.push(entry);
    if (entry.type === 'LIABILITY') liabilities.push(entry);
    if (entry.type === 'EQUITY') equity.push(entry);
  }

  // Legacy fallback: If no journal cash account but legacy capital exists
  if (legacyCapital > 0 && !assets.find(a => a.accountCode === ACCOUNT_CODES.cash)) {
    assets.push({
      accountCode: ACCOUNT_CODES.cash,
      name: 'Cash on Hand',
      type: 'ASSET',
      balancePence: legacyCapital,
    });
  }

  // Legacy fallback: synthetic Owner's Capital equity line
  if (legacyCapital > 0) {
    equity.push({
      accountCode: 'OWNER_CAPITAL',
      name: "Owner's Capital",
      type: 'EQUITY',
      balancePence: legacyCapital,
    });
  }

  // Use sale-line-based NP (matches Income Statement)
  if (income.netProfit !== 0) {
    equity.push({
      accountCode: 'CURRENT_PROFIT',
      name: 'Net Profit to Date',
      type: 'EQUITY',
      balancePence: income.netProfit
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

export async function getAccountBalance(businessId: string, code: string, asOf: Date) {
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

  const [business, obRecords, income] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { openingCapitalPence: true } }),
    prisma.openingBalance.findMany({ where: { businessId } }),
    cachedIncomeStatement(businessId, startIso, endIso)
  ]);

  // Backward compat: use legacy field only when no OB records
  const hasOBRecords = obRecords.length > 0;
  const legacyCapital = !hasOBRecords ? (business.openingCapitalPence ?? 0) : 0;

  // When OB records exist, opening cash = Cash OB + Bank OB (both flow through journals)
  const obCashBank = hasOBRecords
    ? obRecords
        .filter(ob => ob.accountCode === ACCOUNT_CODES.cash || ob.accountCode === ACCOUNT_CODES.bank)
        .reduce((sum, ob) => sum + ob.amountPence, 0)
    : 0;

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
  // Legacy path uses openingCapitalPence; new path uses journal-based balances
  const beginningCash = startCash + legacyCapital;
  const endingCash = beginningCash + netCashFromOps;

  return {
    netProfit: income.netProfit,
    arChange,
    apChange,
    invChange,
    netCashFromOps,
    openingCapital: hasOBRecords ? obCashBank : legacyCapital,
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
