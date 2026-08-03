import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCOUNT_CODES, CHART_OF_ACCOUNTS } from '@/lib/accounting';
import { INVENTORY_LOSS_5100_NAME } from '@/lib/accounting-inventory-loss-5100';

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

const {
  INVENTORY_DECREASE_REQUIRED_ACCOUNTS,
  assertInventoryDecreaseAccountCompatible,
  ensureInventoryDecreaseAccounts,
} = await import('./accounting-inventory-decrease-accounts');

describe('inventory-decrease account contract', () => {
  it('requires exactly 1200 Inventory ASSET and 5100 Inventory Loss EXPENSE', () => {
    expect(INVENTORY_DECREASE_REQUIRED_ACCOUNTS).toEqual([
      { code: '1200', name: 'Inventory', type: 'ASSET' },
      { code: '5100', name: INVENTORY_LOSS_5100_NAME, type: 'EXPENSE' },
    ]);
    expect(INVENTORY_DECREASE_REQUIRED_ACCOUNTS).toHaveLength(2);
    expect(CHART_OF_ACCOUNTS.length).toBeGreaterThan(2);
  });

  it('inventory-decrease service uses the narrow helper, not full COA ensure', () => {
    const source = readFileSync(join(process.cwd(), 'lib/services/inventory-decrease.ts'), 'utf8');
    expect(source).toContain('ensureInventoryDecreaseAccounts');
    expect(source).toContain('accountMap');
    expect(source).not.toContain('ensureChartOfAccounts');
  });
});

describe('assertInventoryDecreaseAccountCompatible', () => {
  it('accepts approved mappings', () => {
    expect(() =>
      assertInventoryDecreaseAccountCompatible({
        id: '1',
        code: '1200',
        name: 'Inventory',
        type: 'ASSET',
      }),
    ).not.toThrow();
    expect(() =>
      assertInventoryDecreaseAccountCompatible({
        id: '2',
        code: '5100',
        name: INVENTORY_LOSS_5100_NAME,
        type: 'EXPENSE',
      }),
    ).not.toThrow();
  });

  it('rejects incompatible name or type', () => {
    expect(() =>
      assertInventoryDecreaseAccountCompatible({
        id: '1',
        code: '1200',
        name: 'Stock Asset',
        type: 'ASSET',
      }),
    ).toThrow(/incorrectly configured/i);
    expect(() =>
      assertInventoryDecreaseAccountCompatible({
        id: '2',
        code: '5100',
        name: 'Operating Expenses',
        type: 'EXPENSE',
      }),
    ).toThrow(/incorrectly configured/i);
  });
});

describe('ensureInventoryDecreaseAccounts', () => {
  const BIZ = 'biz-empty-coa';
  const client = {
    account: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    $executeRaw: vi.fn(),
  };

  const approved1200 = {
    id: 'id-1200',
    code: ACCOUNT_CODES.inventory,
    name: 'Inventory',
    type: 'ASSET',
  };
  const approved5100 = {
    id: 'id-5100',
    code: ACCOUNT_CODES.inventoryLoss,
    name: INVENTORY_LOSS_5100_NAME,
    type: 'EXPENSE',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    isPostgresRuntimeEnvMock.mockReturnValue(false);
  });

  it('empty COA: upserts exactly 1200 and 5100 (sqlite path) and creates no unrelated codes', async () => {
    client.account.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([approved1200, approved5100]);
    client.account.upsert.mockImplementation(async ({ create }: any) => ({
      id: `id-${create.code}`,
      ...create,
    }));

    const started = Date.now();
    const map = await ensureInventoryDecreaseAccounts(BIZ, client as any);
    const elapsedMs = Date.now() - started;

    expect([...map.keys()].sort()).toEqual(['1200', '5100']);
    expect(client.account.upsert).toHaveBeenCalledTimes(2);
    const upsertedCodes = client.account.upsert.mock.calls.map((c) => c[0].create.code).sort();
    expect(upsertedCodes).toEqual(['1200', '5100']);
    expect(upsertedCodes.every((c) => !['1000', '5000', '6000'].includes(c))).toBe(true);
    // Timing evidence is in-process mock latency only — not Production RTT proof.
    expect(elapsedMs).toBeLessThan(5000);
  });

  it('existing complete COA: reuses both and performs no upserts', async () => {
    client.account.findMany.mockResolvedValue([approved1200, approved5100]);

    const map = await ensureInventoryDecreaseAccounts(BIZ, client as any);
    expect(map.get('1200')).toBe('id-1200');
    expect(map.get('5100')).toBe('id-5100');
    expect(client.account.upsert).not.toHaveBeenCalled();
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  it('only 1200 exists: reuses 1200 and creates 5100 once', async () => {
    client.account.findMany
      .mockResolvedValueOnce([approved1200])
      .mockResolvedValueOnce([approved1200, approved5100]);
    client.account.upsert.mockResolvedValue(approved5100);

    await ensureInventoryDecreaseAccounts(BIZ, client as any);
    expect(client.account.upsert).toHaveBeenCalledTimes(1);
    expect(client.account.upsert.mock.calls[0][0].create.code).toBe('5100');
  });

  it('only 5100 exists: reuses 5100 and creates 1200 once', async () => {
    client.account.findMany
      .mockResolvedValueOnce([approved5100])
      .mockResolvedValueOnce([approved1200, approved5100]);
    client.account.upsert.mockResolvedValue(approved1200);

    await ensureInventoryDecreaseAccounts(BIZ, client as any);
    expect(client.account.upsert).toHaveBeenCalledTimes(1);
    expect(client.account.upsert.mock.calls[0][0].create.code).toBe('1200');
  });

  it('postgres path: single INSERT for missing accounts when Postgres runtime is detected', async () => {
    isPostgresRuntimeEnvMock.mockReturnValue(true);
    client.account.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([approved1200, approved5100]);
    client.$executeRaw.mockResolvedValue(2);

    const map = await ensureInventoryDecreaseAccounts(BIZ, client as any);
    expect(map.size).toBe(2);
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(client.account.upsert).not.toHaveBeenCalled();
  });

  it('concurrent creators: ON CONFLICT then re-read returns stable IDs without duplicate create side effects', async () => {
    isPostgresRuntimeEnvMock.mockReturnValue(true);
    client.account.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([approved1200, approved5100]);
    client.$executeRaw.mockResolvedValue(0);

    const map = await ensureInventoryDecreaseAccounts(BIZ, client as any);
    expect(map.get('1200')).toBe('id-1200');
    expect(map.get('5100')).toBe('id-5100');
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(client.account.findMany).toHaveBeenCalledTimes(2);
  });

  it('incompatible existing 1200 fails before any create', async () => {
    client.account.findMany.mockResolvedValue([
      { id: 'bad', code: '1200', name: 'Merchandise', type: 'ASSET' },
    ]);

    await expect(ensureInventoryDecreaseAccounts(BIZ, client as any)).rejects.toThrow(
      /incorrectly configured/i,
    );
    expect(client.account.upsert).not.toHaveBeenCalled();
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  it('timing-focused empty-COA path stays under interactive-tx budget (mock limitation noted)', async () => {
    // Limitation: this measures in-memory mock duration, not Neon RTT. The
    // Production failure was ~19 sequential upserts at ~5s; the narrow path
    // performs at most 2 upserts (or 1 bulk INSERT) for required codes only.
    const BEFORE_UPSERTS = CHART_OF_ACCOUNTS.length; // 19
    const AFTER_UPSERTS_MAX = INVENTORY_DECREASE_REQUIRED_ACCOUNTS.length; // 2
    expect(AFTER_UPSERTS_MAX).toBe(2);
    expect(BEFORE_UPSERTS).toBeGreaterThanOrEqual(19);

    client.account.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([approved1200, approved5100]);
    client.account.upsert.mockImplementation(async () => approved1200);

    const PRISMA_DEFAULT_TX_TIMEOUT_MS = 5000;
    const started = performance.now();
    await ensureInventoryDecreaseAccounts(BIZ, client as any);
    const elapsedMs = performance.now() - started;

    expect(client.account.upsert).toHaveBeenCalledTimes(AFTER_UPSERTS_MAX);
    expect(elapsedMs).toBeLessThan(PRISMA_DEFAULT_TX_TIMEOUT_MS * 0.5);
  });
});
