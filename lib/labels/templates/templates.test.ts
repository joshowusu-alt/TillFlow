import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../barcode-generator', () => ({
  generateBarcodeDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,TEST_BARCODE'),
}));

import { renderA4Sheet, renderLabelsHtml, renderProductSticker, renderShelfTag } from './index';

const baseLabel = {
  productName: 'Premium Jasmine Rice 5kg',
  price: 'GHS 12.50',
  unit: 'piece',
  barcode: '123456789012',
  barcodeFormat: 'ean13' as const,
  category: 'Groceries',
  date: '2026-03-14',
  sku: '1234',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('renderShelfTag', () => {
  it('renders valid HTML with product name', async () => {
    const html = await renderShelfTag(baseLabel);

    expect(html).toContain('<article');
    expect(html).toContain('Premium Jasmine Rice 5kg');
  });

  it('includes barcode image when barcode provided', async () => {
    const html = await renderShelfTag(baseLabel);

    expect(html).toContain('src="data:image/png;base64,TEST_BARCODE"');
    expect(html).toContain('alt="Barcode for Premium Jasmine Rice 5kg"');
  });

  it('shows price and unit', async () => {
    const html = await renderShelfTag(baseLabel);

    expect(html).toContain('GHS 12.50');
    expect(html).toContain('/piece');
  });

  it('handles missing barcode gracefully', async () => {
    const html = await renderShelfTag({
      productName: 'Plantain Chips',
      price: 'GHS 4.00',
      unit: 'bag',
    });

    expect(html).not.toContain('<img');
    expect(html).toContain('Plantain Chips');
    expect(html).toContain('GHS 4.00');
  });
});

describe('renderProductSticker', () => {
  it('includes category', async () => {
    const html = await renderProductSticker(baseLabel);

    expect(html).toContain('Groceries');
  });

  it('includes date and SKU', async () => {
    const html = await renderProductSticker(baseLabel);

    expect(html).toContain('2026-03-14');
    expect(html).toContain('SKU: 1234');
  });
});

describe('renderA4Sheet', () => {
  it('renders correct number of labels for partial pages', async () => {
    const html = await renderA4Sheet(
      Array.from({ length: 5 }, (_, index) => ({
        ...baseLabel,
        productName: `Item ${index + 1}`,
      })),
    );

    expect(html.match(/data-template="shelf-tag"/g)).toHaveLength(5);
  });

  it('handles empty array', async () => {
    const html = await renderA4Sheet([]);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html.match(/data-template="shelf-tag"/g)).toBeNull();
    expect(html).toContain('data-sheet-cell="empty"');
  });
});

describe('renderLabelsHtml', () => {
  it('dispatches to correct template', async () => {
    const shelfHtml = await renderLabelsHtml([{ data: baseLabel, quantity: 1 }], 'SHELF_TAG');
    const stickerHtml = await renderLabelsHtml([{ data: baseLabel, quantity: 1 }], 'PRODUCT_STICKER');
    const sheetHtml = await renderLabelsHtml([{ data: baseLabel, quantity: 1 }], 'A4_SHEET');

    expect(shelfHtml).toContain('data-template="shelf-tag"');
    expect(stickerHtml).toContain('data-template="product-sticker"');
    expect(sheetHtml).toContain('<!DOCTYPE html>');
    expect(sheetHtml).toContain('data-template="shelf-tag"');
  });

  it('expands quantities correctly', async () => {
    const html = await renderLabelsHtml(
      [
        { data: { ...baseLabel, productName: 'Item A' }, quantity: 2 },
        { data: { ...baseLabel, productName: 'Item B' }, quantity: 3 },
      ],
      'SHELF_TAG',
    );

    expect(html.match(/data-template="shelf-tag"/g)).toHaveLength(5);
    expect(html).toContain('Item A');
    expect(html).toContain('Item B');
  });
});
