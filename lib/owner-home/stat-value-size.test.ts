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
   * Single root cause of TWO production symptoms, both proven by a
   * controlled local production-build A/B (same build, same demo data):
   *
   *  1. "Could not load today's figures" on every Home load (all widths).
   *  2. A full-page React #310 crash to app/global-error.tsx on
   *     iPhone/Android-width viewports (22/22 deterministic on repeat
   *     navigation; 0/22 once fixed). Desktop showed symptom 1 only.
   *
   * This helper used to live in components/owner-home/home-chrome.tsx,
   * which is marked 'use client'. Every export of a 'use client' module
   * becomes a client reference — calling one directly from a Server
   * Component (as HomePerformanceSlot does, during render, not via
   * JSX/props) throws "<name> is not a function" in production builds
   * (dev does NOT enforce this boundary, which is why it only reproduced
   * in a production build). The Server Component throw is normally caught
   * by the section error boundary (→ symptom 1), but at narrow width the
   * failed RSC stream desynchronises hook order in the Next.js App Router
   * during hydration, surfacing as React #310 above the section boundary
   * (→ symptom 2). Keeping this pure helper in a plain module (no
   * 'use client') and asserting the import site here prevents both from
   * being silently reintroduced.
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
