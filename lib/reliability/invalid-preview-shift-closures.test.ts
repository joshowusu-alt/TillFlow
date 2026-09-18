import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  invalidLegacyCloseNote,
  invalidPreviewShiftClosureNote,
  isInvalidLegacyClose,
} from './invalid-preview-shift-closures';

describe('invalid legacy shift closures', () => {
  it('marks any closed shift whose counted cash is negative without using a record id', () => {
    const note = invalidLegacyCloseNote(-250);
    expect(note).toMatch(/Invalid close/i);
    expect(note).toMatch(/negative/i);
    expect(note).not.toMatch(/delete|rewrite/i);
    expect(isInvalidLegacyClose(-250)).toBe(true);
    expect(isInvalidLegacyClose(0)).toBe(false);
    expect(invalidPreviewShiftClosureNote('any-number', -250)).toBe(note);
  });

  it('leaves ordinary closures unmarked', () => {
    expect(invalidLegacyCloseNote(250)).toBeNull();
    expect(invalidLegacyCloseNote(null)).toBeNull();
  });

  it('does not hard-code a Preview closure number in product source', () => {
    const src = readFileSync(join(process.cwd(), 'lib/reliability/invalid-preview-shift-closures.ts'), 'utf8');
    expect(src).not.toMatch(/SHC-000007/);
    expect(src).not.toMatch(/INVALID_PREVIEW_SHIFT_CLOSURES/);
  });
});
