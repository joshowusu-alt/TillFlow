import { describe, expect, it } from 'vitest';
import { displayDocumentNumber } from '@/lib/reliability/walkthrough-contracts';
import { formatRecordNumber } from './document-label';

describe('formatRecordNumber', () => {
  it('wraps displayDocumentNumber and never substitutes the primary key', () => {
    expect(formatRecordNumber('purchase', 'PUR-000012', 'clxyzab12cd')).toBe('PUR-000012');
    expect(formatRecordNumber('purchase', null, 'clxyzab12cd')).toBe('PUR-••••ab12cd');
    expect(formatRecordNumber('stock_adjustment', undefined, 'adj-99ffaa')).toBe(
      displayDocumentNumber('stock_adjustment', undefined, 'adj-99ffaa'),
    );
    expect(formatRecordNumber('purchase', null, 'clxyzab12cd')).not.toBe('clxyzab12cd');
  });
});
