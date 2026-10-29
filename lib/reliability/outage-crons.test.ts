import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('aligns operational jobs on fifteen-minute slots without changing the daily summary', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const schedule = new Map(config.crons.map((cron: { path: string; schedule: string }) => [cron.path, cron.schedule]));
  for (const path of ['expire-online-orders', 'dispatch-storefront-notifications', 'retry-online-order-sales']) {
    expect(schedule.get(`/api/cron/${path}`)).toBe('*/15 * * * *');
  }
  expect(schedule.get('/api/cron/eod-summary')).toBe('0 20 * * *');
});
