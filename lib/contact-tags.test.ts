import { describe, expect, it } from 'vitest';
import { normalizeTagInput, parseTags, serializeTags } from './contact-tags';

describe('normalizeTagInput', () => {
  it('returns empty array for empty / null / whitespace input', () => {
    expect(normalizeTagInput('')).toEqual([]);
    expect(normalizeTagInput(null)).toEqual([]);
    expect(normalizeTagInput('   ')).toEqual([]);
  });

  it('splits on commas, semicolons, and newlines', () => {
    expect(normalizeTagInput('VIP, Net 30; Wholesale\nFruits')).toEqual([
      'VIP',
      'Net 30',
      'Wholesale',
      'Fruits',
    ]);
  });

  it('dedupes case-insensitively and preserves first-seen casing', () => {
    expect(normalizeTagInput('vip, VIP, Vip')).toEqual(['vip']);
  });

  it('drops blank entries and trims surrounding whitespace', () => {
    expect(normalizeTagInput('  VIP ,, , Net 30 ')).toEqual(['VIP', 'Net 30']);
  });

  it('clamps each tag to 30 characters', () => {
    const long = 'a'.repeat(50);
    expect(normalizeTagInput(long)).toEqual([long.slice(0, 30)]);
  });

  it('clamps the total list to 12 tags', () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`).join(',');
    expect(normalizeTagInput(many)).toHaveLength(12);
  });
});

describe('serializeTags / parseTags round-trip', () => {
  it('serializes an empty list as null so storage stays clean', () => {
    expect(serializeTags([])).toBeNull();
    expect(serializeTags(null)).toBeNull();
  });

  it('serializes and parses back to the same canonical list', () => {
    const tags = ['VIP', 'Net 30', 'Wholesale'];
    const json = serializeTags(tags);
    expect(json).not.toBeNull();
    expect(parseTags(json)).toEqual(tags);
  });

  it('parses garbage gracefully without throwing', () => {
    expect(parseTags('not-json-at-all')).toEqual([]);
    expect(parseTags('{"not":"an array"}')).toEqual([]);
    expect(parseTags(null)).toEqual([]);
  });

  it('strips non-string entries from a stored array', () => {
    expect(parseTags(JSON.stringify(['VIP', 7, null, 'Wholesale']))).toEqual(['VIP', 'Wholesale']);
  });
});
