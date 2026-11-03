import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ construct: vi.fn(() => ({ marker: Math.random() })) }));
vi.mock('@prisma/client', () => ({ PrismaClient: state.construct }));
vi.mock('@/lib/database-runtime', () => ({ isSqliteRuntimeEnv: () => false }));

afterEach(() => {
  delete (globalThis as any).prisma;
  vi.unstubAllEnvs();
});

describe('one Prisma pool per warm worker', () => {
  it('reuses the client across production module evaluations', async () => {
    delete (globalThis as any).prisma;
    state.construct.mockClear();
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const first = (await import('./prisma')).prisma;
    vi.resetModules();
    const second = (await import('./prisma')).prisma;
    expect(second).toBe(first);
    expect(state.construct).toHaveBeenCalledTimes(1);
  });
});
