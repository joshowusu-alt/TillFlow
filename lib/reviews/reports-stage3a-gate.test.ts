import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';
import {
  isReportsStage3aAllowed,
  isReportsStage3aPath,
  REPORTS_MONEY_LAYOUT_REVIEW_PATH,
  REPORTS_STAGE3A_CONTEXT_REVIEW_PATH,
  REPORTS_STAGE3A_REVIEW_PATH,
  REPORTS_STAGE3A1_DESTINATION_REVIEW_PATH,
  REPORTS_STAGE3A1_REVIEW_PATH,
} from '@/lib/reviews/reports-stage3a-gate';
import { reviewAttentionSampleRows, reviewLinks, reviewSnapshot } from '@/lib/reports/today/review-samples';
import { isQuietToday } from '@/lib/reports/today/model';

const mutableEnv = process.env as { VERCEL_ENV?: string; NODE_ENV?: string };
const env = { VERCEL_ENV: process.env.VERCEL_ENV, NODE_ENV: process.env.NODE_ENV };

afterEach(() => {
  if (env.VERCEL_ENV === undefined) delete mutableEnv.VERCEL_ENV;
  else mutableEnv.VERCEL_ENV = env.VERCEL_ENV;
  if (env.NODE_ENV === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = env.NODE_ENV;
});

describe('Stage 3A review gate', () => {
  it('renders in development and preview and refuses production', () => {
    expect(isReportsStage3aAllowed({ vercelEnv: 'production', nodeEnv: 'production' })).toBe(false);
    expect(isReportsStage3aAllowed({ vercelEnv: 'production', nodeEnv: 'development' })).toBe(false);
    expect(isReportsStage3aAllowed({ vercelEnv: 'preview', nodeEnv: 'production' })).toBe(true);
    expect(isReportsStage3aAllowed({ vercelEnv: undefined, nodeEnv: 'development' })).toBe(true);
    expect(isReportsStage3aAllowed({ vercelEnv: undefined, nodeEnv: 'test' })).toBe(false);
  });

  it('returns 404 from production middleware before a login redirect', () => {
    mutableEnv.VERCEL_ENV = 'production';
    mutableEnv.NODE_ENV = 'production';
    const response = middleware(new NextRequest(new URL(REPORTS_STAGE3A_REVIEW_PATH, 'http://localhost')));
    expect(response.status).toBe(404);
    const money = middleware(new NextRequest(new URL(REPORTS_MONEY_LAYOUT_REVIEW_PATH, 'http://localhost')));
    expect(money.status).toBe(404);
    expect(isReportsStage3aPath(REPORTS_MONEY_LAYOUT_REVIEW_PATH)).toBe(true);
    expect(isReportsStage3aPath(REPORTS_STAGE3A_CONTEXT_REVIEW_PATH)).toBe(true);
    const presentation = middleware(new NextRequest(new URL(REPORTS_STAGE3A1_REVIEW_PATH, 'http://localhost')));
    expect(presentation.status).toBe(404);
    expect(presentation.headers.get('location')).toBeNull();
    const destination = middleware(new NextRequest(new URL(REPORTS_STAGE3A1_DESTINATION_REVIEW_PATH, 'http://localhost')));
    expect(destination.status).toBe(404);
    expect(destination.headers.get('location')).toBeNull();
  });

  it('keeps empty Today next steps to four and distinct from healthy', () => {
    const empty = reviewSnapshot('empty', 'GROWTH', false);
    const healthy = reviewSnapshot('healthy', 'GROWTH', false);
    expect(empty && isQuietToday(empty)).toBe(true);
    expect(healthy && isQuietToday(healthy)).toBe(false);
    expect(healthy?.salesTodayPence).toBeGreaterThan(0);
    const { explore } = reviewLinks({ section: 'today', plan: 'GROWTH', role: 'OWNER', analyticsVisible: true });
    expect(explore.length).toBeGreaterThan(0);
    expect(explore.length).toBeLessThanOrEqual(4);
    expect(explore.map((link) => link.href)).not.toContain('/reports/analytics');
  });

  it('exposes five ranked attention rows on the review sample', () => {
    const rows = reviewAttentionSampleRows();
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not query or mutate from the review surface', () => {
    const page = readFileSync('app/reviews/reports-stage3a/page.tsx', 'utf8');
    const client = readFileSync('app/reviews/reports-stage3a/Stage3aReview.tsx', 'utf8');
    const samples = readFileSync('lib/reports/today/review-samples.ts', 'utf8');
    const reportsPage = readFileSync('app/(protected)/reports/page.tsx', 'utf8');
    for (const source of [page, client, samples]) {
      expect(source).not.toContain('prisma');
      expect(source).not.toContain('loadToday');
      expect(source).not.toContain('fetch(');
      expect(source).not.toContain('type="submit"');
      expect(source).not.toContain('Download last week');
    }
    expect(client).toContain('Review controls — not part of the customer screen');
    expect(client).toContain('Sample');
    expect(reportsPage).not.toContain('review-samples');
    expect(reportsPage).not.toContain('fixture');
    const moneyPage = readFileSync('app/reviews/reports-money-layout/page.tsx', 'utf8');
    expect(moneyPage).not.toContain('prisma');
    expect(moneyPage).toContain('FinancialAmount');
    const contextPage = readFileSync('app/reviews/reports-stage3a-context/page.tsx', 'utf8');
    const contextClient = readFileSync('app/reviews/reports-stage3a-context/Stage3aContextReview.tsx', 'utf8');
    for (const source of [contextPage, contextClient]) {
      expect(source).not.toContain('prisma');
      expect(source).not.toContain('loadToday');
      expect(source).not.toContain('fetch(');
    }
    expect(contextClient).toContain('ReportsDestinationHead');
    expect(contextClient).toContain('Synthetic destination context');
  });
});
