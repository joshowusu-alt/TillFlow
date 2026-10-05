import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CashDrawerSummary from '@/components/reports/CashDrawerSummary';
import BusinessMovementSummary from '@/components/reports/BusinessMovementSummary';
import BusinessMovementInsight from '@/components/reports/BusinessMovementInsight';
import { ownerMovementFixture } from '@/lib/reviews/reports-owner-fixtures';
import { buildOwnerInsightSummary } from './insight-engine';
import { buildOwnerSummaryStrip, ownerPeriodChrome } from './owner-copy';
import { movementDisplayCopy, movementDisplayText, movementGapCopy, movementPeriodNote, visibleMovementInsights } from './presentation';

describe('Owner-facing movement and cash presentation', () => {
  it('formats embedded money without changing the underlying insight text', () => {
    const text = 'Sales +GH¢3477.00; refunds -GH¢2266.00.';
    expect(movementDisplayText(text)).toBe('Sales +GH₵3,477.00; refunds −GH₵2,266.00.');
    expect(text).toContain('GH¢3477.00');
  });

  it('qualifies a receipts gap instead of claiming its cause or reconciliation', () => {
    expect(movementGapCopy(-203600, 'GHS')).toContain('Confirmed receipts exceed sales by GH₵2,036.00');
    expect(movementGapCopy(203600, 'GHS')).toContain('Sales exceed confirmed receipts');
    expect(movementGapCopy(-203600, 'GHS')).toContain('can cause');
    expect(movementGapCopy(-203600, 'GHS')).not.toContain('not an error');
    expect(movementGapCopy(null, 'GHS')).toContain('could not be loaded');
    expect(movementGapCopy(0, 'GHS')).toContain('same total');
  });

  it('states unequal month lengths and displays the existing sales and count comparisons', () => {
    const result = ownerMovementFixture();
    const note = movementPeriodNote(result.scope.periods);
    expect(note.currentDays).toBe(30);
    expect(note.comparisonDays).toBe(31);
    expect(note.explanation).toContain('totals, not daily averages');
    const labels = ownerPeriodChrome(result.scope.periods);
    const strip = buildOwnerSummaryStrip(result, buildOwnerInsightSummary(result).insights);
    const html = renderToStaticMarkup(<BusinessMovementSummary result={result} labels={labels} strip={strip} />);
    expect(html).toContain('GH₵162,730.50');
    expect(html).toContain('GH₵159,253.50');
    expect(html).toContain('1765 sales');
    expect(html).toContain('1792 sales');
    expect(html).toContain('2026-09-01');
    expect(html).toContain('2026-08-31');
    expect(html).toContain('Africa/Accra');
  });

  it('counts calendar days independently of a DST boundary', () => {
    const periods = ownerMovementFixture().scope.periods;
    const note = movementPeriodNote({ ...periods, currentFromKey: '2026-10-24', currentToKey: '2026-10-26', comparisonFromKey: '2026-10-21', comparisonToKey: '2026-10-23' });
    expect(note.currentDays).toBe(3);
    expect(note.comparisonDays).toBe(3);
    expect(note.explanation).toContain('same number');
  });

  it('suppresses only the sole-branch insight that exactly repeats the headline', () => {
    const result = ownerMovementFixture();
    const ranked = buildOwnerInsightSummary(result).insights;
    expect(ranked.some(i => i.category === 'branch_growth')).toBe(true);
    expect(visibleMovementInsights(ranked, result).some(i => i.category === 'branch_growth')).toBe(false);
    expect(visibleMovementInsights(ranked, { ...result, branches: [...result.branches, { ...result.branches[0], storeId: 'another' }] })).toEqual(ranked);
    const changedBranch = { ...result.branches[0], salesValuePence: { ...result.branches[0].salesValuePence, current: 100 } };
    expect(visibleMovementInsights(ranked, { ...result, branches: [changedBranch] })).toEqual(ranked);
  });

  it('keeps supporting evidence but does not render an unproven confidence badge', () => {
    const result = ownerMovementFixture();
    const insight = buildOwnerInsightSummary(result).insights[0];
    const html = renderToStaticMarkup(<BusinessMovementInsight insight={insight} labels={ownerPeriodChrome(result.scope.periods)} currency="GHS" />);
    expect(html).toContain('Supporting figures');
    expect(html).toContain('<details');
    expect(html).not.toContain('Strong signal');
    expect(html).not.toContain('Data confidence');
  });

  it('describes a new sales appearance without claiming a newly listed product', () => {
    const result = ownerMovementFixture();
    const template = buildOwnerInsightSummary(result).insights[0];
    const copy = movementDisplayCopy({ ...template, category: 'product_growth', fact: 'Rice is new this period at GH¢9050.00 (no comparison base)' }, ownerPeriodChrome(result.scope.periods), 'GHS');
    expect(copy.fact).toBe('Rice recorded GH₵9,050.00 in September 2026, with no sales in the earlier period');
    expect(copy.recommendedCheck).toContain('before deciding whether to reorder');
  });

  it('does not retain the old balancing-error instruction in a gap insight', () => {
    const result = ownerMovementFixture();
    const insight = buildOwnerInsightSummary(result).insights.find(i => i.category === 'money_received_gap')!;
    expect(movementDisplayCopy(insight, ownerPeriodChrome(result.scope.periods), 'GHS').recommendedCheck).toContain('totals alone do not explain');
  });

  it('does not present missing closed-shift counts as zero cash', () => {
    const html = renderToStaticMarkup(<CashDrawerSummary expected={0} counted={0} difference={0} acceptedCount={0} openCount={2} page={2} currency="GHS" />);
    expect(html).not.toContain('GH₵0.00');
    expect(html).toContain('No cash counts');
    expect(html).toContain('Page 2');
    expect(html).toContain('Open shifts are excluded from all three');
  });

  it('labels an actual cash shortage and preserves its signed figure', () => {
    const html = renderToStaticMarkup(<CashDrawerSummary expected={100000} counted={90000} difference={-10000} acceptedCount={1} openCount={0} page={1} currency="GHS" />);
    expect(html).toContain('−GH₵100.00');
    expect(html).toContain('Counted cash is below expected');
    expect(html).toContain('not every shift in the date range');
  });
});
