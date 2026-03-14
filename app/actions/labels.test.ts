import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, renderLabelsHtmlMock, auditMock, withBusinessContextMock } = vi.hoisted(() => ({
  prismaMock: {
    business: {
      findUnique: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
  },
  renderLabelsHtmlMock: vi.fn(),
  auditMock: vi.fn(),
  withBusinessContextMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/labels/templates', () => ({ renderLabelsHtml: renderLabelsHtmlMock }));
vi.mock('@/lib/audit', () => ({ audit: auditMock }));
vi.mock('@/lib/action-utils', () => ({
  ok: (data?: unknown) => (data === undefined ? { success: true } : { success: true, data }),
  err: (error: string) => ({ success: false, error }),
  safeAction: async (fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Something unexpected happened. Please try again.',
      };
    }
  },
  withBusinessContext: withBusinessContextMock,
}));

import { generateLabelsHtmlAction } from './labels';

function makeProduct(
  overrides: Partial<{
    id: string;
    name: string;
    barcode: string | null;
    sku: string | null;
    sellingPriceBasePence: number;
    category: { name: string } | null;
    productUnits: Array<{ unit: { name: string; symbol: string | null } }>;
  }> = {},
) {
  return {
    id: 'prod-1',
    name: 'Premium Rice',
    barcode: '123456789012',
    sku: 'SKU-001',
    sellingPriceBasePence: 1250,
    category: { name: 'Groceries' },
    productUnits: [{ unit: { name: 'Kilogram', symbol: 'kg' } }],
    ...overrides,
  };
}

describe('generateLabelsHtmlAction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T08:00:00Z'));
    vi.clearAllMocks();

    withBusinessContextMock.mockResolvedValue({
      businessId: 'biz-1',
      user: {
        id: 'user-1',
        name: 'Alice Manager',
        role: 'OWNER',
        email: 'alice@example.com',
        businessId: 'biz-1',
      },
    });
    prismaMock.business.findUnique.mockResolvedValue({ currency: 'GHS' });
    prismaMock.product.findMany.mockResolvedValue([makeProduct()]);
    renderLabelsHtmlMock.mockResolvedValue('<html>generated labels</html>');
    auditMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns HTML for valid input with SHELF_TAG template', async () => {
    const result = await generateLabelsHtmlAction({
      products: [{ productId: 'prod-1', quantity: 2 }],
      template: 'SHELF_TAG',
    });

    expect(result).toEqual({
      success: true,
      data: {
        html: '<html>generated labels</html>',
        labelCount: 2,
      },
    });
    expect(renderLabelsHtmlMock).toHaveBeenCalledWith(expect.any(Array), 'SHELF_TAG');
  });

  it('returns HTML for PRODUCT_STICKER template', async () => {
    const result = await generateLabelsHtmlAction({
      products: [{ productId: 'prod-1', quantity: 1 }],
      template: 'PRODUCT_STICKER',
    });

    expect(result).toEqual({
      success: true,
      data: {
        html: '<html>generated labels</html>',
        labelCount: 1,
      },
    });
    expect(renderLabelsHtmlMock).toHaveBeenCalledWith(expect.any(Array), 'PRODUCT_STICKER');
  });

  it('returns HTML for A4_SHEET template', async () => {
    const result = await generateLabelsHtmlAction({
      products: [{ productId: 'prod-1', quantity: 3 }],
      template: 'A4_SHEET',
    });

    expect(result).toEqual({
      success: true,
      data: {
        html: '<html>generated labels</html>',
        labelCount: 3,
      },
    });
    expect(renderLabelsHtmlMock).toHaveBeenCalledWith(expect.any(Array), 'A4_SHEET');
  });

  it('returns an error for empty product selection', async () => {
    const result = await generateLabelsHtmlAction({
      products: [],
      template: 'SHELF_TAG',
    });

    expect(result).toEqual({
      success: false,
      error: 'Select at least one product to generate labels.',
    });
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  it('returns an error for an invalid template', async () => {
    const result = await generateLabelsHtmlAction({
      products: [{ productId: 'prod-1', quantity: 1 }],
      template: 'INVALID_TEMPLATE' as never,
    });

    expect(result).toEqual({
      success: false,
      error: 'Choose a valid label template before generating labels.',
    });
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  it('returns an error when a product is not found in the business', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);

    const result = await generateLabelsHtmlAction({
      products: [{ productId: 'prod-1', quantity: 1 }],
      template: 'SHELF_TAG',
    });

    expect(result).toEqual({
      success: false,
      error: 'One or more selected products could not be loaded for label printing.',
    });
  });

  it('returns an error when exceeding the maximum number of products', async () => {
    const result = await generateLabelsHtmlAction({
      products: Array.from({ length: 201 }, (_, index) => ({
        productId: `prod-${index + 1}`,
        quantity: 1,
      })),
      template: 'SHELF_TAG',
    });

    expect(result).toEqual({
      success: false,
      error: 'You can print up to 200 products at a time.',
    });
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  it('correctly maps product data to label data with price, barcode format, category, unit, and currency', async () => {
    prismaMock.business.findUnique.mockResolvedValue({ currency: 'USD' });
    prismaMock.product.findMany.mockResolvedValue([
      makeProduct({
        id: 'prod-1',
        name: 'Golden Rice',
        barcode: '123456789012',
        sellingPriceBasePence: 12345,
        category: { name: 'Pantry' },
        productUnits: [{ unit: { name: 'Kilogram', symbol: 'kg' } }],
      }),
      makeProduct({
        id: 'prod-2',
        name: 'Printer Cleaner',
        barcode: 'SKU-ABC-123',
        sku: 'CLEAN-01',
        sellingPriceBasePence: 2500,
        category: { name: 'Supplies' },
        productUnits: [{ unit: { name: 'Bottle', symbol: null } }],
      }),
    ]);

    await generateLabelsHtmlAction({
      products: [
        { productId: 'prod-1', quantity: 2 },
        { productId: 'prod-2', quantity: 1 },
      ],
      template: 'SHELF_TAG',
    });

    expect(renderLabelsHtmlMock).toHaveBeenCalledWith(
      [
        {
          data: {
            productName: 'Golden Rice',
            price: 'USD 123.45',
            barcode: '123456789012',
            barcodeFormat: 'ean13',
            sku: 'SKU-001',
            unit: 'kg',
            category: 'Pantry',
            date: '2026-03-14',
            currency: 'USD',
          },
          quantity: 2,
        },
        {
          data: {
            productName: 'Printer Cleaner',
            price: 'USD 25.00',
            barcode: 'SKU-ABC-123',
            barcodeFormat: 'code128',
            sku: 'CLEAN-01',
            unit: 'Bottle',
            category: 'Supplies',
            date: '2026-03-14',
            currency: 'USD',
          },
          quantity: 1,
        },
      ],
      'SHELF_TAG',
    );
  });

  it('handles products without barcode, category, or SKU', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      makeProduct({
        id: 'prod-1',
        barcode: null,
        sku: null,
        category: null,
        productUnits: [],
      }),
    ]);

    await generateLabelsHtmlAction({
      products: [{ productId: 'prod-1', quantity: 1 }],
      template: 'PRODUCT_STICKER',
    });

    expect(renderLabelsHtmlMock).toHaveBeenCalledWith(
      [
        {
          data: {
            productName: 'Premium Rice',
            price: 'GHS 12.50',
            barcode: undefined,
            barcodeFormat: undefined,
            sku: undefined,
            unit: undefined,
            category: undefined,
            date: '2026-03-14',
            currency: 'GHS',
          },
          quantity: 1,
        },
      ],
      'PRODUCT_STICKER',
    );
  });

  it('clamps quantities to the supported range of 1 to 500', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      makeProduct({ id: 'prod-1' }),
      makeProduct({ id: 'prod-2', name: 'Bulk Sugar' }),
    ]);

    const result = await generateLabelsHtmlAction({
      products: [
        { productId: 'prod-1', quantity: 0 },
        { productId: 'prod-2', quantity: 999.7 },
      ],
      template: 'SHELF_TAG',
    });

    expect(renderLabelsHtmlMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({ quantity: 1 }),
        expect.objectContaining({ quantity: 500 }),
      ],
      'SHELF_TAG',
    );
    expect(result).toEqual({
      success: true,
      data: {
        html: '<html>generated labels</html>',
        labelCount: 501,
      },
    });
  });

  it('creates an audit log entry on success', async () => {
    await generateLabelsHtmlAction({
      products: [{ productId: 'prod-1', quantity: 3 }],
      template: 'SHELF_TAG',
    });

    expect(auditMock).toHaveBeenCalledWith({
      businessId: 'biz-1',
      userId: 'user-1',
      userName: 'Alice Manager',
      userRole: 'OWNER',
      action: 'LABEL_EXPORT',
      entity: 'Product',
      entityId: 'prod-1',
      details: {
        template: 'SHELF_TAG',
        productCount: 1,
        labelCount: 3,
      },
    });
  });
});
