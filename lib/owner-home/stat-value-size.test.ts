import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getStatValueSize } from './stat-value-size';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('getStatValueSize', () => {
  it('sizes short values largest', () => {
    expect(getStatValueSize('GH₵0.00', true)).toBe('text-xl sm:text-2xl lg:text-2xl');
    expect(getStatValueSize('GH₵0.00', false)).toBe('text-base sm:text-lg lg:text-2xl');
  });

  it('shrinks medium-length values', () => {
    expect(getStatValueSize('GH₵12,345.00', true).length).toBeGreaterThan(0);
  });

  it('shrinks long values the most', () => {
    expect(getStatValueSize('GH₵1,234,567.00', true)).toBe('text-sm sm:text-sm lg:text-base');
  });
});

describe('regression: Home hero stats must not import a client-boundary function into a Server Component', () => {
  /**
   * Root cause of "Could not load today's figures" on every load: this
   * helper used to live in components/owner-home/home-chrome.tsx, which is
   * marked 'use client'. Every export of a 'use client' module becomes a
   * client reference — calling one directly from a Server Component (as
   * HomePerformanceSlot does, during render, not via JSX/props) throws
   * "<name> is not a function" in production builds. Keeping this pure
   * helper in a plain module (no 'use client') and asserting the import
   * site here prevents the bug from being silently reintroduced.
   */
  it('stat-value-size.ts is not a client module', () => {
    const source = read('lib/owner-home/stat-value-size.ts');
    expect(source.trimStart().startsWith("'use client'")).toBe(false);
  });

  it('HomePerformanceSlot imports getStatValueSize from the plain lib module, not home-chrome', () => {
    const source = read('components/owner-home/HomePerformanceSlot.tsx');
    expect(source).toContain("from '@/lib/owner-home/stat-value-size'");
    expect(source).not.toContain("getStatValueSize } from '@/components/owner-home/home-chrome'");
  });

  it('home-chrome.tsx no longer exports getStatValueSize (it is a use-client module)', () => {
    const source = read('components/owner-home/home-chrome.tsx');
    expect(source).not.toMatch(/export function getStatValueSize/);
  });
});
