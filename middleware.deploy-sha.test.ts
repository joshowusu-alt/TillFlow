import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/qa/deploy-sha/route';
import { middleware, PUBLIC_DEPLOY_SHA_PATH } from './middleware';

function unauthenticatedRequest(pathname: string) {
  return new NextRequest(new URL(pathname, 'http://localhost:6200'), { method: 'GET' });
}

function jsonStatus(response: Response) {
  return response.status;
}

const envKeys = ['VERCEL_ENV', 'VERCEL_GIT_COMMIT_SHA', 'GIT_COMMIT_SHA', 'RELIABILITY_EVIDENCE_API'] as const;
const envSnapshot: Record<string, string | undefined> = {};

function snapshotEnv() {
  for (const key of envKeys) envSnapshot[key] = process.env[key];
}

function restoreEnv() {
  for (const key of envKeys) {
    const value = envSnapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('Preview deploy-sha middleware exemption', () => {
  it('uses exact pathname equality, not a /api/qa prefix', () => {
    expect(PUBLIC_DEPLOY_SHA_PATH).toBe('/api/qa/deploy-sha');
  });

  it('lets unauthenticated GET /api/qa/deploy-sha through middleware', async () => {
    const response = middleware(unauthenticatedRequest('/api/qa/deploy-sha'));
    expect(jsonStatus(response)).not.toBe(401);
    expect(jsonStatus(response)).not.toBe(403);
    const body = await response.text();
    expect(body).not.toContain('Unauthorized');
  });

  it('keeps neighbouring QA and suffix paths session-protected', async () => {
    for (const pathname of [
      '/api/qa',
      '/api/qa/',
      '/api/qa/deploy-sha/',
      '/api/qa/deploy-sha2',
      '/api/qa/deploy-sha/anything',
    ]) {
      const response = middleware(unauthenticatedRequest(pathname));
      expect(jsonStatus(response), pathname).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    }
  });

  it('keeps /api/qa/reliability-snapshot session-protected', async () => {
    const response = middleware(unauthenticatedRequest('/api/qa/reliability-snapshot'));
    expect(jsonStatus(response)).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('keeps another private /api/* route session-protected', async () => {
    const response = middleware(unauthenticatedRequest('/api/offline/batch-sync'));
    expect(jsonStatus(response)).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });
});

describe('Preview deploy-sha route identity', () => {
  beforeEach(() => snapshotEnv());
  afterEach(() => restoreEnv());

  it('returns 404 when VERCEL_ENV=production', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.RELIABILITY_EVIDENCE_API = '1';
    process.env.VERCEL_GIT_COMMIT_SHA = 'should-not-leak';
    const response = await GET();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not_available' });
  });

  it('returns SHA and vercelEnv in Preview', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_GIT_COMMIT_SHA = 'b55df519f4c69ecfde76094b33fc6a59e343f4c6';
    delete process.env.RELIABILITY_EVIDENCE_API;
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sha).toBe('b55df519f4c69ecfde76094b33fc6a59e343f4c6');
    expect(body.vercelEnv).toBe('preview');
  });
});
