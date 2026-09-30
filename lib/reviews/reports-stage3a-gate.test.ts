import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';
import { isReportsStage3aAllowed, REPORTS_STAGE3A_REVIEW_PATH } from '@/lib/reviews/reports-stage3a-gate';

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
  });
});
