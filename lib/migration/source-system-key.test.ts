import { describe, expect, it } from 'vitest';
import { normaliseSourceSystemKey } from '@/lib/migration/source-system-key';

describe('sourceSystemKey', () => {
  it('normalises case and accepts valid keys', () => {
    expect(normaliseSourceSystemKey('Legacy-Export_1')).toBe('legacy-export_1');
  });

  it('rejects absent or invalid keys', () => {
    expect(() => normaliseSourceSystemKey('')).toThrow(/required/i);
    expect(() => normaliseSourceSystemKey('-bad')).toThrow(/must be 2–63/i);
    expect(() => normaliseSourceSystemKey('a')).toThrow(/must be 2–63/i);
    expect(() => normaliseSourceSystemKey('has space')).toThrow(/must be 2–63/i);
  });
});
