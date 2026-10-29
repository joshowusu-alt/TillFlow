import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { messageOutbox: mock } }));
vi.mock('@/lib/cron-auth', () => ({ hasValidCronSecret: mock.auth }));
vi.mock('@/lib/services/storefront-sms', () => ({ sendStorefrontSms: vi.fn() }));
import { GET } from './route';
import { NextRequest } from 'next/server';
beforeEach(() => { vi.clearAllMocks(); mock.auth.mockReturnValue(true); mock.findMany.mockResolvedValue([]); });
it('returns after one narrow read for an empty queue, without writes', async () => {
  const response = await GET(new NextRequest('http://localhost/api/cron/dispatch-storefront-notifications'));
  expect((await response.json()).processed).toBe(0);
  expect(mock.findMany).toHaveBeenCalledOnce(); expect(mock.updateMany).not.toHaveBeenCalled();
  expect(mock.findMany.mock.calls[0][0]).toMatchObject({ take: 50, select: { id: true } });
});
it('rechecks eligibility when claiming a bounded batch and only reads its own claims', async () => {
  mock.findMany.mockResolvedValueOnce([{ id: 'one' }, { id: 'two' }]).mockResolvedValueOnce([]);
  await GET(new NextRequest('http://localhost/api/cron/dispatch-storefront-notifications'));
  expect(mock.updateMany.mock.calls[0][0].where).toMatchObject({ id: { in: ['one', 'two'] }, status: 'PENDING', AND: expect.any(Array) });
  expect(mock.findMany.mock.calls[1][0]).toMatchObject({ take: 50, where: { id: { in: ['one', 'two'] }, lastError: expect.stringMatching(/^LOCKED:/) } });
});
it('does not query without cron authorization', async () => {
  mock.auth.mockReturnValue(false);
  expect((await GET(new NextRequest('http://localhost/api/cron/dispatch-storefront-notifications'))).status).toBe(401);
  expect(mock.findMany).not.toHaveBeenCalled();
});
