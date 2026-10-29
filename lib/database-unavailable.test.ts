import { expect, it } from 'vitest';
import { isDatabaseUnavailable, runDatabaseOperation } from './database-unavailable';
it.each(['P1001', 'P1017', 'P1002', 'P2024'])('classifies %s', code => {
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

it.each(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'])('requires database provenance for %s', async code => {
  const providerError = { code, message: 'Payment provider connection failed' };
  expect(isDatabaseUnavailable(providerError)).toBe(false);
  await expect(runDatabaseOperation(async () => { throw providerError; })).rejects.toSatisfy((error: unknown) => isDatabaseUnavailable(error));
});
it.each([{ message: 'Your compute time quota has been exceeded' }, { message: 'Network transfer usage limit reached' }, { status: 402, message: 'Payment required' }, { cause: { statusCode: 402 } }])('handles unbranded database quota refusal %j', async error => {
  expect(isDatabaseUnavailable(error)).toBe(false);
  await expect(runDatabaseOperation(async () => { throw error; })).rejects.toSatisfy((error: unknown) => isDatabaseUnavailable(error));
});
it('preserves validation errors and Prisma retry codes at the database adapter', async () => {
  for (const error of [{ code: 'P2002' }, { code: 'P1017' }]) {
    await expect(runDatabaseOperation(async () => { throw error; })).rejects.toBe(error);
  }
});
