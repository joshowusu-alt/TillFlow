import { describe, expect, it } from 'vitest';
import { affectedSalesHref, costReviewHref, costReviewPeriod, groupAffectedSales } from './cost-review-navigation';
import type { IncomeStatementContribution } from './income-statement-breakdown';

const sale = (id: string, incompleteLines?: IncomeStatementContribution['incompleteLines']): IncomeStatementContribution => ({
  id, date: '2026-11-16T12:00:00Z', label: id, description: 'Sale', href: '/sales/' + id, kind: 'sale',
  revenuePence: 14000, costPence: null, profitPence: null, amountPence: 0, incompleteLines,
});
const rice = { productId: 'rice', name: 'Rice', qtyBase: 1, revenuePence: 14000, reason: 'INCOMPLETE_COSTS' };
describe('affected sale presentation and navigation', () => {
  it('groups by immutable product identity, counts distinct receipts and retains every line', () => {
    const rows = [sale('a', [rice, rice]), sale('b', [rice]), sale('c', [{ ...rice, productId: 'other' }])];
    const groups = groupAffectedSales(rows);
    expect(groups.map(group => [group.productId, group.receiptCount, group.items.length])).toEqual([['rice', 2, 3], ['other', 1, 1]]);
    expect(groups.flatMap(group => group.items).map(item => item.line?.revenuePence)).toEqual([14000, 14000, 14000, 14000]);
  });
  it('does not offer automatic product correction for unsupported or unidentified return records', () => {
    const groups = groupAffectedSales([sale('a', [{ ...rice, reason: 'UNSUPPORTED_RETURN' }, rice]), sale('b')]);
    expect(groups.map(group => [group.productId, group.items.length])).toEqual([['rice', 1], [null, 1], [null, 1]]);
    expect(groups[1].items[0].line?.reason).toBe('UNSUPPORTED_RETURN');
    expect(groups[2].items[0].line).toBeNull();
  });
  it('preserves valid report dates and metric without accepting arbitrary return URLs', () => {
    const period = { from: '2026-10-01', to: '2026-10-31', metric: 'netProfit' };
    expect(costReviewHref('rice', period, { storeId: 'branch' })).toBe('/products/rice/cost-review/preview?from=2026-10-01&to=2026-10-31&metric=netProfit&storeId=branch');
    expect(affectedSalesHref(period)).toBe('/reports/income-statement/entries?from=2026-10-01&to=2026-10-31&metric=netProfit&issues=1');
    expect(costReviewPeriod({ ...period, metric: 'https://example.com' })?.metric).toBe('grossProfit');
    expect(costReviewPeriod({ from: '2028-02-29', to: '2028-02-29' })).toEqual({ from: '2028-02-29', to: '2028-02-29', metric: 'grossProfit' });
    expect(costReviewPeriod({ from: '2027-02-29', to: '2027-03-01' })).toBeNull();
    expect(costReviewPeriod({ ...period, from: ' 2026-10-01' })).toBeNull();
    for (const invalid of [{ ...period, from: '2026-02-30' }, { ...period, to: '2026-01-01' }, { ...period, from: ['/'] }]) {
      expect(costReviewPeriod(invalid)).toBeNull();
      expect(affectedSalesHref(invalid)).toBeNull();
    }
  });
});
