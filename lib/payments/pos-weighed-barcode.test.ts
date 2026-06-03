import { describe, expect, it } from 'vitest';

import { parseWeighedBarcode } from './pos-weighed-barcode';

describe('parseWeighedBarcode', () => {
  it('parses a 13-digit variable-weight code', () => {
    expect(parseWeighedBarcode('2001230123456')).toEqual({
      prefix: '2001230',
      itemCode: '00123',
      weightGrams: 1234,
    });
  });

  it('rejects non-weighed codes', () => {
    expect(parseWeighedBarcode('6001234567891')).toBeNull();
    expect(parseWeighedBarcode('200123')).toBeNull();
  });
});
