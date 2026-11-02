import type { Prisma, PrismaClient } from '@prisma/client';
import { INVENTORY_VALUE_V1, UNVERIFIED_STOCK_V1 } from '@/lib/inventory-value';
import { readRecordedMoneyMovement } from './recorded-money';

type Line = { debitPence: number; creditPence: number; account: { code: string; name: string; type: string } };
export type CashflowJournal = { id: string; referenceType: string | null; lines: Line[] };
export type CashflowRow = { key: string; label: string; amountPence: number };
const MONEY = new Set(['1000', '1010']);
const WORKING = new Map([
  ['1100', ['Customer balances', 'ASSET']], ['1200', ['Inventory', 'ASSET']],
  ['1300', ['VAT receivable', 'ASSET']], ['2000', ['Supplier balances', 'LIABILITY']],
  ['2100', ['VAT payable', 'LIABILITY']],
]);
const SOURCES: Record<string, string> = {
  SALES_INVOICE: 'Customers', CUSTOMER_RECEIPT: 'Customers', MOMO_PAYMENT_CONFIRM: 'Customers',
  SALES_RETURN: 'Customer refunds', PURCHASE_INVOICE: 'Suppliers', PURCHASE_PAYMENT: 'Suppliers',
  SUPPLIER_PAYMENT: 'Suppliers', PURCHASE_RETURN: 'Supplier refunds', SUPPLIER_CREDIT_REFUND: 'Supplier refunds',
  PURCHASE_RETURN_CREDIT: 'Supplier return credits',
  EXPENSE: 'Operating expenses', EXPENSE_PAYMENT: 'Operating expenses', STOCK_ADJUSTMENT: 'Stock adjustments',
};
function workingAccount(line: Line) {
  if (line.account.code.startsWith('2300.OWNER.') && line.account.type === 'LIABILITY') return ['Owner-funded purchases', 'LIABILITY'];
  if (line.account.code.startsWith('3100.OWNER.') && line.account.type === 'EQUITY') return ['Owner-funded purchases', 'EQUITY'];
  return WORKING.get(line.account.code);
}
function exact(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Cash-flow total exceeds supported precision');
  return value === 0 ? 0 : value;
}
const net = (line: Line) => exact(exact(line.debitPence) - exact(line.creditPence));
const sum = (values: number[]) => values.reduce((a, b) => exact(a + b), 0);
const isMoney = (line: Line) => (MONEY.has(line.account.code) || line.account.code.startsWith('1000.HOLD.')) && line.account.type === 'ASSET';

/** Both views are independently calculated from the same dated, posted entries. */
export function cashflowAccumulator() {
  let netProfit = 0;
  let excludedProfit = 0;
  let operatingCash = 0;
  let financingCash = 0;
  let openingEntries = 0;
  let otherCash = 0;
  let otherEntryCount = 0;
  const adjustments = new Map<string, CashflowRow>();
  const direct = new Map<string, CashflowRow>();
  const add = (map: Map<string, CashflowRow>, key: string, label: string, amount: number) => {
    map.set(key, { key, label, amountPence: exact((map.get(key)?.amountPence ?? 0) + amount) });
  };
  return {
    add(entry: CashflowJournal) {
      const money = sum(entry.lines.filter(isMoney).map(net));
      const nonMoney = entry.lines.filter(line => !isMoney(line));
      const profit = sum(entry.lines.filter(line => ['INCOME', 'EXPENSE'].includes(line.account.type)).map(line => -net(line)));
      netProfit = exact(netProfit + profit);
      const opening = entry.referenceType?.startsWith('OPENING_BALANCE_') === true;
      const operating = !opening && Object.prototype.hasOwnProperty.call(SOURCES, entry.referenceType ?? '') && nonMoney.every(line =>
        ['INCOME', 'EXPENSE'].includes(line.account.type) || workingAccount(line)?.[1] === line.account.type);
      if (operating) {
        operatingCash = exact(operatingCash + money);
        for (const line of nonMoney) {
          const working = workingAccount(line);
          if (working && working[1] === line.account.type) add(adjustments, line.account.code, working[0], -net(line));
        }
        if (money !== 0) {
          const label = SOURCES[entry.referenceType!];
          add(direct, label + (money > 0 ? '-in' : '-out'), label + (money > 0 ? ' — money received' : ' — money paid'), money);
        }
      } else {
        excludedProfit = exact(excludedProfit - profit);
        if (opening) openingEntries = exact(openingEntries + money);
        else if (nonMoney.length > 0 && nonMoney.every(line => (line.account.type === 'EQUITY' && (line.account.code === '3000' || line.account.code.startsWith('3100.OWNER.'))) || (line.account.type === 'LIABILITY' && line.account.code.startsWith('2300.OWNER.')))) {
          financingCash = exact(financingCash + money);
          if (money !== 0) add(direct, money > 0 ? 'equity-in' : 'equity-out', money > 0 ? 'Equity funding received' : 'Equity payments', money);
        } else if (money !== 0) {
          otherCash = exact(otherCash + money);
          otherEntryCount++;
          add(direct, money > 0 ? 'other-in' : 'other-out', money > 0 ? 'Other money received' : 'Other money paid', money);
        }
        // A balanced transfer between money accounts has zero combined movement.
      }
    },
    finish() {
      const workingCapital = [...adjustments.values()].sort((a, b) => a.key.localeCompare(b.key));
      const netCashFromOps = sum([netProfit, excludedProfit, ...workingCapital.map(row => row.amountPence)]);
      return {
        netProfit, excludedProfit, adjustments: workingCapital, netCashFromOps,
        directOperatingPence: operatingCash, investingPence: 0, financingPence: financingCash,
        openingEntriesPence: openingEntries, otherPence: otherCash, otherEntryCount,
        directRows: [...direct.values()].sort((a, b) => a.key.localeCompare(b.key)),
        operatingDifferencePence: exact(netCashFromOps - operatingCash),
        classifiedMovementPence: sum([operatingCash, financingCash, openingEntries, otherCash]),
      };
    },
  };
}

export async function readCashflowStatement(db: Prisma.TransactionClient, businessId: string, start: Date, end: Date) {
  // Validates the dates before any other reads; includes cash AND bank/MoMo.
  const money = await readRecordedMoneyMovement(db, businessId, start, end);
  const missingSaleCostCount = await db.salesInvoiceLine.count({ where: {
    salesInvoice: { businessId, createdAt: { gte: start, lt: end }, paymentStatus: { notIn: ['VOID', 'RETURNED'] } },
    OR: [{ costBasis: UNVERIFIED_STOCK_V1 }, { lineCostPence: { lte: 0 }, OR: [{ costBasis: null }, { costBasis: { not: INVENTORY_VALUE_V1 } }] }],
  } });
  const accumulator = cashflowAccumulator();
  let cursor: string | undefined;
  while (true) {
    const entries: CashflowJournal[] = await db.journalEntry.findMany({
      where: { businessId, entryDate: { gte: start, lt: end } },
      orderBy: { id: 'asc' }, take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, referenceType: true, lines: {
        where: { account: { businessId } },
        select: { debitPence: true, creditPence: true, account: { select: { code: true, name: true, type: true } } },
      } },
    });
    for (const entry of entries) accumulator.add(entry);
    if (entries.length < 500) break;
    cursor = entries[entries.length - 1].id;
  }
  const statement = accumulator.finish();
  return { ...statement, money, missingSaleCostCount,
    movementDifferencePence: exact(statement.classifiedMovementPence - money.netMovementPence),
    beginningCash: money.beginningCashPence, endingCash: money.endingCashPence,
  };
}

export function getCashflowStatement(db: PrismaClient, businessId: string, start: Date, end: Date) {
  return db.$transaction(tx => readCashflowStatement(tx, businessId, start, end), {
    isolationLevel: 'Serializable', maxWait: 5000, timeout: 30000,
  });
}
export type CashflowStatement = Awaited<ReturnType<typeof readCashflowStatement>>;

export function cashflowStatementRows(data: CashflowStatement, direct = false): CashflowRow[] {
  const row = (key: string, label: string, amountPence: number) => ({ key, label, amountPence });
  return [
    ...(direct ? data.directRows.filter(line => !line.key.startsWith('equity-') && !line.key.startsWith('other-')) : [
      row('profit', 'Net profit from posted entries', data.netProfit),
      ...(data.excludedProfit ? [row('excluded-profit', 'Noncash and other profit adjustments', data.excludedProfit)] : []),
      ...data.adjustments.map(line => ({ ...line, label: 'Movement in ' + line.label.toLowerCase() })),
    ]),
    row('operating', 'Net cash from operating activities', direct ? data.directOperatingPence : data.netCashFromOps),
    row('investing', 'Net cash from investing activities', data.investingPence),
    ...data.directRows.filter(line => line.key.startsWith('equity-')),
    row('financing', 'Net cash from financing activities', data.financingPence),
    ...data.directRows.filter(line => line.key.startsWith('other-')),
    ...(data.openingEntriesPence ? [row('opening-entries', 'Opening balance entries added in this period', data.openingEntriesPence)] : []),
    row('change', 'Net change in cash, bank and MoMo', data.money.netMovementPence),
    row('opening', 'Opening cash, bank and MoMo', data.beginningCash),
    row('closing', 'Closing cash, bank and MoMo', data.endingCash),
  ];
}
