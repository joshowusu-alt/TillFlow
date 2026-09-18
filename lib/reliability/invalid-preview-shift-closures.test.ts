import { describe, expect, it } from 'vitest';
import { invalidPreviewShiftClosureNote } from './invalid-preview-shift-closures';

describe('invalid Preview shift closures', () => {
  it('marks SHC-000007 without rewriting the record', () => {
    const note = invalidPreviewShiftClosureNote('SHC-000007');
    expect(note).toMatch(/Invalid legacy Preview test data/i);
    expect(note).toMatch(/-2\.50|GH₵-2.50/i);
    expect(note).not.toMatch(/delete|rewrite/i);
  });

  it('leaves ordinary closures unmarked', () => {
    expect(invalidPreviewShiftClosureNote('SHC-000008')).toBeNull();
  });
});
