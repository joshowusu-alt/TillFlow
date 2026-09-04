import { describe, expect, it } from 'vitest';
import { hasValidCronSecret } from '@/lib/cron-auth';

describe('hasValidCronSecret', () => {
  it('fails closed when CRON_SECRET is unset', () => {
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const ok = hasValidCronSecret({
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'authorization' ? 'Bearer test-secret' : null,
      },
    });
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
    expect(ok).toBe(false);
  });

  it('rejects missing request secret', () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-secret';
    const ok = hasValidCronSecret({
      headers: { get: () => null },
    });
    process.env.CRON_SECRET = prev;
    expect(ok).toBe(false);
  });

  it('accepts bearer token', () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-secret';
    const ok = hasValidCronSecret({
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'authorization' ? 'Bearer test-secret' : null,
      },
    });
    process.env.CRON_SECRET = prev;
    expect(ok).toBe(true);
  });
});
