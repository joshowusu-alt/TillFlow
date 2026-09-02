/**
 * POS catalogue payload + in-memory index bench.
 *
 * Isolated synthetic tenants only. Never points at production.
 * Heavy sizes stay out of default CI — run manually.
 *
 * Usage:
 *   npx tsx scripts/perf/pos-catalogue-scale-bench.ts --sizes=1000 --iters=20
 *   npx tsx scripts/perf/pos-catalogue-scale-bench.ts --sizes=1000,10000 --iters=10
 *   npx tsx scripts/perf/pos-catalogue-scale-bench.ts --memory-only --sizes=1000
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import { buildPosProductIndex, findProductByExactBarcode, searchPosProductIndex } from '../../lib/pos/product-index';
import {
  jsonByteSize,
  toSellableProductDto,
  type SellableProductDto,
} from '../../lib/pos/sellable-dto';

const QA_TAG = 'POS_SCALE_CATALOGUE';
const NOW = new Date('2026-08-30T12:00:00.000Z');

type CurrentPosDto = SellableProductDto & {
  categoryId: string | null;
  imageUrl: string | null;
  units: Array<SellableProductDto['units'][number] & { defaultCostPence: number | null }>;
};

function id(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

function parseArgs(argv: string[]) {
  const get = (name: string, fallback: string) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  return {
    sizes: get('sizes', '1000')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
    iters: Math.max(1, Number(get('iters', '20')) || 20),
    memoryOnly: argv.includes('--memory-only'),
  };
}

function percentile(nums: number[], p: number): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * p) - 1));
  return s[idx]!;
}

function stats(nums: number[]) {
  if (nums.length === 0) return { min: null, p50: null, p95: null, max: null };
  return {
    min: Math.round(Math.min(...nums) * 100) / 100,
    p50: Math.round(percentile(nums, 0.5) * 100) / 100,
    p95: Math.round(percentile(nums, 0.95) * 100) / 100,
    max: Math.round(Math.max(...nums) * 100) / 100,
  };
}

function currentDtoFromSellable(product: SellableProductDto, index: number): CurrentPosDto {
  return {
    ...product,
    categoryId: `cat-${index % 12}`,
    imageUrl: `https://cdn.example.com/products/${product.id}/hero-1200.webp?w=800&q=75&sig=${product.id}`,
    units: product.units.map((unit) => ({ ...unit, defaultCostPence: 40 + (index % 30) })),
  };
}

function syntheticSellable(size: number): SellableProductDto[] {
  return Array.from({ length: size }, (_, i) => ({
    id: `syn_${i}`,
    name: i === Math.floor(size / 2) ? 'Coca Cola 330ml' : `Scale SKU ${String(i).padStart(6, '0')}`,
    sku: `SKU-${String(i).padStart(6, '0')}`,
    barcode: `${1000000000000 + i}`,
    sellingPriceBasePence: 100 + (i % 80) * 10,
    vatRateBps: i % 5 === 0 ? 1500 : 0,
    isTaxable: i % 5 === 0,
    promoBuyQty: 0,
    promoGetQty: 0,
    categoryName: i % 7 === 0 ? 'Beverages' : 'Grocery',
    units: [
      {
        id: `u_${i}`,
        name: 'ea',
        pluralName: 'ea',
        conversionToBase: 1,
        isBaseUnit: true,
        sellingPricePence: 100 + (i % 80) * 10,
      },
    ],
    onHandBase: i % 4 === 0 ? 0 : 5 + (i % 40),
  }));
}

function measureIndexAndSearch(products: SellableProductDto[], iters: number) {
  const buildTimes: number[] = [];
  let index = buildPosProductIndex(products);
  for (let i = 0; i < iters; i++) {
    const t = performance.now();
    index = buildPosProductIndex(products);
    buildTimes.push(performance.now() - t);
  }

  const mid = products[Math.floor(products.length / 2)]!;
  const searchTimes: number[] = [];
  const barcodeTimes: number[] = [];
  for (let i = 0; i < iters; i++) {
    const ts = performance.now();
    searchPosProductIndex(index, 'coca cola', 12);
    searchTimes.push(performance.now() - ts);

    const tb = performance.now();
    findProductByExactBarcode(index, mid.barcode ?? '');
    barcodeTimes.push(performance.now() - tb);
  }

  const found = findProductByExactBarcode(index, mid.barcode ?? '');
  const named = searchPosProductIndex(index, 'coca cola', 8);

  return {
    indexBuildMs: stats(buildTimes),
    searchMs: stats(searchTimes),
    barcodeLookupMs: stats(barcodeTimes),
    barcodeHit: found?.id === mid.id,
    nameHit: named.some((p) => p.id === mid.id),
  };
}

function memoryReport(size: number, iters: number) {
  const sellable = syntheticSellable(size);
  const current = sellable.map(currentDtoFromSellable);
  const heapBefore = process.memoryUsage().heapUsed;
  const timings = measureIndexAndSearch(sellable, iters);
  const heapAfter = process.memoryUsage().heapUsed;
  return {
    source: 'in-memory-synthetic',
    productCount: size,
    sellableJsonBytes: jsonByteSize(sellable),
    currentJsonBytes: jsonByteSize(current),
    jsonReductionPct: Math.round((1 - jsonByteSize(sellable) / jsonByteSize(current)) * 1000) / 10,
    heapDeltaBytes: heapAfter - heapBefore,
    ...timings,
  };
}

async function deleteScaleTenant(prisma: PrismaClient, email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { businessId: true },
  });
  if (!user) return;
  const businessId = user.businessId;
  await prisma.inventoryBalance.deleteMany({ where: { store: { businessId } } });
  await prisma.productUnit.deleteMany({ where: { product: { businessId } } });
  await prisma.product.deleteMany({ where: { businessId } });
  await prisma.till.deleteMany({ where: { store: { businessId } } });
  await prisma.store.deleteMany({ where: { businessId } });
  await prisma.session.deleteMany({ where: { user: { businessId } } });
  await prisma.user.deleteMany({ where: { businessId } });
  await prisma.business.delete({ where: { id: businessId } });
}

async function ensureUnit(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.unit.findFirst({ select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.unit.create({
    data: { name: 'Each', pluralName: 'Each', symbol: 'ea', qaTag: QA_TAG },
  });
  return created.id;
}

async function seedSqlite(prisma: PrismaClient, size: number) {
  const ownerEmail = `pos.scale.bench.${size}@tillflow-test.invalid`;
  await deleteScaleTenant(prisma, ownerEmail);

  const business = await prisma.business.create({
    data: {
      name: `POS Scale Bench ${size}`,
      currency: 'GHS',
      plan: 'GROWTH',
      selectedPlan: 'GROWTH',
      subscriptionStatus: 'TRIAL_ACTIVE',
      trialStartedAt: NOW,
      trialEndsAt: new Date(NOW.getTime() + 14 * 86400000),
      businessCategory: 'SUPERMARKET',
      onboardingCompletedAt: NOW,
      timezone: 'Africa/Accra',
    },
  });
  const store = await prisma.store.create({
    data: { businessId: business.id, name: 'Branch A', isMainStore: true },
  });
  await prisma.user.create({
    data: {
      businessId: business.id,
      email: ownerEmail,
      name: `POS Scale Owner ${size}`,
      role: 'OWNER',
      active: true,
      passwordHash: 'unused-bench-hash',
      qaTag: QA_TAG,
    },
  });

  const unitId = await ensureUnit(prisma);
  const BATCH = 250;
  for (let start = 0; start < size; start += BATCH) {
    const end = Math.min(size, start + BATCH);
    const products = [];
    const units = [];
    const balances = [];
    for (let i = start; i < end; i++) {
      const productId = id('pp');
      const barcode = createHash('sha1').update(`pos:${size}:${i}`).digest('hex').slice(0, 13);
      products.push({
        id: productId,
        businessId: business.id,
        name: i === Math.floor(size / 2) ? 'Coca Cola 330ml' : `POS Scale SKU ${String(i).padStart(6, '0')}`,
        sku: `POS-${size}-${String(i).padStart(6, '0')}`,
        barcode,
        active: true,
        sellingPriceBasePence: 100 + (i % 80) * 10,
        defaultCostBasePence: 40,
        isTaxable: i % 5 === 0,
        vatRateBps: i % 5 === 0 ? 1500 : 0,
        imageUrl: `https://cdn.example.com/products/${productId}/hero-1200.webp?w=800&q=75`,
        createdAt: NOW,
        updatedAt: NOW,
        qaTag: QA_TAG,
      });
      units.push({
        id: id('pu'),
        productId,
        unitId,
        isBaseUnit: true,
        conversionToBase: 1,
        sellingPricePence: 100 + (i % 80) * 10,
        defaultCostPence: 40,
        qaTag: QA_TAG,
      });
      balances.push({
        id: id('ib'),
        storeId: store.id,
        productId,
        qtyOnHandBase: 5 + (i % 20),
        avgCostBasePence: 40,
        qaTag: QA_TAG,
      });
    }
    await prisma.product.createMany({ data: products });
    await prisma.productUnit.createMany({ data: units });
    await prisma.inventoryBalance.createMany({ data: balances });
  }

  return { businessId: business.id, storeId: store.id, ownerEmail };
}

async function measureSqlite(prisma: PrismaClient, size: number, iters: number) {
  const seeded = await seedSqlite(prisma, size);
  const inventory = await prisma.inventoryBalance.findMany({
    where: { storeId: seeded.storeId },
    select: { productId: true, qtyOnHandBase: true },
  });
  const inventoryMap = new Map(inventory.map((row) => [row.productId, row.qtyOnHandBase]));

  const tFull = performance.now();
  const fullRows = await prisma.product.findMany({
    where: { businessId: seeded.businessId, active: true },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      sellingPriceBasePence: true,
      vatRateBps: true,
      isTaxable: true,
      promoBuyQty: true,
      promoGetQty: true,
      categoryId: true,
      imageUrl: true,
      category: { select: { name: true } },
      productUnits: {
        select: {
          unitId: true,
          conversionToBase: true,
          isBaseUnit: true,
          sellingPricePence: true,
          defaultCostPence: true,
          unit: { select: { name: true, pluralName: true } },
        },
      },
    },
  });
  const fullQueryMs = performance.now() - tFull;

  const tSellable = performance.now();
  const sellableRows = await prisma.product.findMany({
    where: { businessId: seeded.businessId, active: true },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      sellingPriceBasePence: true,
      vatRateBps: true,
      isTaxable: true,
      promoBuyQty: true,
      promoGetQty: true,
      category: { select: { name: true } },
      productUnits: {
        select: {
          unitId: true,
          conversionToBase: true,
          isBaseUnit: true,
          sellingPricePence: true,
          unit: { select: { name: true, pluralName: true } },
        },
      },
    },
  });
  const sellableQueryMs = performance.now() - tSellable;

  const sellable = sellableRows.map((row) => toSellableProductDto(row, inventoryMap.get(row.id) ?? 0));
  const current = fullRows.map((row) => ({
    ...toSellableProductDto(
      {
        ...row,
        productUnits: row.productUnits.map((pu) => ({
          unitId: pu.unitId,
          conversionToBase: pu.conversionToBase,
          isBaseUnit: pu.isBaseUnit,
          sellingPricePence: pu.sellingPricePence,
          unit: pu.unit,
        })),
      },
      inventoryMap.get(row.id) ?? 0
    ),
    categoryId: row.categoryId,
    imageUrl: row.imageUrl,
    units: row.productUnits.map((pu) => ({
      id: pu.unitId,
      name: pu.unit.name,
      pluralName: pu.unit.pluralName,
      conversionToBase: pu.conversionToBase,
      isBaseUnit: pu.isBaseUnit,
      sellingPricePence: pu.sellingPricePence,
      defaultCostPence: pu.defaultCostPence,
    })),
  }));

  const timings = measureIndexAndSearch(sellable, iters);
  await deleteScaleTenant(prisma, seeded.ownerEmail);

  return {
    source: 'local-sqlite',
    productCount: sellable.length,
    sellableJsonBytes: jsonByteSize(sellable),
    currentJsonBytes: jsonByteSize(current),
    jsonReductionPct: Math.round((1 - jsonByteSize(sellable) / jsonByteSize(current)) * 1000) / 10,
    fullSelectQueryMs: Math.round(fullQueryMs),
    sellableSelectQueryMs: Math.round(sellableQueryMs),
    ...timings,
  };
}

function markdownTable(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '_No measurements._\n';
  const keys = [
    'size',
    'source',
    'productCount',
    'sellableJsonBytes',
    'currentJsonBytes',
    'jsonReductionPct',
    'indexBuildP50Ms',
    'indexBuildP95Ms',
    'searchP50Ms',
    'searchP95Ms',
    'barcodeP50Ms',
    'barcodeP95Ms',
  ];
  const header = `| ${keys.join(' | ')} |`;
  const sep = `| ${keys.map(() => '---').join(' | ')} |`;
  const body = rows
    .map((row) => `| ${keys.map((key) => String(row[key] ?? '')).join(' | ')} |`)
    .join('\n');
  return `${header}\n${sep}\n${body}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync('tmp', { recursive: true });
  const results: Array<Record<string, unknown>> = [];
  let sqliteError: string | null = null;

  for (const size of args.sizes) {
    const memory = memoryReport(size, args.iters);
    results.push({
      size,
      ...memory,
      indexBuildP50Ms: memory.indexBuildMs.p50,
      indexBuildP95Ms: memory.indexBuildMs.p95,
      searchP50Ms: memory.searchMs.p50,
      searchP95Ms: memory.searchMs.p95,
      barcodeP50Ms: memory.barcodeLookupMs.p50,
      barcodeP95Ms: memory.barcodeLookupMs.p95,
    });
    console.log(JSON.stringify({ size, memory }, null, 2));
  }

  if (!args.memoryOnly) {
    const prisma = new PrismaClient();
    try {
      for (const size of args.sizes) {
        if (size > 10000) {
          console.log(`Skipping SQLite seed for size ${size} (optional; run only if memory allows).`);
          continue;
        }
        const sqlite = await measureSqlite(prisma, size, args.iters);
        results.push({
          size,
          ...sqlite,
          indexBuildP50Ms: sqlite.indexBuildMs.p50,
          indexBuildP95Ms: sqlite.indexBuildMs.p95,
          searchP50Ms: sqlite.searchMs.p50,
          searchP95Ms: sqlite.searchMs.p95,
          barcodeP50Ms: sqlite.barcodeLookupMs.p50,
          barcodeP95Ms: sqlite.barcodeLookupMs.p95,
        });
        console.log(JSON.stringify({ size, sqlite }, null, 2));
      }
    } catch (error) {
      sqliteError = error instanceof Error ? error.message : String(error);
      console.error('SQLite bench failed:', sqliteError);
    } finally {
      await prisma.$disconnect();
    }
  }

  const generatedAt = new Date().toISOString();
  const sqliteNote = sqliteError
    ? ['', `SQLite seed/query was **not completed**: ${sqliteError.replace(/`/g, "'")}`, ''].join('\n')
    : '';
  const envLabel = args.memoryOnly
    ? 'local process (memory-only; SQLite seed skipped)'
    : 'local process (in-memory + optional SQLite)';
  const md = [
    '# POS catalogue baseline',
    '',
    `Generated: ${generatedAt}`,
    '',
    `Environment: ${envLabel}.`,
    'These timings are **not** Ghana-network or hosted-Postgres evidence. Do **not** claim 10k/50k POS readiness from this file.',
    '',
    '## Measurements',
    '',
    markdownTable(results).trimEnd(),
    sqliteNote,
    '',
    '## Payload notes',
    '',
    '- **Current DTO** includes imageUrl, categoryId, and defaultCostPence (the previous PosBoard hydrate shape).',
    '- **Sellable DTO** is checkout-only: id, name, sku, barcode, price, unit, onHand, tax/promo flags. No images.',
    '- JSON byte sizes are UTF-8 JSON.stringify of the full array.',
    '',
    '## Follow-up',
    '',
    '- 10k / 50k remain unproven on this checkout path. Server search + paged mode exist; measure hosted Postgres before claiming readiness.',
    '- Incremental IDB merge on updatedSince is documented in POS_OFFLINE_CATALOGUE_SCOPE.md.',
    '',
  ].join('\n');
  writeFileSync('docs/reliability/POS_CATALOGUE_BASELINE.md', md);
  const jsonOut = `tmp/pos-catalogue-scale-bench-${Date.now()}.json`;
  writeFileSync(jsonOut, JSON.stringify({ generatedAt, args, sqliteError, results }, null, 2));
  console.log(`Wrote docs/reliability/POS_CATALOGUE_BASELINE.md and ${jsonOut}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
