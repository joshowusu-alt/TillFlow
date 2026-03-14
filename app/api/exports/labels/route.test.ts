import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, requireBusinessMock, renderLabelsHtmlMock, buildZplBatchMock } = vi.hoisted(() => ({
  prismaMock: {
    product: {
      findMany: vi.fn(),
    },
  },
  requireBusinessMock: vi.fn(),
  renderLabelsHtmlMock: vi.fn(),
  buildZplBatchMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth', () => ({ requireBusiness: requireBusinessMock }));
vi.mock('@/lib/labels/templates', () => ({ renderLabelsHtml: renderLabelsHtmlMock }));
vi.mock('@/lib/labels/zpl-builder', () => ({ buildZplBatch: buildZplBatchMock }));

import { detectBarcodeFormat } from '@/lib/labels/detect-barcode-format';
import { GET } from './route';

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
    id: 'cproduct0001',
    name: 'Shelf Item',
    barcode: '123456789012',
    sku: 'SKU-001',
    sellingPriceBasePence: 1099,
    category: { name: 'Groceries' },
    productUnits: [{ unit: { name: 'Piece', symbol: 'pc' } }],
    ...overrides,
  };
}

function makeRequest(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, value);
    }
  }

  return {
    nextUrl: new URL(`https://example.com/api/exports/labels?${searchParams.toString()}`),
  } as NextRequest;
}

describe('detectBarcodeFormat', () => {
  it('returns ean13 for a 13-digit barcode', () => {
    expect(detectBarcodeFormat('5901234123457')).toBe('ean13');
  });

  it('returns ean13 for a 12-digit barcode', () => {
    expect(detectBarcodeFormat('590123412345')).toBe('ean13');
  });

  it('returns code128 for an alphanumeric barcode', () => {
    expect(detectBarcodeFormat('SKU-123-ABC')).toBe('code128');
  });

  it('returns undefined for empty or null barcodes', () => {
    expect(detectBarcodeFormat('   ')).toBeUndefined();
    expect(detectBarcodeFormat(null)).toBeUndefined();
  });
});

describe('GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireBusinessMock.mockResolvedValue({
      business: {
        id: 'biz-1',
        currency: 'GHS',
      },
    });
    prismaMock.product.findMany.mockResolvedValue([makeProduct()]);
    renderLabelsHtmlMock.mockResolvedValue('<html>label export</html>');
    buildZplBatchMock.mockReturnValue('^XA^XZ');
  });

  it('returns 400 for missing productIds', async () => {
    const response = await GET(makeRequest({ template: 'SHELF_TAG' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'productIds is required.' });
  });

  it('returns 400 for invalid template', async () => {
    const response = await GET(
      makeRequest({
        productIds: 'cproduct0001',
        template: 'INVALID',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'template must be one of SHELF_TAG, PRODUCT_STICKER, or A4_SHEET.',
    });
  });

  it('returns 400 for invalid mode', async () => {
    const response = await GET(
      makeRequest({
        productIds: 'cproduct0001',
        template: 'SHELF_TAG',
        mode: 'pdf',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'mode must be either html or zpl.',
    });
  });

  it('returns 400 for too many products', async () => {
    const tooManyIds = Array.from({ length: 201 }, (_, index) => `cproduct${String(index).padStart(8, '0')}`).join(',');

    const response = await GET(
      makeRequest({
        productIds: tooManyIds,
        template: 'SHELF_TAG',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'A maximum of 200 products can be exported at once.',
    });
  });

  it('returns 400 for invalid product ID format', async () => {
    const response = await GET(
      makeRequest({
        productIds: 'not-a-valid-id',
        template: 'SHELF_TAG',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'productIds must contain valid UUID or cuid values only.',
    });
  });

  it('returns 400 for mismatched quantities length', async () => {
    const response = await GET(
      makeRequest({
        productIds: 'cproduct0001,cproduct0002',
        quantities: '2',
        template: 'SHELF_TAG',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'quantities must match the number of productIds.',
    });
  });

  it('returns HTML content type for mode=html', async () => {
    const response = await GET(
      makeRequest({
        productIds: 'cproduct0001',
        quantities: '2',
        template: 'SHELF_TAG',
        mode: 'html',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    await expect(response.text()).resolves.toBe('<html>label export</html>');
  });

  it('returns text/plain with attachment headers for mode=zpl', async () => {
    const response = await GET(
      makeRequest({
        productIds: 'cproduct0001',
        quantities: '2',
        template: 'PRODUCT_STICKER',
        mode: 'zpl',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="labels.zpl"');
    await expect(response.text()).resolves.toBe('^XA^XZ');
  });

  it('returns 400 when products are not found for the active business', async () => {
    prismaMock.product.findMany.mockResolvedValue([makeProduct({ id: 'cproduct0001' })]);

    const response = await GET(
      makeRequest({
        productIds: 'cproduct0001,cproduct0002',
        template: 'SHELF_TAG',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'One or more products were not found for the active business.',
    });
  });

  it('defaults quantities to 1 when not provided', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      makeProduct({ id: 'cproduct0001' }),
      makeProduct({ id: 'cproduct0002', name: 'Second Item', barcode: 'SKU-2' }),
    ]);

    await GET(
      makeRequest({
        productIds: 'cproduct0001,cproduct0002',
        template: 'SHELF_TAG',
      }),
    );

    expect(renderLabelsHtmlMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({ quantity: 1 }),
        expect.objectContaining({ quantity: 1 }),
      ],
      'SHELF_TAG',
    );
  });

  it('defaults mode to html when not provided', async () => {
    const response = await GET(
      makeRequest({
        productIds: 'cproduct0001',
        template: 'SHELF_TAG',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(renderLabelsHtmlMock).toHaveBeenCalledTimes(1);
    expect(buildZplBatchMock).not.toHaveBeenCalled();
  });
});
