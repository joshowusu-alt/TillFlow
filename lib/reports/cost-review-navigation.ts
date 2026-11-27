import type { IncomeStatementContribution, IncompleteSaleLine } from './income-statement-breakdown';
import { parseBusinessLocalDateKey } from '@/lib/notifications/utils';

type Search = { from?: unknown; to?: unknown; metric?: unknown };
const validDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && parseBusinessLocalDateKey(value) !== null;

/** Only report navigation; never used to determine which costs can be posted. */
export function costReviewPeriod(search?: Search) {
  if (!validDay(search?.from) || !validDay(search?.to) || search.from > search.to) return null;
  const metric = search.metric === 'cogs' || search.metric === 'netProfit' ? search.metric : 'grossProfit';
  return { from: search.from, to: search.to, metric };
}

export function costReviewHref(productId: string, search?: Search, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({ ...costReviewPeriod(search), ...extra });
  const path = '/products/' + encodeURIComponent(productId) + '/cost-review' + (extra.storeId ? '/preview' : '');
  return query.size ? path + '?' + query : path;
}

export function affectedSalesHref(search?: Search) {
  const period = costReviewPeriod(search);
  return period ? '/reports/income-statement/entries?' + new URLSearchParams({ ...period, issues: '1' }) : null;
}

type Item = { receipt: IncomeStatementContribution; line: IncompleteSaleLine | null; index: number };
export type CostReviewGroup = { key: string; productId: string | null; name: string; items: Item[]; receiptCount: number };

/** Group only the already-filtered report records, never estimate missing costs or profit. */
export function groupAffectedSales(entries: IncomeStatementContribution[]): CostReviewGroup[] {
  const groups = new Map<string, Omit<CostReviewGroup, 'receiptCount'>>();
  for (const receipt of entries) {
    const lines = receipt.incompleteLines?.length ? receipt.incompleteLines : [null];
    lines.forEach((line, index) => {
      const productId = line?.reason !== 'UNSUPPORTED_RETURN' ? line?.productId ?? null : null;
      const key = productId ? 'product:' + productId : 'receipt:' + receipt.id;
      const group = groups.get(key) ?? { key, productId, name: productId ? line?.name ?? 'Product' : 'Sale or return needs review', items: [] };
      group.items.push({ receipt, line, index });
      groups.set(key, group);
    });
  }
  return [...groups.values()].map(group => ({ ...group, receiptCount: new Set(group.items.map(item => item.receipt.id)).size }))
    .sort((a, b) => Number(!a.productId) - Number(!b.productId) || b.receiptCount - a.receiptCount || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}
