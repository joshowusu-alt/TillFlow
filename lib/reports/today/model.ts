import { formatMoney } from '@/lib/format';
import { CONSOLIDATED_LABEL } from '@/lib/reports/scope-labels';
import type { AttentionCandidate } from '@/lib/reports/today/attention';
import type { TodayPlan } from '@/lib/reports/today/windows';

/**
 * Presentation types for Today. This module does not query the database.
 * Live figures stay in `load.ts`. The review surface may import this file.
 */
export type TodaySnapshot = {
  readCount: number;
  salesTodayPence: number;
  salesCount: number;
  yesterdayPence: number;
  days: Array<{ key: string; label: string; salesPence: number }>;
  moneyReceivedPence: number;
  methods: Array<{ method: string; label: string; amountPence: number }>;
  cashDifferencePence: number | null;
  comparison: { last30Pence: number; previous30Pence: number } | null;
  branches: Array<{ storeId: string; name: string; salesPence: number }> | null;
  profit: { state: 'omitted' | 'ready' | 'incomplete'; grossProfitPence: number | null };
  topProducts: Array<{ name: string; salesPence: number }>;
  attention: AttentionCandidate[];
};

export type TodayNextAction = { href: string; label: string };

export class ScopeAgreementError extends Error {
  constructor(message = 'The report label does not match the stores being queried') {
    super(message);
    this.name = 'ScopeAgreementError';
  }
}

export function cashDifferenceLabel(pence: number | null, currency: string): string | null {
  if (pence == null) return null;
  const amount = formatMoney(Math.abs(pence), currency);
  if (pence < 0) return `−${amount}`;
  if (pence > 0) return `+${amount}`;
  return amount;
}

function hasSalesSignal(snapshot: TodaySnapshot): boolean {
  return snapshot.salesCount > 0
    || snapshot.salesTodayPence !== 0
    || snapshot.yesterdayPence !== 0
    || snapshot.days.some((day) => day.salesPence !== 0)
    || snapshot.topProducts.length > 0
    || (snapshot.branches?.some((branch) => branch.salesPence !== 0) ?? false)
    || (snapshot.comparison != null && (snapshot.comparison.last30Pence !== 0 || snapshot.comparison.previous30Pence !== 0));
}

function hasReceiptSignal(snapshot: TodaySnapshot): boolean {
  return snapshot.moneyReceivedPence !== 0 || snapshot.methods.length > 0;
}

/** No sales, receipts, closed till or attention anywhere in the loaded scope. */
export function isQuietToday(snapshot: TodaySnapshot): boolean {
  return !hasSalesSignal(snapshot)
    && !hasReceiptSignal(snapshot)
    && snapshot.cashDifferencePence == null
    && snapshot.attention.length === 0;
}

export type TodayPartialKind =
  | 'sales-without-receipts'
  | 'receipts-without-sales'
  | 'no-closed-till'
  | 'no-payment-mix'
  | 'no-history'
  | 'missing-costs'
  | 'no-attention';

export function todayPartialKinds(snapshot: TodaySnapshot): TodayPartialKind[] {
  if (isQuietToday(snapshot)) return [];
  const salesToday = snapshot.salesCount > 0 || snapshot.salesTodayPence !== 0;
  const receipts = hasReceiptSignal(snapshot);
  const priorDaysQuiet = snapshot.days.slice(0, -1).every((day) => day.salesPence === 0)
    && snapshot.yesterdayPence === 0;
  const comparisonQuiet = snapshot.comparison == null
    || (snapshot.comparison.previous30Pence === 0 && snapshot.comparison.last30Pence === 0);
  const kinds: TodayPartialKind[] = [];
  if (salesToday && !receipts) kinds.push('sales-without-receipts');
  if (!salesToday && receipts) kinds.push('receipts-without-sales');
  if (snapshot.cashDifferencePence == null) kinds.push('no-closed-till');
  if (snapshot.methods.length === 0) kinds.push('no-payment-mix');
  if (priorDaysQuiet && comparisonQuiet) kinds.push('no-history');
  if (snapshot.profit.state === 'incomplete') kinds.push('missing-costs');
  if (snapshot.attention.length === 0) kinds.push('no-attention');
  return kinds;
}

/**
 * One label for the stores actually queried.
 * Growth and Starter cannot be labelled as every branch.
 * Pro consolidation lists only owned stores, and the label is the consolidated one.
 */
export function agreeingReportScope(input: {
  plan: TodayPlan;
  selected: string;
  queriedStoreIds: readonly string[];
  ownedStores: readonly { id: string; name: string }[];
}): { label: string; storeIds: string[] } {
  const owned = new Map(input.ownedStores.map((store) => [store.id, store.name]));
  if (input.queriedStoreIds.length === 0) throw new ScopeAgreementError();
  if (input.selected === 'ALL') {
    if (input.plan !== 'PRO') throw new ScopeAgreementError();
    const ids = [...input.queriedStoreIds];
    if (ids.length !== owned.size) throw new ScopeAgreementError();
    for (const id of ids) {
      if (!owned.has(id)) throw new ScopeAgreementError();
    }
    if (new Set(ids).size !== ids.length) throw new ScopeAgreementError();
    return { label: CONSOLIDATED_LABEL, storeIds: ids };
  }
  if (!owned.has(input.selected)) throw new ScopeAgreementError();
  if (input.queriedStoreIds.length !== 1 || input.queriedStoreIds[0] !== input.selected) {
    throw new ScopeAgreementError();
  }
  return { label: owned.get(input.selected) ?? input.selected, storeIds: [input.selected] };
}

/** Sell and stock are writes. A read-only or other role does not see them. */
export function todayNextActions(input: { role: string; readOnly: boolean }): TodayNextAction[] {
  if (input.readOnly) return [];
  if (input.role !== 'OWNER' && input.role !== 'MANAGER') return [];
  return [
    { href: '/pos', label: 'Open Sell' },
    { href: '/inventory', label: 'Add stock' },
  ];
}
