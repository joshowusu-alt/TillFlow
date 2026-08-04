import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCOUNT_CODES, CHART_OF_ACCOUNTS } from '@/lib/accounting';
import { INVENTORY_GAIN_4100_NAME } from '@/lib/accounting-inventory-gain-4100';

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
  INVENTORY_INCREASE_REQUIRED_ACCOUNTS,
  assertInventoryIncreaseAccountCompatible,
  ensureInventoryIncreaseAccounts,
} = await import('./accounting-inventory-increase-accounts');

describe('inventory-increase account contract', () => {
  it('requires exactly 1200 Inventory ASSET and 4100 Inventory Gain INCOME', () => {
    expect(INVENTORY_INCREASE_REQUIRED_ACCOUNTS).toEqual([
      { code: '1200', name: 'Inventory', type: 'ASSET' },
      { code: '4100', name: INVENTORY_GAIN_4100_NAME, type: 'INCOME' },
    ]);
    expect(INVENTORY_INCREASE_REQUIRED_ACCOUNTS).toHaveLength(2);
    expect(CHART_OF_ACCOUNTS.some((a) => a.code === '4100')).toBe(true);
    expect(ACCOUNT_CODES.inventoryGain).toBe('4100');
  });

  it('inventory-increase service uses the narrow helper, not full COA ensure', () => {
    const source = readFileSync(join(process.cwd(), 'lib/services/inventory-increase.ts'), 'utf8');
    expect(source).toContain('ensureInventoryIncreaseAccounts');
    expect(source).toContain('accountMap');
    expect(source).not.toContain('ensureChartOfAccounts');
  });
});

describe('assertInventoryIncreaseAccountCompatible', () => {
  it('accepts approved mappings', () => {
    expect(() =>
      assertInventoryIncreaseAccountCompatible({
        id: '1',
        code: '1200',
        name: 'Inventory',
        type: 'ASSET',
      }),
    ).not.toThrow();
    expect(() =>
      assertInventoryIncreaseAccountCompatible({
        id: '2',
        code: '4100',
        name: INVENTORY_GAIN_4100_NAME,
        type: 'INCOME',
      }),
    ).not.toThrow();
  });

  it('rejects incompatible 1200 and 4100', () => {
    expect(() =>
      assertInventoryIncreaseAccountCompatible({
        id: '1',
        code: '1200',
        name: 'Merchandise',
        type: 'ASSET',
      }),
    ).toThrow(/incorrectly configured/i);
    expect(() =>
      assertInventoryIncreaseAccountCompatible({
        id: '2',
        code: '4100',
        name: 'Sales Revenue',
        type: 'INCOME',
      }),
    ).toThrow(/incorrectly configured/i);
  });
});

describe('ensureInventoryIncreaseAccounts', () => {
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
  const approved4100 = {
    id: 'id-4100',
    code: ACCOUNT_CODES.inventoryGain,
    name: INVENTORY_GAIN_4100_NAME,
    type: 'INCOME',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    isPostgresRuntimeEnvMock.mockReturnValue(false);
  });

  it('empty COA: upserts exactly 1200 and 4100 and creates no unrelated codes', async () => {
    client.account.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([approved1200, approved4100]);
    client.account.upsert.mockImplementation(async ({ create }: any) => ({
      id: `id-${create.code}`,
      ...create,
    }));

    const map = await ensureInventoryIncreaseAccounts(BIZ, client as any);
    expect(client.account.upsert).toHaveBeenCalledTimes(2);
    expect(client.account.upsert.mock.calls.map((c: any) => c[0].create.code).sort()).toEqual([
      '1200',
      '4100',
    ]);
    expect(map.get('1200')).toBe('id-1200');
    expect(map.get('4100')).toBe('id-4100');
  });

  it('rejects incompatible existing 1200 before journal posting', async () => {
    client.account.findMany.mockResolvedValueOnce([
      { ...approved1200, name: 'Merchandise' },
      approved4100,
    ]);
    await expect(ensureInventoryIncreaseAccounts(BIZ, client as any)).rejects.toThrow(
      /Merchandise/,
    );
    expect(client.account.upsert).not.toHaveBeenCalled();
  });

  it('rejects incompatible existing 4100 before journal posting', async () => {
    client.account.findMany.mockResolvedValueOnce([
      approved1200,
      { ...approved4100, name: 'Other Income', type: 'INCOME' },
    ]);
    await expect(ensureInventoryIncreaseAccounts(BIZ, client as any)).rejects.toThrow(
      /Other Income/,
    );
  });
});
