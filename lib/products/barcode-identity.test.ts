import { describe, expect, it, vi } from 'vitest';
import { aliasCodes, assertAvailableBarcodes, productDisplayName } from './barcode-identity';
import { buildPosProductIndex } from '@/lib/pos/product-index';
import { resolveBarcodeScan } from '@/lib/payments/pos-barcode';

describe('publisher versions and barcode aliases', () => {
  it('keeps the title and disambiguates publisher versions at the point of selection', () => {
    expect(productDisplayName({ name: 'Book A', publisher: 'Publisher X', edition: 'Paperback' })).toBe('Book A · Publisher X · Paperback');
  });
  it('resolves primary and alternate codes to the right independent stock item', () => {
    const products = ['X', 'Y'].map((id, index) => ({ id, name: 'Book A', barcode: `001234${index}`, additionalBarcodes: [`ALT-${id}`], units: [{ id: 'each', isBaseUnit: true }] }));
    const index = buildPosProductIndex(products);
    expect(resolveBarcodeScan('ALT-X', products, index)).toMatchObject({ kind: 'matched', product: { id: 'X' } });
    expect(resolveBarcodeScan('0012341', products, index)).toMatchObject({ kind: 'matched', product: { id: 'Y' } });
  });
  it('deduplicates aliases without changing strings or primary identity', () => {
    expect(aliasCodes({ barcode: '00123', additionalBarcodes: ['00123', ' 00456 ', '00456', ''] })).toEqual(['00456']);
  });
  it('checks collisions only inside the requesting business, including aliases', async () => {
    const db = { product: { findFirst: vi.fn().mockResolvedValue(null) } };
    await assertAvailableBarcodes(db, 'shop-b', { barcode: '00123', additionalBarcodes: ['ALT'] });
    expect(db.product.findFirst.mock.calls[0][0].where).toMatchObject({ businessId: 'shop-b', OR: [{ barcode: { in: ['00123', 'ALT'] } }, { barcodes: { some: { code: { in: ['00123', 'ALT'] } } } }] });
    db.product.findFirst.mockResolvedValue({ id: 'another-product' } as never);
    await expect(assertAvailableBarcodes(db, 'shop-b', { barcode: '00123' })).rejects.toThrow('already assigned');
  });
});
