import { describe, expect, it } from 'vitest';
import { hasValidCronSecret } from '@/lib/cron-auth';

describe('hasValidCronSecret', () => {
  it('rejects missing secret', () => {
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
