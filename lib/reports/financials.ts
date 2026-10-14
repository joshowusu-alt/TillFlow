import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES } from '@/lib/accounting';
import { unstable_cache } from 'next/cache';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import {
  getIncompleteStockSnapshot,
  incompleteStockDisclosureMessage,
} from '@/lib/reports/incomplete-stock';
import { evaluateMarginSet, type MarginReturnKind } from '@/lib/reports/margin-line';

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

async function _getIncomeStatement(businessId: string, startIso: string, endIso: string, db: Prisma.TransactionClient = prisma) {
  const start = new Date(startIso);
  const end = new Date(endIso);

  const [saleInvoices, grouped, accounts] = await Promise.all([
    db.salesInvoice.findMany({
      where: {
        businessId,
        createdAt: { gte: start, lt: end },
      },
      select: {
        paymentStatus: true,
        discountPence: true,
        salesReturn: { select: { type: true } },
        lines: {
          select: {
            lineSubtotalPence: true,
            lineDiscountPence: true,
            promoDiscountPence: true,
            lineCostPence: true, costBasis: true,
            qtyBase: true,
            product: { select: { defaultCostBasePence: true } },
          },
        },
      },
    }),
    // Journals still needed for non-COGS expenses
    db.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: { businessId, entryDate: { gte: start, lt: end } }
      },
      _sum: { debitPence: true, creditPence: true },
    }),
    db.account.findMany({
      where: { businessId },
      select: { id: true, code: true, type: true },
    }),
  ]);

  const accountMap = new Map(accounts.map(a => [a.id, a]));

  const margin = evaluateMarginSet(saleInvoices.map((invoice) => {
    let returnKind: MarginReturnKind = 'NONE';
    if (invoice.salesReturn?.type === 'VOID' && invoice.paymentStatus === 'VOID') returnKind = 'FULL_VOID';
    else if (invoice.salesReturn?.type === 'RETURN' && invoice.paymentStatus === 'RETURNED') returnKind = 'FULL_RETURN';
    else if (invoice.salesReturn) returnKind = 'BACKUP_OR_REPLAY';
    return {
      paymentStatus: invoice.paymentStatus,
      discountPence: invoice.discountPence,
      returnKind,
      lines: invoice.lines.map((line) => ({
        lineSubtotalPence: line.lineSubtotalPence,
        lineDiscountPence: line.lineDiscountPence,
        promoDiscountPence: line.promoDiscountPence,
        lineCostPence: line.lineCostPence, costBasis: line.costBasis,
        qtyBase: line.qtyBase,
        defaultCostBasePence: line.product.defaultCostBasePence,
      })),
    };
  }));
  const revenue = margin.recognisedSalesPence;
  const grossProfit = margin.grossProfitPence;
  const cogs = grossProfit == null ? null : revenue - grossProfit;

  // Other expenses from journals (excluding COGS which is derived above)
  let otherExpenses = 0;
  // Non-sales journal INCOME (e.g. 4100 Inventory Gain) — other operating income.
  // Must never be rolled into sale-line Revenue / Gross Profit.
  let otherOperatingIncome = 0;
  for (const g of grouped) {
    const account = accountMap.get(g.accountId);
    if (!account) continue;
    const accountType = account.type as AccountType;
    const debit = g._sum.debitPence ?? 0;
    const credit = g._sum.creditPence ?? 0;
    if (accountType === 'EXPENSE' && account.code !== ACCOUNT_CODES.cogs) {
      otherExpenses += applyBalance(accountType, debit, credit);
    }
    if (accountType === 'INCOME' && account.code !== ACCOUNT_CODES.sales) {
      otherOperatingIncome += applyBalance(accountType, debit, credit);
    }
  }

  const incomplete = await getIncompleteStockSnapshot(businessId, db);

  return {
    revenue,
    cogs,
    otherExpenses,
    otherOperatingIncome,
    grossProfit,
    netProfit: grossProfit == null ? null : grossProfit - otherExpenses + otherOperatingIncome,
    marginState: margin.state,
    incompleteLineCount: margin.incompleteLineCount,
    stockValueIncomplete: incomplete.stockValueIncomplete,
    profitMayBeIncomplete: incomplete.profitMayBeIncomplete,
    incompleteStockMessage: incompleteStockDisclosureMessage(incomplete),
  };
}

const cachedIncomeStatement = unstable_cache(
  _getIncomeStatement,
  ['report-income-statement'],
  { revalidate: 300, tags: ['reports'] }
);

export function getIncomeStatement(businessId: string, start: Date, end: Date) {
  return measureServerOperation(
    'report.income-statement.snapshot',
    () => cachedIncomeStatement(businessId, start.toISOString(), end.toISOString()),
    {
      businessId,
      route: '/reports/income-statement',
      cacheState: 'cached-wrapper',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.report, operationType: 'report' }
  );
}

async function readBalanceSheet(db: Prisma.TransactionClient, businessId: string, asOfIso: string) {
  const asOf = new Date(asOfIso);

  const [business, grouped, accounts, income] = await Promise.all([
    db.business.findUniqueOrThrow({ where: { id: businessId }, select: { openingCapitalPence: true } }),
    db.journalLine.groupBy({
      by: ['accountId'],
      where: { account: { businessId }, journalEntry: { businessId, entryDate: { lt: asOf } } },
      _sum: { debitPence: true, creditPence: true },
    }),
    db.account.findMany({
      where: { businessId },
      select: { id: true, code: true, name: true, type: true },
    }),
    // Sale-line-based NP (consistent with Income Statement)
    _getIncomeStatement(businessId, new Date(0).toISOString(), asOfIso, db),
  ]);

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

  // Preserve the journal balances. A difference is reconciliation evidence,
  // never a reason to manufacture a stock adjustment in a read-only report.
  const journalNP = journalIncomeTotal - journalExpenseTotal;
  const profitDifferencePence = income.netProfit == null ? null : income.netProfit - journalNP;

  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];

  for (const entry of map.values()) {
    if (entry.type === 'ASSET') assets.push(entry);
    if (entry.type === 'LIABILITY') liabilities.push(entry);
    if (entry.type === 'EQUITY') equity.push(entry);
  }

  // Equity follows recorded ledger profit; operational profit is compared separately.
  if (journalNP !== 0) {
    equity.push({
      accountCode: 'CURRENT_PROFIT',
      name: 'Net Profit to Date',
      type: 'EQUITY',
      balancePence: journalNP
    });
  }

  const totalAssets = assets.reduce((sum, line) => sum + line.balancePence, 0);
  const totalLiabilities = liabilities.reduce((sum, line) => sum + line.balancePence, 0);
  const totalEquity = equity.reduce((sum, line) => sum + line.balancePence, 0);

  return {
    assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity,
    legacyCapitalPence: business.openingCapitalPence ?? 0,
    reconciliation: {
      journalProfitPence: journalNP,
      operationalProfitPence: income.netProfit,
      profitDifferencePence,
      equationDifferencePence: totalAssets - totalLiabilities - totalEquity,
      profitIncomplete: income.netProfit == null,
      stockValueIncomplete: income.stockValueIncomplete,
      // Agreement of these calculations alone does not certify real balances.
      status: 'UNRECONCILED' as const,
    },
  };
}

async function _getBalanceSheet(businessId: string, asOfIso: string) {
  if (!Number.isFinite(new Date(asOfIso).getTime())) throw new Error('Choose a valid statement date');
  return prisma.$transaction(tx => readBalanceSheet(tx, businessId, asOfIso), {
    isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000,
  });
}

const cachedBalanceSheet = unstable_cache(
  _getBalanceSheet,
  ['report-balance-sheet-ledger-v2'],
  { revalidate: 900, tags: ['reports'] }
);

export function getBalanceSheet(businessId: string, asOf: Date) {
  return measureServerOperation(
    'report.balance-sheet.snapshot',
    () => cachedBalanceSheet(businessId, asOf.toISOString()),
    {
      businessId,
      route: '/reports/balance-sheet',
      cacheState: 'cached-wrapper',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.report, operationType: 'report' }
  );
}

/**
 * Point-in-time account balance at an EXCLUSIVE boundary instant: the sum of all
 * journals stamped strictly before `asOfExclusive`. Callers pass the reporting
 * clock's `startInclusive` for a beginning balance and `endExclusive` for an ending
 * balance, so `balance(end) - balance(start)` covers exactly [start, end). This
 * matches `_getBalanceSheet`, which already filters `entryDate: { lt: asOf }`.
 */
export async function getAccountBalance(businessId: string, code: string, asOfExclusive: Date) {
  const account = await prisma.account.findFirst({
    where: { businessId, code },
    select: { id: true, type: true },
  });
  if (!account) return 0;

  const agg = await prisma.journalLine.aggregate({
    where: {
      accountId: account.id,
      journalEntry: { entryDate: { lt: asOfExclusive } },
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

  const netCashFromOps = income.netProfit == null
    ? null
    : income.netProfit - arChange - invChange + apChange;
  // Legacy path uses openingCapitalPence; new path uses journal-based balances
  const beginningCash = startCash + legacyCapital;
  const endingCash = netCashFromOps == null ? null : beginningCash + netCashFromOps;

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
  return measureServerOperation(
    'report.cashflow.snapshot',
    () => cachedCashflow(businessId, start.toISOString(), end.toISOString()),
    {
      businessId,
      route: '/reports/cashflow',
      cacheState: 'cached-wrapper',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.report, operationType: 'report' }
  );
}
