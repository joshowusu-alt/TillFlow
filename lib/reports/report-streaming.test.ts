import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ReportSectionSkeleton from '@/components/reports/ReportSectionSkeleton';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Phase 2b report streaming', () => {
  const analyticsPage = read('app/(protected)/reports/analytics/page.tsx');
  const analyticsContent = read('app/(protected)/reports/analytics/AnalyticsContent.tsx');
  const dashboardPage = read('app/(protected)/reports/dashboard/page.tsx');
  const dashboardContent = read('app/(protected)/reports/dashboard/TradingDashboardContent.tsx');
  const ownerPage = read('app/(protected)/reports/owner/page.tsx');
  const ownerBody = read('app/(protected)/reports/owner/OwnerDashboardBody.tsx');
  const financials = read('lib/reports/financials.ts');
  const ownerDashboard = read('lib/reports/owner-dashboard.ts');
  const todayKpis = read('lib/reports/today-kpis.ts');
  const posLoader = read('app/(protected)/pos/loading.tsx');
  const salesActions = read('app/actions/sales.ts');
  const performancePhaseB = read('lib/services/performance-phase-b.test.ts');

  it('analytics page uses Suspense and keeps shell outside heavy content', () => {
    expect(analyticsPage).toContain('Suspense');
    expect(analyticsPage).toContain('AnalyticsContent');
    expect(analyticsPage).toContain('PageHeader');
    expect(analyticsPage).toContain('AnalyticsPeriodSelector');
    expect(analyticsPage).not.toContain('salesInvoice.findMany');
    expect(analyticsContent).toContain('salesInvoice.findMany');
    expect(analyticsContent).toContain('report.analytics.snapshot');
  });

  it('dashboard page streams heavy trading dashboard body behind Suspense', () => {
    expect(dashboardPage).toContain('Suspense');
    expect(dashboardPage).toContain('TradingDashboardContent');
    expect(dashboardPage).toContain('ReportFilterCard');
    expect(dashboardPage).not.toContain('_getTradingDashboardSnapshot');
    expect(dashboardContent).toContain('_getTradingDashboardSnapshot');
    expect(dashboardContent).toContain('getCachedTradingDashboardSnapshot');
    expect(dashboardPage).toMatch(/startIso=\{start\.toISOString\(\)\}/);
    expect(dashboardPage).toMatch(/endIso=\{end\.toISOString\(\)\}/);
    expect(dashboardPage).toMatch(/selectedStoreId=\{selectedStoreId\}/);
  });

  it('owner page streams snapshot body behind Suspense', () => {
    expect(ownerPage).toContain('Suspense');
    expect(ownerPage).toContain('OwnerDashboardBody');
    expect(ownerPage).not.toContain('getOwnerDashboardSnapshot');
    expect(ownerBody).toContain('getOwnerDashboardSnapshot');
  });

  it('uses compact report-shaped section fallbacks', () => {
    const sectionSkeleton = read('components/reports/ReportSectionSkeleton.tsx');

    expect(analyticsPage).toContain('ReportSectionSkeleton');
    expect(dashboardPage).toContain('ReportSectionSkeleton');
    expect(ownerPage).toContain('ReportSectionSkeleton');
    expect(sectionSkeleton).toContain('role="status"');
    expect(sectionSkeleton).not.toContain('min-h-[70vh]');
    expect(sectionSkeleton).not.toMatch(/grid-cols-4[\s\S]*Array\(4\)/);
  });

  it('does not change report calculation modules', () => {
    expect(financials).toContain('export function getIncomeStatement');
    expect(ownerDashboard).toContain('unstable_cache');
    expect(ownerDashboard).toContain('revalidate: 60');
    expect(todayKpis).toContain('revalidate: 30');
  });

  it('does not touch POS loader or checkout actions', () => {
    expect(posLoader).toContain('min-h-[70vh]');
    expect(posLoader).not.toContain('ReportSectionSkeleton');
    expect(salesActions).toContain('await createSale({');
    expect(salesActions).not.toContain('ReportSectionSkeleton');
  });

  it('keeps trading dashboard cache TTL and tags in content module', () => {
    expect(dashboardContent).toContain('revalidate: 60');
    expect(dashboardContent).toContain("tags: ['reports', 'trading-dashboard']");
    expect(performancePhaseB).toContain('Trading Dashboard caches only the scoped period snapshot');
  });

  it('renders section skeleton without full-screen splash behaviour', () => {
    render(React.createElement(ReportSectionSkeleton));

    expect(screen.getByRole('status', { name: 'Loading report section' })).toBeInTheDocument();
  });
});
