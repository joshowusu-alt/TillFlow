import { afterEach, expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: query } }));
import { GET } from './route';
afterEach(() => vi.unstubAllEnvs());
it.each([true, false])('reports database health accurately (up=%s) with one probe', async up => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  query.mockReset(); if (up) query.mockResolvedValue([{ ok: 1 }]); else query.mockRejectedValue({ code: 'P1001', message: 'unreachable' });
  const response = await GET(); const body = await response.json();
  expect(response.status).toBe(up ? 200 : 503);
  expect(body.services.database.status).toBe(up ? 'up' : 'down');
  expect(query).toHaveBeenCalledOnce();
});
