/**
 * Deterministic large-catalogue fixtures + correctness/performance bench.
 *
 * Isolated synthetic tenants only. Never points at production.
 * Heavy: keep out of default CI — run manually / nightly.
 *
 * Usage:
 *   npx tsx scripts/perf/catalogue-scale-bench.ts --sizes=1000 --iters=5
 *   npx tsx scripts/perf/catalogue-scale-bench.ts --sizes=1000,10000 --iters=5
 *   npx tsx scripts/perf/catalogue-scale-bench.ts --sizes=50000 --iters=3
 *
 * Dataset proportions (primary tenant size N) — see bucketForIndex().
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { classifyNoBalanceProduct } from '../../lib/improve-records-classify';
import { UNUSED_CATALOGUE_AGE_DAYS } from '../../lib/improve-records-constants';
import {
  countStockGapSignals,
  getStockGapIssueProductWhere,
} from '../../lib/improve-records-load';

const prisma = new PrismaClient();
const QA_TAG = 'SCALE_CATALOGUE';
const NOW = new Date('2026-07-15T12:00:00.000Z');
const AGED = new Date('2026-01-01T00:00:00.000Z');
const RECENT = new Date('2026-07-10T00:00:00.000Z');
const PASSWORD = 'ScaleBench99!';

type Bucket =
  | 'inactive'
  | 'zero_price'
  | 'balanced_positive'
  | 'balanced_zero'
  | 'unused'
  | 'genuine_recent'
  | 'genuine_sold'
  | 'excluded_purchase'
  | 'excluded_movement'
  | 'void_sale_unused'
  | 'returned_sale_unused'
  | 'healthy_multi';

type SeedMeta = {
  size: number;
  businessId: string;
  otherBusinessId: string;
  ownerEmail: string;
  storeIds: string[];
  expectedUnusedIds: string[];
  expectedGenuineIds: string[];
  expectedUnusedCount: number;
  expectedGenuineCount: number;
  bucketCounts: Record<Bucket, number>;
  historyCounts: {
    balances: number;
    movements: number;
    purchaseLines: number;
    saleLines: number;
    sales: number;
  };
};

function id(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

function parseArgs(argv: string[]) {
  const get = (name: string, fallback: string) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  const has = (name: string) => argv.includes(`--${name}`);
  return {
    sizes: get('sizes', '1000,10000,50000')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
    iters: Math.max(1, Number(get('iters', '5')) || 5),
    seedOnly: has('seed-only'),
    correctnessOnly: has('correctness-only'),
  };
}

function bucketForIndex(i: number, n: number): Bucket {
  const p = i / n;
  if (p < 0.05) return 'inactive';
  if (p < 0.1) return 'zero_price';
  if (p < 0.45) return 'balanced_positive';
  if (p < 0.5) return 'balanced_zero';
  if (p < 0.6) return 'unused';
  if (p < 0.68) return 'genuine_recent';
  if (p < 0.72) return 'genuine_sold';
  if (p < 0.75) return 'excluded_purchase';
  if (p < 0.78) return 'excluded_movement';
  if (p < 0.8) return 'void_sale_unused';
  if (p < 0.82) return 'returned_sale_unused';
  return 'healthy_multi';
}

function pct(n: number, start: number, end: number) {
  return Math.floor(n * end) - Math.floor(n * start);
}

function expectedBucketCounts(n: number): Record<Bucket, number> {
  return {
    inactive: pct(n, 0, 0.05),
    zero_price: pct(n, 0.05, 0.1),
    balanced_positive: pct(n, 0.1, 0.45),
    balanced_zero: pct(n, 0.45, 0.5),
    unused: pct(n, 0.5, 0.6),
    genuine_recent: pct(n, 0.6, 0.68),
    genuine_sold: pct(n, 0.68, 0.72),
    excluded_purchase: pct(n, 0.72, 0.75),
    excluded_movement: pct(n, 0.75, 0.78),
    void_sale_unused: pct(n, 0.78, 0.8),
    returned_sale_unused: pct(n, 0.8, 0.82),
    healthy_multi: pct(n, 0.82, 1),
  };
}

function stats(nums: number[]) {
  if (nums.length === 0) return { min: null, median: null, p95: null, max: null };
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  const p95 = s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]!;
  return {
    min: Math.round(s[0]!),
    median: Math.round(median),
    p95: Math.round(p95),
    max: Math.round(s[s.length - 1]!),
  };
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function ensureUnit(): Promise<string> {
  const existing = await prisma.unit.findFirst({ select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.unit.create({
    data: { name: 'Each', pluralName: 'Each', symbol: 'ea', qaTag: QA_TAG },
  });
  return created.id;
}

async function deleteScaleTenant(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { businessId: true },
  });
  if (!user) return;
  const businessId = user.businessId;
  await prisma.salesInvoiceLine.deleteMany({ where: { salesInvoice: { businessId } } });
  await prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId } } });
  await prisma.salesInvoice.deleteMany({ where: { businessId } });
  await prisma.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoice: { businessId } } });
  await prisma.purchasePayment.deleteMany({ where: { purchaseInvoice: { businessId } } });
  await prisma.purchaseInvoice.deleteMany({ where: { businessId } });
  await prisma.stockMovement.deleteMany({ where: { store: { businessId } } });
  await prisma.inventoryBalance.deleteMany({ where: { store: { businessId } } });
  await prisma.productUnit.deleteMany({ where: { product: { businessId } } });
  await prisma.product.deleteMany({ where: { businessId } });
  await prisma.till.deleteMany({ where: { store: { businessId } } });
  await prisma.store.deleteMany({ where: { businessId } });
  await prisma.supplier.deleteMany({ where: { businessId } });
  await prisma.session.deleteMany({ where: { user: { businessId } } });
  await prisma.user.deleteMany({ where: { businessId } });
  await prisma.business.delete({ where: { id: businessId } });
}

async function seedTenant(size: number, label: string, unitId: string) {
  const ownerEmail = `scale.${label}.${size}@tillflow-test.invalid`;
  await deleteScaleTenant(ownerEmail);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const business = await prisma.business.create({
    data: {
      name: `Scale Bench ${label} ${size}`,
      currency: 'GHS',
      plan: 'GROWTH',
      selectedPlan: 'GROWTH',
      subscriptionStatus: 'TRIAL_ACTIVE',
      trialStartedAt: NOW,
      trialEndsAt: new Date(NOW.getTime() + 14 * 86400000),
      businessCategory: 'SUPERMARKET',
      onboardingCompletedAt: NOW,
      timezone: 'Africa/Accra',
      storeMode: 'MULTI_STORE',
    },
  });

  const storeA = await prisma.store.create({
    data: { businessId: business.id, name: 'Branch A', isMainStore: true },
  });
  const storeB = await prisma.store.create({
    data: { businessId: business.id, name: 'Branch B', isMainStore: false },
  });
  const till = await prisma.till.create({
    data: { storeId: storeA.id, name: 'Till 1' },
  });
  await prisma.user.create({
    data: {
      businessId: business.id,
      email: ownerEmail,
      name: `Scale Owner ${size}`,
      role: 'OWNER',
      active: true,
      passwordHash,
      qaTag: QA_TAG,
    },
  });
  const cashier = await prisma.user.create({
    data: {
      businessId: business.id,
      email: `scale.cashier.${label}.${size}@tillflow-test.invalid`,
      name: 'Scale Cashier',
      role: 'CASHIER',
      active: true,
      passwordHash,
      qaTag: QA_TAG,
    },
  });
  const supplier = await prisma.supplier.create({
    data: { businessId: business.id, name: `Scale Supplier ${label} ${size}`, qaTag: QA_TAG },
  });

  const storeIds = [storeA.id, storeB.id];
  const productIdsByIndex: string[] = new Array(size);
  const bucketByIndex: Bucket[] = new Array(size);
  const BATCH = 500;

  for (let start = 0; start < size; start += BATCH) {
    const end = Math.min(size, start + BATCH);
    const products = [];
    const units = [];
    for (let i = start; i < end; i++) {
      const bucket = bucketForIndex(i, size);
      bucketByIndex[i] = bucket;
      const productId = id('sp');
      productIdsByIndex[i] = productId;
      const active = bucket !== 'inactive';
      const price = bucket === 'zero_price' ? 0 : 100 + (i % 50) * 10;
      const createdAt =
        bucket === 'genuine_recent' || (bucket === 'healthy_multi' && i % 11 === 0)
          ? RECENT
          : AGED;
      // Globally unique barcode: hash label+size+i
      const barcode = createHash('sha1')
        .update(`${label}:${size}:${i}`)
        .digest('hex')
        .slice(0, 13);
      products.push({
        id: productId,
        businessId: business.id,
        name: `Scale ${label} ${size} SKU ${String(i).padStart(6, '0')}`,
        sku: `SCALE-${label}-${size}-${String(i).padStart(6, '0')}`,
        barcode,
        active,
        sellingPriceBasePence: price,
        defaultCostBasePence: 50 + (i % 40),
        createdAt,
        updatedAt: createdAt,
        qaTag: QA_TAG,
      });
      units.push({
        id: id('pu'),
        productId,
        unitId,
        isBaseUnit: true,
        conversionToBase: 1,
        sellingPricePence: price,
        defaultCostPence: 50 + (i % 40),
        qaTag: QA_TAG,
      });
    }
    await prisma.product.createMany({ data: products });
    await prisma.productUnit.createMany({ data: units });
    if (end % 2500 === 0 || end === size) console.log(`  products ${end}/${size} (${label})`);
  }

  const balances = [];
  const movements = [];
  const purchaseInvoices = [];
  const purchaseLines = [];
  const salesInvoices = [];
  const salesLines = [];
  const movementTypes = ['OPENING', 'PURCHASE', 'TRANSFER_IN', 'ADJUSTMENT', 'STOCKTAKE'] as const;

  for (let i = 0; i < size; i++) {
    const bucket = bucketByIndex[i]!;
    const productId = productIdsByIndex[i]!;
    const storeId = storeIds[i % 2]!;

    if (bucket === 'balanced_positive' || bucket === 'healthy_multi') {
      balances.push({
        id: id('ib'),
        storeId,
        productId,
        qtyOnHandBase: 5 + (i % 40),
        avgCostBasePence: 50,
        qaTag: QA_TAG,
      });
      if (bucket === 'healthy_multi' && i % 3 === 0) {
        balances.push({
          id: id('ib'),
          storeId: storeIds[(i + 1) % 2]!,
          productId,
          qtyOnHandBase: 2,
          avgCostBasePence: 50,
          qaTag: QA_TAG,
        });
      }
    }
    if (bucket === 'balanced_zero') {
      balances.push({
        id: id('ib'),
        storeId,
        productId,
        qtyOnHandBase: 0,
        avgCostBasePence: 50,
        qaTag: QA_TAG,
      });
    }
    if (bucket === 'excluded_purchase') {
      const purchaseId = id('po');
      purchaseInvoices.push({
        id: purchaseId,
        businessId: business.id,
        storeId,
        supplierId: supplier.id,
        paymentStatus: 'PAID',
        subtotalPence: 100,
        vatPence: 0,
        totalPence: 100,
        qaTag: QA_TAG,
      });
      purchaseLines.push({
        id: id('pl'),
        purchaseInvoiceId: purchaseId,
        productId,
        unitId,
        qtyInUnit: 1,
        conversionToBase: 1,
        qtyBase: 1,
        unitCostPence: 100,
        lineSubtotalPence: 100,
        lineVatPence: 0,
        lineTotalPence: 100,
      });
    }
    if (bucket === 'excluded_movement') {
      const type = movementTypes[i % movementTypes.length]!;
      movements.push({
        id: id('sm'),
        storeId,
        productId,
        qtyBase: 1,
        type,
        referenceType:
          type === 'OPENING'
            ? 'OPENING_STOCK'
            : type === 'PURCHASE'
              ? 'PURCHASE_INVOICE'
              : type === 'ADJUSTMENT'
                ? 'STOCK_ADJUSTMENT'
                : type === 'STOCKTAKE'
                  ? 'STOCKTAKE'
                  : null,
        userId: cashier.id,
        qaTag: QA_TAG,
      });
    }
    if (
      bucket === 'genuine_sold' ||
      bucket === 'healthy_multi' ||
      bucket === 'void_sale_unused' ||
      bucket === 'returned_sale_unused'
    ) {
      const status =
        bucket === 'void_sale_unused'
          ? 'VOID'
          : bucket === 'returned_sale_unused'
            ? 'RETURNED'
            : 'PAID';
      const copies = bucket === 'healthy_multi' ? 1 + (i % 3) : 1;
      for (let c = 0; c < copies; c++) {
        const saleId = id('si');
        salesInvoices.push({
          id: saleId,
          businessId: business.id,
          storeId,
          tillId: till.id,
          cashierUserId: cashier.id,
          paymentStatus: status,
          subtotalPence: 100,
          vatPence: 0,
          totalPence: 100,
          qaTag: QA_TAG,
        });
        salesLines.push({
          id: id('sl'),
          salesInvoiceId: saleId,
          productId,
          unitId,
          qtyInUnit: 1,
          conversionToBase: 1,
          qtyBase: 1,
          unitPricePence: 100,
          lineSubtotalPence: 100,
          lineVatPence: 0,
          lineTotalPence: 100,
        });
      }
    }
  }

  async function flush<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>, labelRows: string) {
    for (let i = 0; i < rows.length; i += BATCH) {
      await write(rows.slice(i, i + BATCH));
    }
    console.log(`  ${labelRows}: ${rows.length}`);
  }

  await flush(balances, (data) => prisma.inventoryBalance.createMany({ data }), 'balances');
  await flush(movements, (data) => prisma.stockMovement.createMany({ data }), 'movements');
  await flush(purchaseInvoices, (data) => prisma.purchaseInvoice.createMany({ data }), 'purchases');
  await flush(purchaseLines, (data) => prisma.purchaseInvoiceLine.createMany({ data }), 'purchaseLines');
  await flush(salesInvoices, (data) => prisma.salesInvoice.createMany({ data }), 'sales');
  await flush(salesLines, (data) => prisma.salesInvoiceLine.createMany({ data }), 'saleLines');

  return {
    businessId: business.id,
    storeIds,
    ownerEmail,
    productIdsByIndex,
    bucketByIndex,
  };
}

function buildExpected(productIdsByIndex: string[], bucketByIndex: Bucket[]) {
  const expectedUnusedIds: string[] = [];
  const expectedGenuineIds: string[] = [];
  for (let i = 0; i < bucketByIndex.length; i++) {
    const bucket = bucketByIndex[i]!;
    const pid = productIdsByIndex[i]!;
    if (bucket === 'unused' || bucket === 'void_sale_unused' || bucket === 'returned_sale_unused') {
      expectedUnusedIds.push(pid);
    } else if (bucket === 'genuine_recent' || bucket === 'genuine_sold') {
      expectedGenuineIds.push(pid);
    }
  }
  expectedUnusedIds.sort();
  expectedGenuineIds.sort();
  return { expectedUnusedIds, expectedGenuineIds };
}

async function independentOracle(businessId: string, now: Date) {
  const candidates = await prisma.product.findMany({
    where: {
      businessId,
      active: true,
      sellingPriceBasePence: { gt: 0 },
      inventoryBalances: { none: {} },
    },
    select: { id: true, createdAt: true },
  });
  const ids = candidates.map((c) => c.id);
  if (ids.length === 0) return { unusedIds: [] as string[], genuineIds: [] as string[] };

  // Chunk IN lists to avoid driver limits on large catalogues.
  const chunkSize = 2000;
  const soldSet = new Set<string>();
  const hist = new Set<string>();
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const [sold, purchases, movements] = await Promise.all([
      prisma.salesInvoiceLine.findMany({
        where: {
          productId: { in: chunk },
          salesInvoice: { businessId, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
        },
        select: { productId: true },
        distinct: ['productId'],
      }),
      prisma.purchaseInvoiceLine.findMany({
        where: { productId: { in: chunk }, purchaseInvoice: { businessId } },
        select: { productId: true },
        distinct: ['productId'],
      }),
      prisma.stockMovement.findMany({
        where: {
          productId: { in: chunk },
          store: { businessId },
          OR: [
            {
              type: {
                in: [
                  'OPENING',
                  'PURCHASE',
                  'TRANSFER_IN',
                  'ADJUSTMENT',
                  'ADJUSTMENT_IN',
                  'STOCKTAKE',
                  'STOCK_TAKE',
                ],
              },
            },
            {
              referenceType: {
                in: [
                  'OPENING_STOCK',
                  'OPENING_BALANCE_INVENTORY',
                  'PURCHASE_INVOICE',
                  'STOCK_ADJUSTMENT',
                  'STOCKTAKE',
                ],
              },
            },
          ],
        },
        select: { productId: true },
        distinct: ['productId'],
      }),
    ]);
    for (const r of sold) soldSet.add(r.productId);
    for (const r of purchases) hist.add(r.productId);
    for (const r of movements) hist.add(r.productId);
  }

  const unusedIds: string[] = [];
  const genuineIds: string[] = [];
  for (const p of candidates) {
    const klass = classifyNoBalanceProduct(
      {
        createdAt: p.createdAt,
        hasSales: soldSet.has(p.id),
        hasConfirmedQuantityHistory: hist.has(p.id),
      },
      now,
      UNUSED_CATALOGUE_AGE_DAYS
    );
    if (klass === 'unused-catalogue') unusedIds.push(p.id);
    if (klass === 'genuine-gap') genuineIds.push(p.id);
  }
  unusedIds.sort();
  genuineIds.sort();
  return { unusedIds, genuineIds };
}

async function measureCounts(businessId: string, iters: number) {
  const cold: number[] = [];
  const warm: number[] = [];
  const t0 = performance.now();
  await countStockGapSignals(businessId, NOW);
  cold.push(performance.now() - t0);
  for (let i = 0; i < iters; i++) {
    const t = performance.now();
    await countStockGapSignals(businessId, NOW);
    warm.push(performance.now() - t);
  }
  return { cold: stats(cold), warm: stats(warm) };
}

async function measureDestination(
  businessId: string,
  issue: 'UNUSED_CATALOGUE' | 'STOCK_SETUP_GAP',
  iters: number
) {
  const where = getStockGapIssueProductWhere(businessId, issue, NOW);
  const pageTimings: Record<string, number[]> = { page1: [], page2: [], pageLate: [], count: [] };

  for (let i = 0; i < iters; i++) {
    const tc = performance.now();
    const total = await prisma.product.count({ where });
    pageTimings.count.push(performance.now() - tc);

    const t1 = performance.now();
    await prisma.product.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      skip: 0,
      take: 25,
    });
    pageTimings.page1.push(performance.now() - t1);

    const t2 = performance.now();
    await prisma.product.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      skip: 25,
      take: 25,
    });
    pageTimings.page2.push(performance.now() - t2);

    const lateSkip = Math.max(0, Math.floor(total / 25) - 1) * 25;
    const tl = performance.now();
    await prisma.product.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      skip: lateSkip,
      take: 25,
    });
    pageTimings.pageLate.push(performance.now() - tl);
  }

  return {
    page1: stats(pageTimings.page1),
    page2: stats(pageTimings.page2),
    pageLate: stats(pageTimings.pageLate),
    count: stats(pageTimings.count),
  };
}

async function measureConcurrency(businessId: string, otherBusinessId: string, level: number) {
  const started = performance.now();
  const jobs = Array.from({ length: level }, (_, i) =>
    countStockGapSignals(i % 2 === 0 ? businessId : otherBusinessId, NOW)
  );
  const results = await Promise.all(jobs);
  return {
    level,
    elapsedMs: Math.round(performance.now() - started),
    primaryUnused: results.filter((_, i) => i % 2 === 0).map((r) => r.unusedCatalogueProductCount),
    otherUnused: results.filter((_, i) => i % 2 === 1).map((r) => r.unusedCatalogueProductCount),
  };
}

async function explainPlan(businessId: string) {
  try {
    const cutoff = new Date(NOW.getTime() - UNUSED_CATALOGUE_AGE_DAYS * 86400000).toISOString();
    return await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `EXPLAIN QUERY PLAN
       SELECT COUNT(*) FROM Product p
       WHERE p.businessId = ?
         AND p.active = 1
         AND p.sellingPriceBasePence > 0
         AND NOT EXISTS (SELECT 1 FROM InventoryBalance b WHERE b.productId = p.id)
         AND p.createdAt < ?
         AND NOT EXISTS (
           SELECT 1 FROM SalesInvoiceLine l
           JOIN SalesInvoice s ON s.id = l.salesInvoiceId
           WHERE l.productId = p.id AND s.businessId = ? AND s.paymentStatus NOT IN ('RETURNED','VOID')
         )
         AND NOT EXISTS (
           SELECT 1 FROM PurchaseInvoiceLine pl
           JOIN PurchaseInvoice pi ON pi.id = pl.purchaseInvoiceId
           WHERE pl.productId = p.id AND pi.businessId = ?
         )`,
      businessId,
      cutoff,
      businessId,
      businessId
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function seedSize(size: number): Promise<SeedMeta> {
  console.log(`\n=== Seeding size ${size} ===`);
  const unitId = await ensureUnit();
  const primary = await seedTenant(size, 'primary', unitId);
  const otherSize = Math.max(500, Math.min(2000, Math.floor(size / 5)));
  const other = await seedTenant(otherSize, 'other', unitId);
  const expected = buildExpected(primary.productIdsByIndex, primary.bucketByIndex);

  return {
    size,
    businessId: primary.businessId,
    otherBusinessId: other.businessId,
    ownerEmail: primary.ownerEmail,
    storeIds: primary.storeIds,
    expectedUnusedIds: expected.expectedUnusedIds,
    expectedGenuineIds: expected.expectedGenuineIds,
    expectedUnusedCount: expected.expectedUnusedIds.length,
    expectedGenuineCount: expected.expectedGenuineIds.length,
    bucketCounts: expectedBucketCounts(size),
    historyCounts: {
      balances: await prisma.inventoryBalance.count({
        where: { store: { businessId: primary.businessId } },
      }),
      movements: await prisma.stockMovement.count({
        where: { store: { businessId: primary.businessId } },
      }),
      purchaseLines: await prisma.purchaseInvoiceLine.count({
        where: { purchaseInvoice: { businessId: primary.businessId } },
      }),
      saleLines: await prisma.salesInvoiceLine.count({
        where: { salesInvoice: { businessId: primary.businessId } },
      }),
      sales: await prisma.salesInvoice.count({ where: { businessId: primary.businessId } }),
    },
  };
}

async function validateSize(meta: SeedMeta, iters: number, concurrencyLevels: number[]) {
  console.log(`\n=== Validating size ${meta.size} ===`);
  const oracle = await independentOracle(meta.businessId, NOW);
  const counts = await countStockGapSignals(meta.businessId, NOW);
  const otherCounts = await countStockGapSignals(meta.otherBusinessId, NOW);

  const unusedIds = (
    await prisma.product.findMany({
      where: getStockGapIssueProductWhere(meta.businessId, 'UNUSED_CATALOGUE', NOW),
      select: { id: true },
      orderBy: { id: 'asc' },
    })
  ).map((p) => p.id);
  const genuineIds = (
    await prisma.product.findMany({
      where: getStockGapIssueProductWhere(meta.businessId, 'STOCK_SETUP_GAP', NOW),
      select: { id: true },
      orderBy: { id: 'asc' },
    })
  ).map((p) => p.id);

  const correctness = {
    seedExpectedUnused: meta.expectedUnusedCount,
    seedExpectedGenuine: meta.expectedGenuineCount,
    oracleUnused: oracle.unusedIds.length,
    oracleGenuine: oracle.genuineIds.length,
    appCountUnused: counts.unusedCatalogueProductCount,
    appCountGenuine: counts.productsNeedingOpeningQtyCount,
    destinationUnused: unusedIds.length,
    destinationGenuine: genuineIds.length,
    unusedMatchesSeed: arraysEqual(unusedIds, meta.expectedUnusedIds),
    genuineMatchesSeed: arraysEqual(genuineIds, meta.expectedGenuineIds),
    unusedMatchesOracle: arraysEqual(unusedIds, oracle.unusedIds),
    genuineMatchesOracle: arraysEqual(genuineIds, oracle.genuineIds),
    countMatchesDestination:
      counts.unusedCatalogueProductCount === unusedIds.length &&
      counts.productsNeedingOpeningQtyCount === genuineIds.length,
    noOverlap: unusedIds.filter((id) => genuineIds.includes(id)).length === 0,
    otherUnusedCount: otherCounts.unusedCatalogueProductCount,
    otherGenuineCount: otherCounts.productsNeedingOpeningQtyCount,
  };

  const memBefore = process.memoryUsage().heapUsed;
  const countPerf = await measureCounts(meta.businessId, iters);
  const destUnused = await measureDestination(meta.businessId, 'UNUSED_CATALOGUE', iters);
  const destGenuine = await measureDestination(meta.businessId, 'STOCK_SETUP_GAP', iters);
  const memAfter = process.memoryUsage().heapUsed;

  const concurrency = [];
  for (const level of concurrencyLevels) {
    concurrency.push(await measureConcurrency(meta.businessId, meta.otherBusinessId, level));
  }

  return {
    size: meta.size,
    dataset: {
      bucketCounts: meta.bucketCounts,
      historyCounts: meta.historyCounts,
      branches: meta.storeIds.length,
      expectedUnusedCount: meta.expectedUnusedCount,
      expectedGenuineCount: meta.expectedGenuineCount,
    },
    correctness,
    performance: {
      environment: 'local-sqlite',
      recommendationCount: countPerf,
      destinationUnused: destUnused,
      destinationGenuine: destGenuine,
      heapDeltaBytes: memAfter - memBefore,
      concurrency,
      queryPlan: await explainPlan(meta.businessId),
      targets: {
        countMedianMs: meta.size <= 1000 ? 150 : meta.size <= 10000 ? 400 : 1000,
        countP95Ms: meta.size <= 1000 ? 400 : meta.size <= 10000 ? 1000 : 2500,
        destP95Ms: meta.size <= 1000 ? 800 : meta.size <= 10000 ? 1500 : 2500,
      },
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync('tmp', { recursive: true });
  const results = [];

  for (const size of args.sizes) {
    const meta = await seedSize(size);
    if (args.seedOnly) {
      results.push({
        size,
        seeded: true,
        expectedUnusedCount: meta.expectedUnusedCount,
        expectedGenuineCount: meta.expectedGenuineCount,
        historyCounts: meta.historyCounts,
      });
      continue;
    }
    const report = await validateSize(meta, args.iters, args.correctnessOnly ? [1] : [1, 5, 20]);
    results.push(report);
    console.log(
      JSON.stringify(
        {
          size,
          pass:
            report.correctness.unusedMatchesSeed &&
            report.correctness.genuineMatchesSeed &&
            report.correctness.countMatchesDestination &&
            report.correctness.noOverlap,
          correctness: report.correctness,
          countWarm: report.performance.recommendationCount.warm,
          destUnusedPage1: report.performance.destinationUnused.page1,
        },
        null,
        2
      )
    );
  }

  const out = `tmp/catalogue-scale-bench-${Date.now()}.json`;
  const payload = {
    generatedAt: new Date().toISOString(),
    args,
    results,
  };
  writeFileSync(
    out,
    JSON.stringify(payload, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
  );
  console.log(`\nWrote ${out}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
