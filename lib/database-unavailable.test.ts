import { expect, it } from 'vitest';
import { isDatabaseUnavailable } from './database-unavailable';
it.each(['P1001', 'P1017', 'P1002', 'P2024', 'ECONNREFUSED'])('classifies %s', code => {
  expect(isDatabaseUnavailable({ code })).toBe(true);
});
it('recognizes Prisma initialization, nested causes and Neon quotas', () => {
  expect(isDatabaseUnavailable({ name: 'PrismaClientInitializationError' })).toBe(true);
  expect(isDatabaseUnavailable({ cause: { message: 'Neon: network transfer quota exceeded' } })).toBe(true);
  expect(isDatabaseUnavailable({ message: 'Neon request refused', status: 402 })).toBe(true);
  expect(isDatabaseUnavailable({ message: 'Neon: compute time limit exceeded' })).toBe(true);
});
it('leaves redirects, validation errors, and unrelated payment failures alone', () => {
  for (const error of [{ message: 'NEXT_REDIRECT' }, { code: 'P2002' }, { status: 402, message: 'Card declined' }, null]) {
    expect(isDatabaseUnavailable(error)).toBe(false);
  }
  const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
  expect(isDatabaseUnavailable(cycle)).toBe(false);
});
