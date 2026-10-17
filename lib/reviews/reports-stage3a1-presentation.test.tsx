import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DestinationShell } from '@/components/reports/presentation/DestinationShell';
import { DESTINATION_SHELL_RULE } from '@/components/reports/presentation/destination-rule';
import { ProposedToday } from '@/components/reports/presentation/ProposedToday';
import { ReportDirectory } from '@/components/reports/presentation/ReportDirectory';
import { todayNextActions } from '@/lib/reports/today/model';
import {
  reviewLinks,
  reviewScopeLabel,
  reviewSnapshot,
} from '@/lib/reports/today/review-samples';
import {
  STAGE_3A_WITHHELD_HREFS,
  returnPathFor,
  stage3aLinks,
  type ReportReturnPath,
} from '@/lib/reports/today/stage3a-nav';

const rootFiles = [
  'app/reviews/reports-stage3a1/page.tsx',
  'app/reviews/reports-stage3a1/Stage3a1Review.tsx',
  'app/reviews/reports-stage3a1-destination/page.tsx',
  'app/reviews/reports-stage3a1-destination/DestinationReview.tsx',
  'components/reports/presentation/ProposedToday.tsx',
  'components/reports/presentation/DestinationShell.tsx',
  'components/reports/presentation/ReportDirectory.tsx',
  'components/reports/presentation/HubHead.tsx',
];

function markupOfToday(scenario: 'healthy' | 'empty' | 'attention') {
  const snapshot = reviewSnapshot(scenario, 'GROWTH', false);
  if (!snapshot) throw new Error('missing snapshot');
  if (scenario === 'attention') snapshot.cashDifferencePence = -500;
  const { explore } = reviewLinks({ section: 'today', plan: 'GROWTH', role: 'OWNER', analyticsVisible: true });
  return renderToStaticMarkup(
    <ProposedToday
      scopeLabel={reviewScopeLabel('GROWTH', false)}
      dateLabel="Wednesday 30 September 2026 · Local time"
      zoneName="GMT"
      updatedLabel="14:10"
      currency="GHS"
      storeId="sample-branch"
      salesHref="/reports/dashboard"
      moneyHref="/reports/money-received"
      snapshot={snapshot}
      exploreLinks={explore}
      nextActions={todayNextActions({ role: 'OWNER', readOnly: false })}
      readOnly={false}
    />,
  );
}

describe('Stage 3A.1 presentation blueprint', () => {
  it('keeps review routes fixture-only and off the customer reports page', () => {
    const reportsPage = readFileSync('app/(protected)/reports/page.tsx', 'utf8');
    expect(reportsPage).not.toContain('reports-stage3a1');
    expect(reportsPage).not.toContain('presentation/ProposedToday');
    expect(reportsPage).not.toContain('review-samples');
    for (const file of rootFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('prisma');
      expect(source).not.toContain('loadToday');
      expect(source).not.toContain('fetch(');
      expect(source).not.toContain('type="submit"');
    }
    const page = readFileSync('app/reviews/reports-stage3a1/page.tsx', 'utf8');
    const destination = readFileSync('app/reviews/reports-stage3a1-destination/page.tsx', 'utf8');
    expect(page).toContain('notFound()');
    expect(destination).toContain('notFound()');
    expect(page).toContain('isReportsStage3aAllowed');
    expect(readFileSync('app/reviews/reports-stage3a1/Stage3a1Review.tsx', 'utf8')).toContain('Review controls — not part of the customer screen');
  });

  it('uses one Reports navigation and keeps the mobile More name', () => {
    const markup = markupOfToday('healthy');
    expect(markup.split('aria-label="Reports sections"').length - 1).toBe(1);
    expect(markup.split('<h1').length - 1).toBe(1);
    expect(markup).toContain('aria-label="More reports"');
    expect(markup).toContain('scroll-mb-[calc(var(--mobile-bottom-nav-height)+1.5rem)]');
    expect(markup).toContain('GH₵1,500.00');
    expect(markup).toContain('financial-amount--hero');
    expect(readFileSync('app/globals.css', 'utf8')).toContain('white-space: nowrap');
  });

  it('keeps long money on one line without ellipsis', () => {
    const snapshot = reviewSnapshot('healthy', 'GROWTH', false);
    if (!snapshot) throw new Error('missing snapshot');
    snapshot.salesTodayPence = 9_876_543_210;
    snapshot.moneyReceivedPence = 9_876_543_210;
    snapshot.cashDifferencePence = -9_876_543_210;
    const markup = renderToStaticMarkup(
      <ProposedToday
        scopeLabel="Sample Main Branch"
        dateLabel="Wednesday 30 September 2026 · Local time"
        zoneName="GMT"
        updatedLabel="14:10"
        currency="GHS"
        storeId="sample-branch"
        salesHref="/reports/dashboard"
        moneyHref="/reports/money-received"
        snapshot={snapshot}
        exploreLinks={[]}
        nextActions={[]}
        readOnly={false}
      />,
    );
    expect(markup).toContain('GH₵98,765,432.10');
    expect(markup).toContain('financial-amount--hero');
    expect(markup).not.toContain('text-ellipsis');
  });

  it('caps quiet Today at four next steps and keeps five attention rows', () => {
    const empty = markupOfToday('empty');
    const attention = markupOfToday('attention');
    const explore = reviewLinks({ section: 'today', plan: 'GROWTH', role: 'OWNER', analyticsVisible: true }).explore;
    expect(explore.length).toBeGreaterThan(0);
    expect(explore.length).toBeLessThanOrEqual(4);
    expect(empty).toContain('No sales yet today');
    expect(empty).not.toContain('Control alerts');
    expect(attention).toContain('still open');
    expect(attention).toContain('Cash counted is');
    expect(attention).toContain('waiting for you to confirm');
    expect(attention).toContain('still pending with the network');
    expect(attention).toContain('from customers is past the due date');
    expect(attention).not.toContain('owed to suppliers is past the due date');
    expect(attention).toContain('Needs a look');
    expect(attention).toContain('Confirm');
  });

  it('keeps Activity and More entitlement-complete and excludes withheld statements', () => {
    const activity = stage3aLinks('activity', new Set([
      '/reports/dashboard',
      '/reports/analytics',
      '/reports/business-movement',
      '/reports/money-received',
      '/reports/momo-confirmation',
      '/reports/cash-drawer',
      '/reports/stock-movements',
      '/reports/margins',
      '/reports/reorder-suggestions',
      '/reports/sales-by-supplier',
      '/reports/risk-monitor',
    ]), { showNetworkQueue: true });
    const more = reviewLinks({ section: 'more', plan: 'PRO', role: 'OWNER', analyticsVisible: true }).links;
    const starter = reviewLinks({ section: 'more', plan: 'STARTER', role: 'OWNER', analyticsVisible: true }).links;
    const activityMarkup = renderToStaticMarkup(<ReportDirectory links={activity} />);
    const moreMarkup = renderToStaticMarkup(<ReportDirectory links={more} />);
    const starterMarkup = renderToStaticMarkup(<ReportDirectory links={starter} />);
    for (const link of activity) expect(activityMarkup).toContain(`href="${link.href}"`);
    expect(activityMarkup).toContain('/reports/analytics');
    for (const link of more) expect(moreMarkup).toContain(link.href);
    expect(moreMarkup).toContain('/reports/owner');
    expect(moreMarkup).toContain('/reports/audit-log');
    expect(starterMarkup).toContain('/reports/exports');
    expect(starterMarkup).not.toContain('/reports/income-statement');
    expect(starterMarkup).not.toContain('/reports/owner');
    for (const href of STAGE_3A_WITHHELD_HREFS) {
      expect(activityMarkup).not.toContain(href);
      expect(moreMarkup).not.toContain(href);
      expect(starterMarkup).not.toContain(href);
    }
    const hrefs = [...activityMarkup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual(activity.map((link) => link.href));
  });

  it('has one destination location landmark and one return path', () => {
    const path = returnPathFor('/reports/dashboard');
    expect(path && !('withheld' in path)).toBe(true);
    const markup = renderToStaticMarkup(
      <DestinationShell
        path={path as ReportReturnPath}
        storeId="sample-branch"
        scopeLabel="Sample Main Branch"
        periodLabel="7-day default · GMT"
        updatedLabel="14:10"
        integrityTitle="Period and how this report is read"
        integrity={<p>Sales revenue is recognised sales for this period.</p>}
      >
        <p data-first-figure="true">GH₵1,500.00</p>
      </DestinationShell>,
    );
    expect(markup.split('aria-label="Reports location"').length - 1).toBe(1);
    expect(markup.split('<h1').length - 1).toBe(1);
    expect(markup).toContain('aria-label="Back to Activity, Reports"');
    expect(markup).toContain('md:hidden');
    expect(markup).toContain('hidden min-w-0 flex-wrap');
    expect(markup).toContain('data-return-path');
    expect(markup).toContain('data-first-metric');
    expect(markup).not.toContain('/reports/balance-sheet');
    expect(markup).not.toContain('Live report figure');
    const shellSource = readFileSync('components/reports/presentation/DestinationShell.tsx', 'utf8');
    expect(shellSource.match(/truncate/g)).toEqual(['truncate']);
    expect(shellSource).toContain('{scopeLabel}');
    expect(readFileSync('app/(protected)/reports/analytics/AnalyticsClient.tsx', 'utf8')).toContain('truncate');
    const withheld = DESTINATION_SHELL_RULE.filter((row) => row.adoption === 'withheld').map((row) => row.href);
    expect(withheld).toEqual([...STAGE_3A_WITHHELD_HREFS]);
    expect(DESTINATION_SHELL_RULE.filter((row) => row.adoption === 'prototype').map((row) => row.href)).toEqual([
      '/reports/dashboard',
      '/reports/analytics',
      '/reports/business-movement',
    ]);
  });
});
