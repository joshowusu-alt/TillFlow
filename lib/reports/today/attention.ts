import { formatMoney } from '@/lib/format';

/** Absolute cash difference that may take an attention row. The headline still shows smaller amounts. */
export const CASH_ATTENTION_THRESHOLD_PENCE = 500;

export type AttentionRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type AttentionCandidate = {
  rank: AttentionRank;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
  action: string;
  href: string;
  occurredAt: string;
};

export type TodayAttentionFacts = {
  currency: string;
  openTills: Array<{ tillName: string; storeName: string; openedAt: Date }>;
  closedTills: Array<{ tillName: string; storeName: string; closedAt: Date; variancePence: number }>;
  momoManual: { count: number; amountPence: number } | null;
  momoNetworkCount: number | null;
  customerPastDuePence: number | null;
  supplierPastDuePence: number | null;
  belowCost: { productName: string; href: string } | null;
  lowStock: { productName: string; href: string } | null;
  hrefForShift: string;
  hrefForCash: string;
  hrefForMomo: string;
  hrefForNetwork: string;
  hrefForCustomers: string;
  hrefForSuppliers: string;
};

function money(pence: number, currency: string) {
  return formatMoney(Math.abs(pence), currency);
}

export function selectAttention(facts: TodayAttentionFacts, limit = 5): AttentionCandidate[] {
  const rows: AttentionCandidate[] = [];

  const open = [...facts.openTills].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime())[0];
  if (open) {
    rows.push({
      rank: 1,
      severity: 'high',
      title: `${open.tillName} at ${open.storeName} was opened on a previous day and is still open`,
      detail: 'It has not been counted.',
      action: 'Review shift',
      href: facts.hrefForShift,
      occurredAt: open.openedAt.toISOString(),
    });
  }

  const cash = [...facts.closedTills]
    .filter((shift) => Math.abs(shift.variancePence) >= CASH_ATTENTION_THRESHOLD_PENCE)
    .sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime())[0];
  if (cash) {
    const direction = cash.variancePence < 0 ? 'less than expected' : 'more than expected';
    rows.push({
      rank: 2,
      severity: 'high',
      title: `Cash counted is ${money(cash.variancePence, facts.currency)} ${direction}`,
      detail: `${cash.tillName} · ${cash.storeName}`,
      action: 'Review cash',
      href: facts.hrefForCash,
      occurredAt: cash.closedAt.toISOString(),
    });
  }

  if (facts.momoManual && facts.momoManual.count > 0) {
    const count = facts.momoManual.count;
    rows.push({
      rank: 3,
      severity: 'high',
      title: `${count} Mobile Money ${count === 1 ? 'payment is' : 'payments are'} waiting for you to confirm`,
      detail: `${money(facts.momoManual.amountPence, facts.currency)} · not included in money received`,
      action: 'Confirm',
      href: facts.hrefForMomo,
      occurredAt: '1970-01-01T00:00:03.000Z',
    });
  }

  if (facts.momoNetworkCount && facts.momoNetworkCount > 0) {
    const count = facts.momoNetworkCount;
    rows.push({
      rank: 4,
      severity: 'medium',
      title: `${count} Mobile Money ${count === 1 ? 'collection is' : 'collections are'} still pending with the network`,
      detail: 'Separate from payments waiting for you to confirm.',
      action: 'Review',
      href: facts.hrefForNetwork,
      occurredAt: '1970-01-01T00:00:04.000Z',
    });
  }

  if (facts.customerPastDuePence && facts.customerPastDuePence > 0) {
    rows.push({
      rank: 5,
      severity: 'medium',
      title: `${money(facts.customerPastDuePence, facts.currency)} from customers is past the due date`,
      detail: 'Unpaid credit that is not yet due is left off this list.',
      action: 'Review',
      href: facts.hrefForCustomers,
      occurredAt: '1970-01-01T00:00:05.000Z',
    });
  }

  if (facts.supplierPastDuePence && facts.supplierPastDuePence > 0) {
    rows.push({
      rank: 6,
      severity: 'medium',
      title: `${money(facts.supplierPastDuePence, facts.currency)} owed to suppliers is past the due date`,
      detail: 'Amounts that are not yet due are left off this list.',
      action: 'Review',
      href: facts.hrefForSuppliers,
      occurredAt: '1970-01-01T00:00:06.000Z',
    });
  }

  if (facts.belowCost) {
    rows.push({
      rank: 7,
      severity: 'medium',
      title: `${facts.belowCost.productName} sold for less than its cost`,
      detail: 'Only lines with a recorded cost are included.',
      action: 'Open margins',
      href: facts.belowCost.href,
      occurredAt: '1970-01-01T00:00:07.000Z',
    });
  }

  if (facts.lowStock) {
    rows.push({
      rank: 8,
      severity: 'medium',
      title: `${facts.lowStock.productName} is at or below its reorder point`,
      detail: 'One urgent item.',
      action: facts.lowStock.href === '/inventory' ? 'Open inventory' : 'Reorder',
      href: facts.lowStock.href,
      occurredAt: '1970-01-01T00:00:08.000Z',
    });
  }

  return rows
    .sort((a, b) => a.rank - b.rank || (a.severity === b.severity ? a.occurredAt.localeCompare(b.occurredAt) : a.severity === 'high' ? -1 : 1))
    .slice(0, limit);
}

export function creditBuckets(
  documents: Array<{ dueDate: Date | null; balancePence: number }>,
  todayStart: Date,
): { pastDuePence: number; notYetDuePence: number } {
  let pastDuePence = 0;
  let notYetDuePence = 0;
  for (const document of documents) {
    if (document.balancePence <= 0 || document.dueDate == null) continue;
    if (document.dueDate.getTime() < todayStart.getTime()) pastDuePence += document.balancePence;
    else notYetDuePence += document.balancePence;
  }
  return { pastDuePence, notYetDuePence };
}
