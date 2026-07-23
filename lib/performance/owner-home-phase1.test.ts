import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_RESUME_STALE_MS } from '@/hooks/useRouterRefreshOnVisibility';
import { LAUNCH_REDIRECT_DELAY_MS } from '@/lib/performance/launch-handoff-timing';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Owner Home Phase 1 performance contracts', () => {
  it('names HOME_RESUME_STALE_MS at 20 seconds', () => {
    expect(HOME_RESUME_STALE_MS).toBe(20_000);
  });

  it('removes the fixed launch redirect delay', () => {
    expect(LAUNCH_REDIRECT_DELAY_MS).toBe(0);
    const redirector = read('components/LaunchRedirector.tsx');
    expect(redirector).toContain('router.replace');
    expect(redirector).toContain('LAUNCH_REDIRECT_DELAY_MS');
  });

  it('nav KPIs use slim Home summary instead of full getTodayKPIs', () => {
    const nav = read('app/actions/nav-kpis.ts');
    expect(nav).toContain('getHomePerformanceSummary');
    expect(nav).not.toContain('getTodayKPIs');
  });

  it('Home attention reuses shared Command Center issue-flag counter', () => {
    const attention = read('lib/owner-home/attention.ts');
    expect(attention).toContain('countCommandCenterIssueFlags');
    expect(attention).toContain('getTodayKPIs');
  });

  it('does not double mobile bottom-nav clearance on completed Home', () => {
    const stream = read('components/owner-home/OwnerHomeCompletedStream.tsx');
    const welcome = read('components/ReadinessJourney.tsx');
    expect(stream).toContain('pb-4');
    expect(stream).toContain('lg:pb-8');
    expect(stream).not.toContain('mobile-bottom-nav-clearance');
    expect(welcome).not.toMatch(
      /WelcomeDashboard[\s\S]{0,200}pb-\[calc\(var\(--mobile-bottom-nav-clearance\)/,
    );
  });

  it('attention / IYR skeletons avoid false all-clear copy', () => {
    const skeletons = read('components/owner-home/skeletons.tsx');
    expect(skeletons).toContain("Checking today&apos;s status");
    expect(skeletons).toContain('HomeAttentionSkeleton');
    // Runtime UI must not claim all-clear while loading (comment may mention the phrase).
    expect(skeletons).not.toMatch(/role="status"[\s\S]{0,200}No urgent issues/);
    expect(skeletons).not.toContain('allClearMessage');
  });
});
