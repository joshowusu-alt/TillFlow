import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const captureExceptionMock = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function p1017() {
  return new Prisma.PrismaClientKnownRequestError('Server has closed the connection.', {
    code: 'P1017',
    clientVersion: '5.22.0',
  });
}

function prismaKnownError(code = 'P2002') {
  return new Prisma.PrismaClientKnownRequestError('Different Prisma error', {
    code,
    clientVersion: '5.22.0',
  });
}

function makeSession() {
  return {
    id: 'session-1',
    expiresAt: new Date(Date.now() + 60_000),
    userAgent: 'Mozilla/5.0 Chrome/120.0 Windows',
    ipAddress: '127.0.0.1',
    lastSeenAt: new Date(),
    user: {
      id: 'user-1',
      businessId: 'biz-1',
      name: 'Private User',
      email: 'private@example.com',
      role: 'OWNER',
      active: true,
      twoFactorEnabled: false,
    },
  };
}

async function loadAuthWithSessionMock(findUnique: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  captureExceptionMock.mockClear();

  const deleteMock = vi.fn();
  vi.doMock('react', () => ({ cache: (fn: unknown) => fn }));
  vi.doMock('next/headers', () => ({
    cookies: () => ({
      getAll: () => [{ name: 'pos_session_biz-1', value: 'secret-session-token' }],
      get: (name: string) =>
        name === 'active_business_id'
          ? { name, value: 'biz-1' }
          : name === 'pos_session_biz-1'
            ? { name, value: 'secret-session-token' }
            : undefined,
      delete: deleteMock,
    }),
    headers: () => new Map([['user-agent', 'Mozilla/5.0 Chrome/120.0 Windows']]),
  }));
  vi.doMock('next/navigation', () => ({ redirect: vi.fn() }));
  vi.doMock('@/lib/prisma', () => ({
    prisma: {
      session: {
        findUnique,
        update: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      controlBusinessProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      store: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
  }));
  vi.doMock('@/lib/billing-db-compat', () => ({
    findBusinessForAuth: vi.fn().mockResolvedValue(null),
  }));
  vi.doMock('@/lib/billing-entitlements', () => ({
    getBillingEntitlement: vi.fn(),
  }));

  const auth = await import('@/lib/auth');
  return { auth, deleteMock };
}

describe('Phase C8: auth P1017 session lookup retry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('retries session lookup once on P1017 and returns the user after recovery', async () => {
    const findUnique = vi.fn()
      .mockRejectedValueOnce(p1017())
      .mockResolvedValueOnce(makeSession());
    const { auth, deleteMock } = await loadAuthWithSessionMock(findUnique);

    await expect(auth.getUser()).resolves.toMatchObject({ id: 'user-1', businessId: 'biz-1' });

    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(deleteMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logOutput = `${warnSpy.mock.calls.flat().join('\n')}\n${infoSpy.mock.calls.flat().join('\n')}`;
    expect(logOutput).toContain('db.connection.retry');
    expect(logOutput).toContain('db.connection.retry.success');
    expect(logOutput).toContain('auth.session.findUnique');
    expect(logOutput).toContain('P1017');
    expect(logOutput).not.toMatch(/secret-session-token|private@example.com|Private User|Server has closed|stack/i);
  });

  it('retries exactly once on repeated P1017 and throws the safe user-facing error', async () => {
    const findUnique = vi.fn()
      .mockRejectedValueOnce(p1017())
      .mockRejectedValueOnce(p1017());
    const { auth, deleteMock } = await loadAuthWithSessionMock(findUnique);

    await expect(auth.getUser()).rejects.toThrow('Database temporarily unavailable. Please try again.');

    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(deleteMock).not.toHaveBeenCalled();
    const output = `${warnSpy.mock.calls.flat().join('\n')}\n${errorSpy.mock.calls.flat().join('\n')}`;
    expect(output).toContain('db.connection.retry.failed');
    expect(output).toContain('auth.session.findUnique');
    expect(output).toContain('P1017');
    expect(output).not.toMatch(/secret-session-token|private@example.com|Server has closed|stack/i);
  });

  it('does not retry non-P1017 Prisma errors', async () => {
    const findUnique = vi.fn().mockRejectedValueOnce(prismaKnownError('P2002'));
    const { auth } = await loadAuthWithSessionMock(findUnique);

    await expect(auth.getUser()).rejects.toThrow('Database temporarily unavailable. Please try again.');

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('db.connection.retry'));
  });

  it('does not retry non-Prisma errors', async () => {
    const findUnique = vi.fn().mockRejectedValueOnce(new Error('plain failure'));
    const { auth } = await loadAuthWithSessionMock(findUnique);

    await expect(auth.getUser()).rejects.toThrow('Database temporarily unavailable. Please try again.');

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('db.connection.retry'));
  });

  it('does not retry successful session lookup', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(makeSession());
    const { auth } = await loadAuthWithSessionMock(findUnique);

    await expect(auth.getUser()).resolves.toMatchObject({ id: 'user-1' });

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps P1017 retry scoped to auth session reads only', () => {
    const auth = read('lib/auth.ts');
    expect(auth).toContain('findSessionWithP1017Retry');
    expect(auth).toContain('prisma.session.findUnique({');
    expect(auth).toContain("operation: 'auth.session.findUnique'");

    [
      'lib/services/sales.ts',
      'app/actions/sales.ts',
      'lib/services/payments.ts',
      'lib/services/purchases.ts',
      'lib/services/inventory.ts',
      'lib/services/returns.ts',
      'lib/services/mobile-money.ts',
      'lib/services/shifts.ts',
    ].forEach((path) => {
      const source = read(path);
      expect(source).not.toContain('P1017');
      expect(source).not.toContain('findSessionWithP1017Retry');
      expect(source).not.toContain('db.connection.retry');
    });
  });

  it('does not change schemas, migrations, providers, routes, exports, or POS UI for C8', () => {
    expect(read('prisma/schema.prisma')).toMatch(/provider\s+=\s+"sqlite"/);
    expect(read('prisma/schema.postgres.prisma')).toMatch(/provider\s+=\s+"postgresql"/);
    expect(read('prisma/migrations/migration_lock.toml')).toMatch(/provider\s+=\s+"postgresql"/);
    expect(readdirSync(join(process.cwd(), 'prisma/migrations')).length).toBeGreaterThan(0);
    expect(read('app/(protected)/pos/page.tsx')).not.toContain('P1017');
    expect(read('app/(protected)/pos/page.tsx')).not.toContain('db.connection.retry');
  });
});
