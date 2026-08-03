import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeOutstandingBalance, CHART_OF_ACCOUNTS } from './accounting';

const { isPostgresRuntimeEnvMock } = vi.hoisted(() => ({
  isPostgresRuntimeEnvMock: vi.fn(() => false),
}));

vi.mock('@/lib/database-runtime', async () => {
  const actual = await vi.importActual<typeof import('@/lib/database-runtime')>(
    '@/lib/database-runtime',
  );
  return {
    ...actual,
    isPostgresRuntimeEnv: isPostgresRuntimeEnvMock,
  };
});

// Import after mock so ensureChartOfAccounts sees the stubbed runtime detector.
const { ensureChartOfAccounts } = await import('./accounting');

describe('computeOutstandingBalance', () => {
  it('treats paid invoices as closed even when legacy payment rows are missing', () => {
    expect(
      computeOutstandingBalance({
        totalPence: 7_480_00,
        paymentStatus: 'PAID',
        payments: [],
      }),
    ).toBe(0);
  });

  it('subtracts recorded payments for unpaid and part-paid invoices', () => {
    expect(
      computeOutstandingBalance({
        totalPence: 10_000,
        paymentStatus: 'PART_PAID',
        payments: [{ amountPence: 2_500 }, { amountPence: 3_000 }],
      }),
    ).toBe(4_500);
  });
});

describe('ensureChartOfAccounts postgres detection', () => {
  const client = {
    account: { upsert: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(CHART_OF_ACCOUNTS.length),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    isPostgresRuntimeEnvMock.mockReturnValue(false);
  });

  it('uses bulk INSERT when Postgres runtime env is detected (Production-shaped POSTGRES_* )', async () => {
    isPostgresRuntimeEnvMock.mockReturnValue(true);
    await ensureChartOfAccounts('biz-1', client as any);
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(client.account.upsert).not.toHaveBeenCalled();
  });

  it('falls back to sequential upserts when Postgres runtime is not detected', async () => {
    isPostgresRuntimeEnvMock.mockReturnValue(false);
    client.account.upsert.mockResolvedValue({});
    await ensureChartOfAccounts('biz-1', client as any);
    expect(client.account.upsert).toHaveBeenCalledTimes(CHART_OF_ACCOUNTS.length);
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
});
