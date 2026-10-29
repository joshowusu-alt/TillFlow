import { beforeEach, expect, it, vi } from 'vitest';
const capture = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({ captureException: capture }));
const gate = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ requireBusinessAndOptionalStore: gate }));
vi.mock('next/headers', () => ({ headers: () => new Headers({ 'x-pathname': '/reports/owner' }), cookies: () => ({ get: vi.fn() }) }));
vi.mock('@/lib/observability', () => ({ measureServerOperation: (_name: string, operation: () => unknown) => operation(), PERFORMANCE_THRESHOLDS_MS: {} }));
import ProtectedLayout from './layout';
import UnavailableScreen from '@/components/UnavailableScreen';
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
it.each([{ code: 'P1001' }, { code: 'P1017' }, { name: 'PrismaClientInitializationError' }, { message: 'Neon quota exceeded', status: 402 }])('renders outage before the root boundary loses DB details: %j', async error => {
  gate.mockRejectedValue(error);
  const result = await ProtectedLayout({ children: <p>private business data</p> });
  expect(result.type).toBe(UnavailableScreen); expect(result.props.database).toBe(true);
  expect(result.props.children).toBeUndefined();
  expect(capture).toHaveBeenCalledWith(error, expect.objectContaining({ tags: expect.objectContaining({ failure: 'database-unavailable' }) }));
});
it('preserves redirects and sends unexpected failures to the generic boundary', async () => {
  const redirect = new Error('NEXT_REDIRECT'); gate.mockRejectedValue(redirect);
  await expect(ProtectedLayout({ children: null })).rejects.toBe(redirect);
});

it.each(['ECONNRESET', 'ETIMEDOUT'])('does not report a provider %s as a database outage', async code => {
  const error = { code, message: 'Payment provider connection failed' };
  gate.mockRejectedValue(error);
  await expect(ProtectedLayout({ children: null })).rejects.toBe(error);
  expect(capture).not.toHaveBeenCalled();
});
