import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { middleware } from './middleware';
import {
  REPORTS_BLUEPRINT_PATH,
  isReportsBlueprintAllowed,
  isReportsBlueprintPath,
} from './lib/reviews/reports-blueprint-gate';

function request(pathname: string) {
  return new NextRequest(new URL(pathname, 'http://localhost:6200'), { method: 'GET' });
}

const envKeys = ['VERCEL_ENV', 'NODE_ENV', 'ALLOW_REPORTS_BLUEPRINT'] as const;
const snapshot: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of envKeys) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setEnv(values: Partial<Record<(typeof envKeys)[number], string | undefined>>) {
  for (const key of envKeys) snapshot[key] = process.env[key];
  for (const key of envKeys) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('reports redesign blueprint gate', () => {
  it('matches only the exact review path', () => {
    expect(REPORTS_BLUEPRINT_PATH).toBe('/reviews/reports-redesign-blueprint');
    expect(isReportsBlueprintPath(REPORTS_BLUEPRINT_PATH)).toBe(true);
    expect(isReportsBlueprintPath(`${REPORTS_BLUEPRINT_PATH}/extra`)).toBe(false);
    expect(isReportsBlueprintPath('/reports')).toBe(false);
  });

  it('refuses Production and allows Preview and development', () => {
    expect(isReportsBlueprintAllowed({ vercelEnv: 'production', nodeEnv: 'production' })).toBe(false);
    expect(isReportsBlueprintAllowed({ vercelEnv: 'preview', nodeEnv: 'production' })).toBe(true);
    expect(isReportsBlueprintAllowed({ vercelEnv: undefined, nodeEnv: 'development' })).toBe(true);
    expect(isReportsBlueprintAllowed({ vercelEnv: 'production', nodeEnv: 'development' })).toBe(false);
    expect(isReportsBlueprintAllowed({ vercelEnv: undefined, nodeEnv: 'production', allowFlag: 'true' })).toBe(true);
  });

  it('returns 404 on Production instead of a login redirect', () => {
    setEnv({ VERCEL_ENV: 'production', NODE_ENV: 'production', ALLOW_REPORTS_BLUEPRINT: 'true' });
    const response = middleware(request(REPORTS_BLUEPRINT_PATH));
    expect(response.status).toBe(404);
  });

  it('lets an unauthenticated Preview request through', async () => {
    setEnv({ VERCEL_ENV: 'preview', NODE_ENV: 'production' });
    const response = middleware(request(REPORTS_BLUEPRINT_PATH));
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(404);
    const location = response.headers.get('location') ?? '';
    expect(location).not.toContain('/login');
  });

  it('still sends an unauthenticated report route to login', () => {
    setEnv({ VERCEL_ENV: 'preview', NODE_ENV: 'production' });
    const response = middleware(request('/reports/command-center'));
    expect(response.headers.get('location') ?? '').toContain('/login');
  });

  it('prototype source does not call Prisma or live report services', () => {
    const directory = join(process.cwd(), 'app', 'reviews', 'reports-redesign-blueprint');
    const page = readFileSync(join(directory, 'page.tsx'), 'utf8');
    const client = readFileSync(join(directory, 'BlueprintReview.tsx'), 'utf8');
    const combined = `${page}\n${client}`;
    expect(combined).not.toMatch(/prisma|@\/lib\/reports|getCommandCenter|decideSurfaceAccess/);
  });
});
