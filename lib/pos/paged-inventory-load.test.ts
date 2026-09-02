import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

function extractPagedBranch(posBoard: string): string {
  const marker = "if (catalogueMode === 'paged')";
  const start = posBoard.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const afterIf = posBoard.slice(start + marker.length);
  const braceStart = afterIf.indexOf('{');
  expect(braceStart).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = braceStart; i < afterIf.length; i++) {
    if (afterIf[i] === '{') depth += 1;
    else if (afterIf[i] === '}') {
      depth -= 1;
      if (depth === 0) return afterIf.slice(0, i + 1);
    }
  }
  throw new Error('Could not extract PosBoard paged branch');
}

describe('P15 paged POS does not load all inventory', () => {
  const posBoard = read('app/(protected)/pos/PosBoard.tsx');
  const searchSrc = read('app/api/pos/search/route.ts');
  const barcodeSrc = read('app/api/pos/barcode/route.ts');
  const cacheDataSrc = read('app/api/offline/cache-data/route.ts');
  const posClientSrc = read('app/(protected)/pos/PosClient.tsx');

  it('resolves catalogueMode before any inventory fetch and skips getCachedInventory when paged', () => {
    const boardFn = posBoard.slice(posBoard.indexOf('export default async function PosBoard'));
    const modeIdx = boardFn.indexOf('resolvePosCatalogueMode(');
    const pagedIdx = boardFn.indexOf("if (catalogueMode === 'paged')");
    const inventoryCallIdx = boardFn.indexOf('getCachedInventory(business.id, baseStore.id)');

    expect(modeIdx).toBeGreaterThan(-1);
    expect(pagedIdx).toBeGreaterThan(modeIdx);
    expect(inventoryCallIdx).toBeGreaterThan(pagedIdx);

    const pagedBranch = extractPagedBranch(boardFn);
    expect(pagedBranch).not.toContain('getCachedInventory');
    expect(pagedBranch).not.toContain('inventoryBalance.findMany');
    expect(pagedBranch).toContain('inventory: []');
    expect(pagedBranch).toContain('products: []');
  });

  it('keeps local-mode inventory load behind the paged return', () => {
    expect(posBoard).toContain('getCachedInventory(business.id, baseStore.id)');
    expect(posBoard).toContain('getCachedProducts(business.id)');
    const elseIdx = posBoard.indexOf("if (catalogueMode === 'paged')");
    const localLoad = posBoard.slice(elseIdx);
    expect(localLoad).toMatch(/Promise\.all\(\s*\[/);
    expect(localLoad).toContain('getCachedInventory(business.id, baseStore.id)');
  });

  it('search and barcode join InventoryBalance only for matched product ids', () => {
    expect(searchSrc).toContain('productId: { in: products.map((p) => p.id) }');
    expect(barcodeSrc).toContain('productId: { in: rows.map((p) => p.id) }');
    expect(searchSrc).toContain('businessId: user.businessId');
    expect(barcodeSrc).toContain('businessId: user.businessId');
    for (const src of [searchSrc, barcodeSrc]) {
      const blocks = [...src.matchAll(/inventoryBalance\.findMany\(\{[\s\S]*?\n      \}\)/g)].map((m) => m[0]);
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block).toMatch(/productId:\s*\{\s*in:/);
      }
    }
  });

  it('offline cache-data caps the snapshot and does not load unbounded store inventory', () => {
    expect(cacheDataSrc).toContain('take: POS_OFFLINE_CATALOGUE_MAX');
    expect(cacheDataSrc).toContain('productId: { in: snapshotProductIds }');
    expect(cacheDataSrc).toContain('offlineCatalogueTruncated');
    expect(cacheDataSrc).not.toMatch(
      /inventoryBalance\.findMany\(\s*\{\s*where:\s*\{\s*storeId:\s*store\.id\s*\}/
    );
    expect(cacheDataSrc).toContain('@@unique([storeId, productId])');
  });

  it('PosClient surfaces the honest offline 5,000-SKU limit copy', () => {
    expect(posClientSrc).toContain('POS_OFFLINE_CATALOGUE_LIMIT_MESSAGE');
    expect(posClientSrc).toContain('showOfflineCatalogueLimit');
  });
});
