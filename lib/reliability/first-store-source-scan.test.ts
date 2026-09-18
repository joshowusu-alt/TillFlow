import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const SKIP_DIR = new Set([
  'node_modules',
  '.git',
  '.next',
  'tmp',
  'prisma/tmp',
  'coverage',
  'tishgroup-control',
]);

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(root, full).replace(/\\/g, '/');
    if (SKIP_DIR.has(name) || SKIP_DIR.has(rel.split('/')[0])) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(name)) continue;
    if (/\.test\.(ts|tsx)$/.test(name)) continue;
    files.push(rel);
  }
  return files;
}

const CLASSIFICATION: Record<string, { class: string; why: string }> = {
  'lib/reliability/selected-store.ts': {
    class: 'SOLE_STORE_OK',
    why: 'resolveSoleOrSelectedStoreId uses stores[0] only when length === 1',
  },
  'lib/services/customers.ts': {
    class: 'SOLE_STORE_OK',
    why: 'quickCreateCustomer uses stores[0] only when length === 1 after proving uniqueness',
  },
  'lib/services/online-orders.ts': {
    class: 'SOLE_STORE_OK',
    why: 'public checkout uses stores[0] only when length === 1',
  },
  'app/(protected)/reports/owner/page.tsx': {
    class: 'REPORTING_LABEL',
    why: 'label uses stores[0] only when stores.length <= 1; multi-store says All branches',
  },
  'lib/auth.ts': {
    class: 'COMPAT_EXPORT',
    why: 'getFirstStore remains exported and is not used by protected layout or mutations',
  },
  'prisma/seed.ts': {
    class: 'SEED_ONLY',
    why: 'seed/demo setup, not a merchant mutation path',
  },
  'app/api/seed-once/route.ts': {
    class: 'SEED_ONLY',
    why: 'one-time seed route',
  },
  'lib/demo-sandbox/seed.ts': {
    class: 'SEED_ONLY',
    why: 'demo sandbox seed prefers isMainStore then first',
  },
  'app/shop/[slug]/StorefrontClient.tsx': {
    class: 'PUBLIC_STOREFRONT',
    why: 'public shop picker default, not POS operational mutations',
  },
  'app/(protected)/exports/inventory/route.ts': {
    class: 'EXPORT_FIND_FIRST',
    why: 'legacy inventory export still uses findFirst; not a write mutation',
  },
  'lib/reliability/operational-store.ts': {
    class: 'DOCUMENTATION_GUARD',
    why: 'comment only: Never selects stores[0] among many',
  },
};

describe('first-store source scan', () => {
  it('customers and transfers do not silently use stores[0] among many', () => {
    const customers = read('app/(protected)/customers/page.tsx');
    const transfers = read('app/(protected)/transfers/page.tsx');
    expect(customers).toContain('requireBusinessAndOptionalStore');
    expect(customers).not.toContain('stores[0]');
    expect(customers).not.toContain('<option value="">All branches</option>');
    expect(customers).toContain('name="storeId"');
    expect(transfers).toContain('requireBusinessAndOptionalStore');
    expect(transfers).toContain('defaultFromStoreId = store.id');
    expect(transfers).not.toContain('stores[0]');
    expect(read('app/actions/customers.ts')).toContain('requireSelectedStoreContext');
    expect(read('app/actions/transfers.ts')).toContain('requireSelectedStoreContext');
  });

  it('classifies every remaining stores[0] / first-store expression', () => {
    const files = [
      ...walk(join(root, 'app')),
      ...walk(join(root, 'lib')),
      ...walk(join(root, 'components')),
      ...walk(join(root, 'prisma')),
    ];
    const hits: { file: string; class: string; snippet: string }[] = [];
    for (const file of files) {
      const src = read(file);
      if (
        !src.includes('stores[0]') &&
        !src.includes('stores.at(0)') &&
        !src.includes('getFirstStore') &&
        !src.includes('withBusinessStoreContext')
      ) {
        continue;
      }
      const classified = CLASSIFICATION[file];
      hits.push({
        file,
        class: classified?.class ?? 'UNCLASSIFIED',
        snippet: classified?.why ?? 'needs classification',
      });
    }

    const unclassified = hits.filter((hit) => hit.class === 'UNCLASSIFIED');
    expect(unclassified, JSON.stringify(unclassified, null, 2)).toEqual([]);
    expect(hits.every((hit) => hit.class !== 'FORBIDDEN_MUTATION_FALLBACK')).toBe(true);
    expect(hits.some((hit) => hit.file === 'lib/reliability/selected-store.ts')).toBe(true);
    expect(read('app/(protected)/customers/page.tsx')).not.toContain('stores[0]');
    expect(read('app/(protected)/transfers/page.tsx')).not.toContain('stores[0]');
    expect(read('app/(protected)/layout.tsx')).not.toContain('getFirstStore');
  });
});
