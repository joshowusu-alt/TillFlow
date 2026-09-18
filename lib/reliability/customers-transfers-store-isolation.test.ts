import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    business: { findUnique: vi.fn() },
    store: { findFirst: vi.fn() },
    customer: { create: vi.fn() },
    product: { findMany: vi.fn() },
    stockTransfer: { create: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/services/customer-linking', () => ({
  linkPosCustomerToStorefront: vi.fn().mockResolvedValue(undefined),
}));

import { createCustomer } from '@/lib/services/customers';
import { requestStockTransfer } from '@/lib/services/stock-transfers';

const STORE_A = 'store-a-created-first';
const STORE_B = 'store-b-selected';
const STORE_C = 'store-c-destination';

describe('customers and transfers: Store A first, Store B selected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createCustomer writes Store B and never Store A', async () => {
    prismaMock.business.findUnique.mockResolvedValue({ customerScope: 'BRANCH' });
    prismaMock.store.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === STORE_B) return { id: STORE_B };
      if (where.id === STORE_A) return { id: STORE_A };
      return null;
    });
    prismaMock.customer.create.mockResolvedValue({
      id: 'cust-b',
      storeId: STORE_B,
      name: 'Store B customer',
    });

    await createCustomer('biz-1', { name: 'Store B customer', storeId: STORE_B });

    expect(prismaMock.store.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: STORE_B, businessId: 'biz-1' }) }),
    );
    expect(prismaMock.store.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: STORE_A }) }),
    );
    expect(prismaMock.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ storeId: STORE_B, name: 'Store B customer' }),
      }),
    );
    const write = prismaMock.customer.create.mock.calls[0][0];
    expect(write.data.storeId).not.toBe(STORE_A);
  });

  it('requestStockTransfer leaves from Store B, never Store A', async () => {
    prismaMock.store.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === STORE_B || where.id === STORE_C) return { id: where.id };
      return null;
    });
    prismaMock.product.findMany.mockResolvedValue([{ id: 'prod-1' }]);
    prismaMock.stockTransfer.create.mockResolvedValue({
      id: 'xfer-1',
      fromStoreId: STORE_B,
      toStoreId: STORE_C,
      lines: [{ productId: 'prod-1', qtyBase: 1 }],
    });

    await requestStockTransfer({
      businessId: 'biz-1',
      requestedByUserId: 'user-1',
      fromStoreId: STORE_B,
      toStoreId: STORE_C,
      lines: [{ productId: 'prod-1', qtyBase: 1 }],
    });

    expect(prismaMock.stockTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromStoreId: STORE_B, toStoreId: STORE_C }),
      }),
    );
    const write = prismaMock.stockTransfer.create.mock.calls[0][0];
    expect(write.data.fromStoreId).not.toBe(STORE_A);
    expect(write.data.toStoreId).not.toBe(STORE_A);
  });

  it('pages submit the operational store, not stores[0]', () => {
    const root = process.cwd();
    const customers = readFileSync(join(root, 'app/(protected)/customers/page.tsx'), 'utf8');
    const transfers = readFileSync(join(root, 'app/(protected)/transfers/page.tsx'), 'utf8');
    expect(customers).toContain('value={store.id}');
    expect(customers).toContain('name="storeId"');
    expect(customers).not.toContain('stores[0]');
    expect(transfers).toContain('defaultFromStoreId = store.id');
    expect(transfers).not.toContain('stores[0]');
    expect(readFileSync(join(root, 'app/actions/customers.ts'), 'utf8')).toContain(
      'requireSelectedStoreContext',
    );
    expect(readFileSync(join(root, 'app/actions/transfers.ts'), 'utf8')).toContain(
      'requireSelectedStoreContext',
    );
  });
});
