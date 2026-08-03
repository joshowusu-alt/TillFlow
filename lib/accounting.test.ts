import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { computeOutstandingBalance, ensureChartOfAccounts, CHART_OF_ACCOUNTS } from './accounting';

describe('computeOutstandingBalance', () => {
  it('treats paid invoices as closed even when legacy payment rows are missing', () => {
    expect(computeOutstandingBalance({
      totalPence: 7_480_00,
      paymentStatus: 'PAID',
      payments: [],
    })).toBe(0);
  });

  it('subtracts recorded payments for unpaid and part-paid invoices', () => {
    expect(computeOutstandingBalance({
      totalPence: 10_000,
      paymentStatus: 'PART_PAID',
      payments: [{ amountPence: 2_500 }, { amountPence: 3_000 }],
    })).toBe(4_500);
  });
});

describe('ensureChartOfAccounts postgres detection', () => {
  const client = {
    account: { upsert: vi.fn() },
    $executeRaw: vi.fn().mockResolvedValue(CHART_OF_ACCOUNTS.length),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
  });

  it('uses bulk INSERT when only POSTGRES_PRISMA_URL is set (Production-shaped env)', async () => {
    process.env.POSTGRES_PRISMA_URL = 'postgresql://neondb_owner:x@ep-x/neondb';
    await ensureChartOfAccounts('biz-1', client as any);
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(client.account.upsert).not.toHaveBeenCalled();
  });

  it('falls back to sequential upserts for sqlite DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'file:./dev.db';
    client.account.upsert.mockResolvedValue({});
    await ensureChartOfAccounts('biz-1', client as any);
    expect(client.account.upsert).toHaveBeenCalledTimes(CHART_OF_ACCOUNTS.length);
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
});
