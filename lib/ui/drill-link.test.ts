import { describe, expect, it } from 'vitest';
import { buildDrillHref } from './drill-link';

describe('buildDrillHref', () => {
  it('preserves current search params on a drill destination', () => {
    expect(buildDrillHref('/purchases/abc', 'q=rice&page=2', { highlight: 'remaining' })).toBe(
      '/purchases/abc?q=rice&page=2&highlight=remaining',
    );
    expect(buildDrillHref('/expenses/1', new URLSearchParams('tab=unpaid'))).toBe('/expenses/1?tab=unpaid');
  });
});
