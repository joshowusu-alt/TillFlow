import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('products loading skeleton measurement', () => {
  it('drops full-page product-card skeletons after first-paint loaders', () => {
    const list = read('app/(protected)/products/loading.tsx');
    const create = read('app/(protected)/products/new/loading.tsx');
    const compact = read('components/CompactRouteLoading.tsx');

    // Before: both files imported the full products route skeleton
    // (PageHeader + 3 StatChips + FilterBar + 6 ProductCards).
    const beforeCardPlaceholders = 6;
    const afterListCards = (list.match(/ProductCards|h-14 w-14/g) ?? []).length;
    const afterCreateCards = (create.match(/ProductCards|h-14 w-14/g) ?? []).length;

    expect(compact).toContain('ProductCards count={6}');
    expect(list).toContain('data-products-soft-refresh');
    expect(create).toContain('data-products-soft-refresh');
    expect(list).not.toMatch(/^import CompactRouteLoading/m);
    expect(create).not.toMatch(/^import CompactRouteLoading/m);
    expect(afterListCards).toBe(0);
    expect(afterCreateCards).toBe(0);
    expect(afterListCards).toBeLessThan(beforeCardPlaceholders);
    expect(afterCreateCards).toBeLessThan(beforeCardPlaceholders);
  });
});
