import { beforeEach, describe, expect, it, vi } from 'vitest';
import { linkPosCustomerToStorefront, linkStorefrontCustomerToPos } from './customer-linking';

const prismaMock = vi.hoisted(() => ({
  storefrontCustomer: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  customer: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('linkStorefrontCustomerToPos', () => {
  it('links by Ghana E.164 phone when a match exists', async () => {
    prismaMock.storefrontCustomer.findUnique.mockResolvedValue({
      id: 'sc-1',
      businessId: 'biz-1',
      phone: '+233244123456',
      posCustomerId: null,
    });
    prismaMock.customer.findFirst.mockResolvedValue({ id: 'cust-1' });

    const result = await linkStorefrontCustomerToPos('sc-1', prismaMock as any);

    expect(result).toEqual({ posCustomerId: 'cust-1', matched: true });
    expect(prismaMock.storefrontCustomer.update).toHaveBeenCalledWith({
      where: { id: 'sc-1' },
      data: { posCustomerId: 'cust-1' },
    });
  });

  it('short-circuits when already linked and still matching', async () => {
    prismaMock.storefrontCustomer.findUnique.mockResolvedValue({
      id: 'sc-1',
      businessId: 'biz-1',
      phone: '+233244123456',
      posCustomerId: 'cust-1',
    });
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'cust-1',
      phone: '+233244123456',
    });

    const result = await linkStorefrontCustomerToPos('sc-1', prismaMock as any);

    expect(result).toEqual({ posCustomerId: 'cust-1', matched: true });
    expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.storefrontCustomer.update).not.toHaveBeenCalled();
  });

  it('returns no match when storefront phone is empty', async () => {
    prismaMock.storefrontCustomer.findUnique.mockResolvedValue({
      id: 'sc-1',
      businessId: 'biz-1',
      phone: '   ',
      posCustomerId: null,
    });

    const result = await linkStorefrontCustomerToPos('sc-1', prismaMock as any);

    expect(result).toEqual({ posCustomerId: null, matched: false });
    expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
  });

  it('clears stale link and re-links when canonical phone changed', async () => {
    prismaMock.storefrontCustomer.findUnique.mockResolvedValue({
      id: 'sc-1',
      businessId: 'biz-1',
      phone: '+233244123456',
      posCustomerId: 'cust-old',
    });
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'cust-old',
      phone: '+233500000000',
    });
    prismaMock.customer.findFirst.mockResolvedValue({ id: 'cust-new' });

    const result = await linkStorefrontCustomerToPos('sc-1', prismaMock as any);

    expect(result).toEqual({ posCustomerId: 'cust-new', matched: true });
    expect(prismaMock.storefrontCustomer.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'sc-1' },
      data: { posCustomerId: null },
    });
    expect(prismaMock.storefrontCustomer.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'sc-1' },
      data: { posCustomerId: 'cust-new' },
    });
  });
});

describe('linkPosCustomerToStorefront', () => {
  it('returns zero when no storefront match exists', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'cust-1',
      businessId: 'biz-1',
      phone: '+233244123456',
    });
    prismaMock.storefrontCustomer.updateMany.mockResolvedValue({ count: 0 });

    const result = await linkPosCustomerToStorefront('cust-1', prismaMock as any);

    expect(result).toEqual({ linkedCount: 0 });
  });

  it('links when non-Ghana normalized values are equal', async () => {
    prismaMock.customer.findUnique.mockResolvedValue({
      id: 'cust-1',
      businessId: 'biz-1',
      phone: '15551234567',
    });
    prismaMock.storefrontCustomer.updateMany.mockResolvedValue({ count: 1 });

    const result = await linkPosCustomerToStorefront('cust-1', prismaMock as any);

    expect(result).toEqual({ linkedCount: 1 });
    expect(prismaMock.storefrontCustomer.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: 'biz-1',
        phone: '15551234567',
        posCustomerId: null,
      },
      data: { posCustomerId: 'cust-1' },
    });
  });
});
