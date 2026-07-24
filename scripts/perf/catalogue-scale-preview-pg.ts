/**
 * Preview Postgres catalogue-scale gate.
 * Seeds deterministic synthetic tenants into tillflow_preview_qa only.
 * Never points at production customer data.
 *
 * Usage (from repo root, after prisma generate --schema=prisma/schema.postgres.prisma):
 *   node --env-file=tmp/preview-db-restricted.env --import tsx scripts/perf/catalogue-scale-preview-pg.ts --sizes=1000,10000,50000 --iters=5
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { classifyNoBalanceProduct } from '../../lib/improve-records-classify';
import { UNUSED_CATALOGUE_AGE_DAYS } from '../../lib/improve-records-constants';
import {
  countStockGapSignals,
  getStockGapIssueProductWhere,
  isUnusedCatalogueProduct,
} from '../../lib/improve-records-load';
import {
  stockSetupGapProductWhere,
  unusedCatalogueProductWhere,
} from '../../lib/improve-records-stock-gap-where';

function loadEnvFile(path: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2]!.trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[m[1]!]) process.env[m[1]!] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile('tmp/preview-db-restricted.env');

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL;
if (!url) {
  console.error('Missing POSTGRES_URL_NON_POOLING — cannot run Preview Postgres gate.');
  process.exit(2);
}
{
  const u = new URL(url);
  if (u.pathname !== '/tillflow_preview_qa') {
    console.error(`Refusing non-preview DB path: ${u.pathname}`);
    process.exit(2);
  }
}

const prisma = new PrismaClient({
  datasources: { db: { url } },
  log: ['error'],
});

const QA_TAG = 'SCALE_CATALOGUE_PG';
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

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

function parseArgs(argv: string[]) {
  const get = (name: string, fallback: string) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  return {
    sizes: get('sizes', '1000,10000,50000')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
    iters: Math.max(1, Number(get('iters', '5')) || 5),
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

function stats(nums: number[]) {
  if (!nums.length) return { min: null, median: null, p95: null, max: null };
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  const p95 = s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]!;
  return { min: Math.round(s[0]!), median: Math.round(median), p95: Math.round(p95), max: Math.round(s.at(-1)!) };
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function ensureUnit() {
  const existing = await prisma.unit.findFirst({ select: { id: true } });
  if (existing) return existing.id;
  return (await prisma.unit.create({ data: { name: 'Each', pluralName: 'Each', symbol: 'ea', qaTag: QA_TAG } })).id;
}

async function deleteScaleTenant(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { businessId: true } });
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
  const ownerEmail = `pg.scale.${label}.${size}@tillflow-test.invalid`;
  await deleteScaleTenant(ownerEmail);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const business = await prisma.business.create({
    data: {
      name: `PG Scale ${label} ${size}`,
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
  const till = await prisma.till.create({ data: { storeId: storeA.id, name: 'Till 1' } });
  await prisma.user.create({
    data: {
      businessId: business.id,
      email: ownerEmail,
      name: `PG Scale Owner ${size}`,
      role: 'OWNER',
      active: true,
      passwordHash,
      qaTag: QA_TAG,
    },
  });
  const cashier = await prisma.user.create({
    data: {
      businessId: business.id,
      email: `pg.scale.cashier.${label}.${size}@tillflow-test.invalid`,
      name: 'PG Scale Cashier',
      role: 'CASHIER',
      active: true,
      passwordHash,
      qaTag: QA_TAG,
    },
  });
  const supplier = await prisma.supplier.create({
    data: { businessId: business.id, name: `PG Scale Supplier ${label} ${size}`, qaTag: QA_TAG },
  });

  const storeIds = [storeA.id, storeB.id];
  const productIdsByIndex: string[] = new Array(size);
  const bucketByIndex: Bucket[] = new Array(size);
  const BATCH = 400;

  for (let start = 0; start < size; start += BATCH) {
    const end = Math.min(size, start + BATCH);
    const products = [];
    const units = [];
    for (let i = start; i < end; i++) {
      const bucket = bucketForIndex(i, size);
      bucketByIndex[i] = bucket;
      const productId = id('psp');
      productIdsByIndex[i] = productId;
      const active = bucket !== 'inactive';
      const price = bucket === 'zero_price' ? 0 : 100 + (i % 50) * 10;
      const createdAt =
        bucket === 'genuine_recent' || (bucket === 'healthy_multi' && i % 11 === 0) ? RECENT : AGED;
      const barcode = createHash('sha1').update(`pg:${label}:${size}:${i}`).digest('hex').slice(0, 13);
      products.push({
        id: productId,
        businessId: business.id,
        name: `PG Scale ${label} ${size} SKU ${String(i).padStart(6, '0')}`,
        sku: `PGSCALE-${label}-${size}-${String(i).padStart(6, '0')}`,
        barcode,
        active,
        sellingPriceBasePence: price,
        defaultCostBasePence: 50 + (i % 40),
        createdAt,
        updatedAt: createdAt,
        qaTag: QA_TAG,
      });
      units.push({
        id: id('ppu'),
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
    if (end % 2000 === 0 || end === size) console.log(`  products ${end}/${size} (${label})`);
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
        id: id('pib'),
        storeId,
        productId,
        qtyOnHandBase: 5 + (i % 40),
        avgCostBasePence: 50,
        qaTag: QA_TAG,
      });
      if (bucket === 'healthy_multi' && i % 3 === 0) {
        balances.push({
          id: id('pib'),
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
        id: id('pib'),
        storeId,
        productId,
        qtyOnHandBase: 0,
        avgCostBasePence: 50,
        qaTag: QA_TAG,
      });
    }
    if (bucket === 'excluded_purchase') {
      const purchaseId = id('ppo');
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
        id: id('ppl'),
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
        id: id('psm'),
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
        bucket === 'void_sale_unused' ? 'VOID' : bucket === 'returned_sale_unused' ? 'RETURNED' : 'PAID';
      const copies = bucket === 'healthy_multi' ? 1 + (i % 3) : 1;
      for (let c = 0; c < copies; c++) {
        const saleId = id('psi');
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
          id: id('psl'),
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
    for (let i = 0; i < rows.length; i += BATCH) await write(rows.slice(i, i + BATCH));
    console.log(`  ${labelRows}: ${rows.length}`);
  }

  await flush(balances, (data) => prisma.inventoryBalance.createMany({ data }), 'balances');
  await flush(movements, (data) => prisma.stockMovement.createMany({ data }), 'movements');
  await flush(purchaseInvoices, (data) => prisma.purchaseInvoice.createMany({ data }), 'purchases');
  await flush(purchaseLines, (data) => prisma.purchaseInvoiceLine.createMany({ data }), 'purchaseLines');
  await flush(salesInvoices, (data) => prisma.salesInvoice.createMany({ data }), 'sales');
  await flush(salesLines, (data) => prisma.salesInvoiceLine.createMany({ data }), 'saleLines');

  return { businessId: business.id, storeIds, ownerEmail, productIdsByIndex, bucketByIndex, unitId, tillId: till.id, cashierId: cashier.id };
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

async function independentOracle(businessId: string) {
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
  const soldSet = new Set<string>();
  const hist = new Set<string>();
  const chunkSize = 1500;
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
                in: ['OPENING', 'PURCHASE', 'TRANSFER_IN', 'ADJUSTMENT', 'ADJUSTMENT_IN', 'STOCKTAKE', 'STOCK_TAKE'],
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
      NOW,
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
  const errors: string[] = [];
  try {
    const t0 = performance.now();
    await countStockGapSignals(businessId, NOW);
    cold.push(performance.now() - t0);
  } catch (e) {
    errors.push(`cold: ${e instanceof Error ? e.message : String(e)}`);
  }
  for (let i = 0; i < iters; i++) {
    try {
      const t = performance.now();
      await countStockGapSignals(businessId, NOW);
      warm.push(performance.now() - t);
    } catch (e) {
      errors.push(`warm[${i}]: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { cold: stats(cold), warm: stats(warm), errors };
}

async function measureDestination(
  businessId: string,
  issue: 'UNUSED_CATALOGUE' | 'STOCK_SETUP_GAP',
  iters: number
) {
  const where = getStockGapIssueProductWhere(businessId, issue, NOW);
  const timings: Record<string, number[]> = { page1: [], page2: [], pageLate: [], count: [] };
  const errors: string[] = [];
  let pageSizeOk = true;
  let orderStable = true;
  let noDupes = true;

  for (let i = 0; i < iters; i++) {
    try {
      const tc = performance.now();
      const total = await prisma.product.count({ where });
      timings.count.push(performance.now() - tc);

      const t1 = performance.now();
      const p1 = await prisma.product.findMany({
        where,
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 25,
      });
      timings.page1.push(performance.now() - t1);
      if (p1.length > 25) pageSizeOk = false;

      const t2 = performance.now();
      const p2 = await prisma.product.findMany({
        where,
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: 25,
        take: 25,
      });
      timings.page2.push(performance.now() - t2);

      const lateSkip = Math.max(0, Math.floor(total / 25) - 1) * 25;
      const tl = performance.now();
      const pLate = await prisma.product.findMany({
        where,
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: lateSkip,
        take: 25,
      });
      timings.pageLate.push(performance.now() - tl);

      const ids = [...p1, ...p2, ...pLate].map((r) => r.id);
      if (new Set(ids).size !== ids.length) noDupes = false;
      for (let k = 1; k < p1.length; k++) {
        if (p1[k - 1]!.name > p1[k]!.name) orderStable = false;
      }
      const overlap12 = p1.filter((a) => p2.some((b) => b.id === a.id));
      if (overlap12.length) noDupes = false;
    } catch (e) {
      errors.push(`${issue} iter ${i}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    page1: stats(timings.page1),
    page2: stats(timings.page2),
    pageLate: stats(timings.pageLate),
    count: stats(timings.count),
    pageSizeOk,
    orderStable,
    noDupes,
    errors,
  };
}

async function measureConcurrency(businessId: string, otherBusinessId: string, level: number) {
  const started = performance.now();
  let error: string | null = null;
  let results: Awaited<ReturnType<typeof countStockGapSignals>>[] = [];
  try {
    results = await Promise.all(
      Array.from({ length: level }, (_, i) =>
        countStockGapSignals(i % 2 === 0 ? businessId : otherBusinessId, NOW)
      )
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  return {
    level,
    elapsedMs: Math.round(performance.now() - started),
    error,
    primaryUnused: results.filter((_, i) => i % 2 === 0).map((r) => r.unusedCatalogueProductCount),
    otherUnused: results.filter((_, i) => i % 2 === 1).map((r) => r.unusedCatalogueProductCount),
  };
}

async function explainPostgres(businessId: string) {
  const cutoff = new Date(NOW.getTime() - UNUSED_CATALOGUE_AGE_DAYS * 86400000);
  const plans: Record<string, unknown> = {};
  const queries: Array<[string, string, unknown[]]> = [
    [
      'unused_count',
      `EXPLAIN (FORMAT JSON)
       SELECT COUNT(*) FROM "Product" p
       WHERE p."businessId" = $1
         AND p.active = true
         AND p."sellingPriceBasePence" > 0
         AND NOT EXISTS (SELECT 1 FROM "InventoryBalance" b WHERE b."productId" = p.id)
         AND p."createdAt" < $2
         AND NOT EXISTS (
           SELECT 1 FROM "SalesInvoiceLine" l
           JOIN "SalesInvoice" s ON s.id = l."salesInvoiceId"
           WHERE l."productId" = p.id AND s."businessId" = $1 AND s."paymentStatus" NOT IN ('RETURNED','VOID')
         )
         AND NOT EXISTS (
           SELECT 1 FROM "PurchaseInvoiceLine" pl
           JOIN "PurchaseInvoice" pi ON pi.id = pl."purchaseInvoiceId"
           WHERE pl."productId" = p.id AND pi."businessId" = $1
         )`,
      [businessId, cutoff],
    ],
    [
      'genuine_count',
      `EXPLAIN (FORMAT JSON)
       SELECT COUNT(*) FROM "Product" p
       WHERE p."businessId" = $1
         AND p.active = true
         AND p."sellingPriceBasePence" > 0
         AND NOT EXISTS (SELECT 1 FROM "InventoryBalance" b WHERE b."productId" = p.id)
         AND (
           p."createdAt" >= $2
           OR EXISTS (
             SELECT 1 FROM "SalesInvoiceLine" l
             JOIN "SalesInvoice" s ON s.id = l."salesInvoiceId"
             WHERE l."productId" = p.id AND s."businessId" = $1 AND s."paymentStatus" NOT IN ('RETURNED','VOID')
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM "PurchaseInvoiceLine" pl
           JOIN "PurchaseInvoice" pi ON pi.id = pl."purchaseInvoiceId"
           WHERE pl."productId" = p.id AND pi."businessId" = $1
         )`,
      [businessId, cutoff],
    ],
    [
      'sold_without_qty_count',
      `EXPLAIN (FORMAT JSON)
       SELECT COUNT(*) FROM "Product" p
       WHERE p."businessId" = $1
         AND p.active = true
         AND p."sellingPriceBasePence" > 0
         AND NOT EXISTS (SELECT 1 FROM "InventoryBalance" b WHERE b."productId" = p.id)
         AND EXISTS (
           SELECT 1 FROM "SalesInvoiceLine" l
           JOIN "SalesInvoice" s ON s.id = l."salesInvoiceId"
           WHERE l."productId" = p.id AND s."businessId" = $1 AND s."paymentStatus" NOT IN ('RETURNED','VOID')
         )
         AND NOT EXISTS (
           SELECT 1 FROM "PurchaseInvoiceLine" pl
           JOIN "PurchaseInvoice" pi ON pi.id = pl."purchaseInvoiceId"
           WHERE pl."productId" = p.id AND pi."businessId" = $1
         )`,
      [businessId],
    ],
    [
      'unused_page',
      `EXPLAIN (FORMAT JSON)
       SELECT p.id, p.name FROM "Product" p
       WHERE p."businessId" = $1
         AND p.active = true
         AND p."sellingPriceBasePence" > 0
         AND NOT EXISTS (SELECT 1 FROM "InventoryBalance" b WHERE b."productId" = p.id)
         AND p."createdAt" < $2
         AND NOT EXISTS (
           SELECT 1 FROM "SalesInvoiceLine" l
           JOIN "SalesInvoice" s ON s.id = l."salesInvoiceId"
           WHERE l."productId" = p.id AND s."businessId" = $1 AND s."paymentStatus" NOT IN ('RETURNED','VOID')
         )
         AND NOT EXISTS (
           SELECT 1 FROM "PurchaseInvoiceLine" pl
           JOIN "PurchaseInvoice" pi ON pi.id = pl."purchaseInvoiceId"
           WHERE pl."productId" = p.id AND pi."businessId" = $1
         )
       ORDER BY p.name ASC, p.id ASC
       LIMIT 25 OFFSET 0`,
      [businessId, cutoff],
    ],
    [
      'genuine_page',
      `EXPLAIN (FORMAT JSON)
       SELECT p.id, p.name FROM "Product" p
       WHERE p."businessId" = $1
         AND p.active = true
         AND p."sellingPriceBasePence" > 0
         AND NOT EXISTS (SELECT 1 FROM "InventoryBalance" b WHERE b."productId" = p.id)
         AND (
           p."createdAt" >= $2
           OR EXISTS (
             SELECT 1 FROM "SalesInvoiceLine" l
             JOIN "SalesInvoice" s ON s.id = l."salesInvoiceId"
             WHERE l."productId" = p.id AND s."businessId" = $1 AND s."paymentStatus" NOT IN ('RETURNED','VOID')
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM "PurchaseInvoiceLine" pl
           JOIN "PurchaseInvoice" pi ON pi.id = pl."purchaseInvoiceId"
           WHERE pl."productId" = p.id AND pi."businessId" = $1
         )
       ORDER BY p.name ASC, p.id ASC
       LIMIT 25 OFFSET 0`,
      [businessId, cutoff],
    ],
  ];

  for (const [name, sql, params] of queries) {
    try {
      plans[name] = await prisma.$queryRawUnsafe(sql, ...params);
    } catch (e) {
      plans[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return plans;
}

function summarizePlan(plan: unknown) {
  const text = JSON.stringify(plan);
  return {
    scopedByBusinessId: text.includes('businessId') || text.includes('Index Cond') || text.includes('businessId'),
    usesIndexScan: /Index Scan|Bitmap Index Scan|Index Only Scan/i.test(text),
    hasSeqScan: /Seq Scan/i.test(text),
    planSnippet: text.slice(0, 1200),
  };
}

async function resolutionChecks(meta: {
  businessId: string;
  otherBusinessId: string;
  productIdsByIndex: string[];
  bucketByIndex: Bucket[];
  storeIds: string[];
  unitId: string;
  tillId: string;
  cashierId: string;
}) {
  const unusedIdx = meta.bucketByIndex.findIndex((b) => b === 'unused');
  const genuineSoldIdx = meta.bucketByIndex.findIndex((b) => b === 'genuine_sold');
  const genuineRecentIdx = meta.bucketByIndex.findIndex((b) => b === 'genuine_recent');
  const results: Record<string, unknown> = {};

  const before = await countStockGapSignals(meta.businessId, NOW);
  const otherBefore = await countStockGapSignals(meta.otherBusinessId, NOW);

  // 1) Confirm stock on unused product → leaves unused
  if (unusedIdx >= 0) {
    const pid = meta.productIdsByIndex[unusedIdx]!;
    await prisma.inventoryBalance.create({
      data: {
        storeId: meta.storeIds[0]!,
        productId: pid,
        qtyOnHandBase: 3,
        avgCostBasePence: 50,
        qaTag: QA_TAG,
      },
    });
    const stillUnused = await isUnusedCatalogueProduct(meta.businessId, pid, NOW);
    const after = await countStockGapSignals(meta.businessId, NOW);
    const otherAfter = await countStockGapSignals(meta.otherBusinessId, NOW);
    results.confirmStock = {
      productLeftUnused: !stillUnused,
      unusedCountDelta: after.unusedCatalogueProductCount - before.unusedCatalogueProductCount,
      otherTenantUnchanged: otherAfter.unusedCatalogueProductCount === otherBefore.unusedCatalogueProductCount,
    };
  }

  // 2) Deactivate another unused (pick second unused if available)
  const unusedIndexes = meta.bucketByIndex
    .map((b, i) => (b === 'unused' ? i : -1))
    .filter((i) => i >= 0);
  if (unusedIndexes.length > 1) {
    const pid = meta.productIdsByIndex[unusedIndexes[1]!]!;
    const mid = await countStockGapSignals(meta.businessId, NOW);
    await prisma.product.update({ where: { id: pid }, data: { active: false } });
    const still = await isUnusedCatalogueProduct(meta.businessId, pid, NOW);
    const after = await countStockGapSignals(meta.businessId, NOW);
    const otherAfter = await countStockGapSignals(meta.otherBusinessId, NOW);
    results.deactivate = {
      productLeftUnused: !still,
      unusedCountDelta: after.unusedCatalogueProductCount - mid.unusedCatalogueProductCount,
      otherTenantUnchanged: otherAfter.unusedCatalogueProductCount === otherBefore.unusedCatalogueProductCount,
    };
  }

  // 3) Add qualifying stock history (purchase line) on genuine recent
  if (genuineRecentIdx >= 0) {
    const pid = meta.productIdsByIndex[genuineRecentIdx]!;
    const mid = await countStockGapSignals(meta.businessId, NOW);
    const purchaseId = id('pres');
    await prisma.purchaseInvoice.create({
      data: {
        id: purchaseId,
        businessId: meta.businessId,
        storeId: meta.storeIds[0]!,
        paymentStatus: 'PAID',
        subtotalPence: 100,
        vatPence: 0,
        totalPence: 100,
        qaTag: QA_TAG,
        lines: {
          create: {
            productId: pid,
            unitId: meta.unitId,
            qtyInUnit: 1,
            conversionToBase: 1,
            qtyBase: 1,
            unitCostPence: 100,
            lineSubtotalPence: 100,
            lineVatPence: 0,
            lineTotalPence: 100,
          },
        },
      },
    });
    const after = await countStockGapSignals(meta.businessId, NOW);
    const inDest = await prisma.product.count({
      where: { id: pid, ...getStockGapIssueProductWhere(meta.businessId, 'STOCK_SETUP_GAP', NOW) },
    });
    results.addPurchaseHistory = {
      leftStockSetupGap: inDest === 0,
      genuineDelta: after.productsNeedingOpeningQtyCount - mid.productsNeedingOpeningQtyCount,
    };
  }

  // 4) Add completed sale on aged unused → moves to genuine (not unused)
  const unusedAfterDeact = meta.bucketByIndex
    .map((b, i) => (b === 'unused' ? i : -1))
    .filter((i) => i >= 0 && i !== unusedIdx && i !== unusedIndexes[1]);
  if (unusedAfterDeact.length > 0) {
    const pid = meta.productIdsByIndex[unusedAfterDeact[0]!]!;
    const mid = await countStockGapSignals(meta.businessId, NOW);
    await prisma.salesInvoice.create({
      data: {
        businessId: meta.businessId,
        storeId: meta.storeIds[0]!,
        tillId: meta.tillId,
        cashierUserId: meta.cashierId,
        paymentStatus: 'PAID',
        subtotalPence: 100,
        vatPence: 0,
        totalPence: 100,
        qaTag: QA_TAG,
        lines: {
          create: {
            productId: pid,
            unitId: meta.unitId,
            qtyInUnit: 1,
            conversionToBase: 1,
            qtyBase: 1,
            unitPricePence: 100,
            lineSubtotalPence: 100,
            lineVatPence: 0,
            lineTotalPence: 100,
          },
        },
      },
    });
    const after = await countStockGapSignals(meta.businessId, NOW);
    const unusedNow = await isUnusedCatalogueProduct(meta.businessId, pid, NOW);
    const genuineNow =
      (await prisma.product.count({
        where: { id: pid, ...stockSetupGapProductWhere(meta.businessId, NOW) },
      })) > 0;
    results.addCompletedSale = {
      leftUnused: !unusedNow,
      enteredGenuine: genuineNow,
      unusedDelta: after.unusedCatalogueProductCount - mid.unusedCatalogueProductCount,
      genuineDelta: after.productsNeedingOpeningQtyCount - mid.productsNeedingOpeningQtyCount,
    };
  }

  void genuineSoldIdx;
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync('tmp', { recursive: true });
  console.log('Preview Postgres host:', new URL(url!).host, 'db: tillflow_preview_qa');

  // Ensure Prisma client matches postgres enums/types
  const unitId = await ensureUnit();
  const results = [];

  for (const size of args.sizes) {
    console.log(`\n=== PG seed size ${size} ===`);
    const primary = await seedTenant(size, 'primary', unitId);
    const otherSize = Math.max(500, Math.min(2000, Math.floor(size / 5)));
    const other = await seedTenant(otherSize, 'other', unitId);
    const expected = buildExpected(primary.productIdsByIndex, primary.bucketByIndex);

    console.log(`=== PG validate size ${size} ===`);
    const oracle = await independentOracle(primary.businessId);
    const counts = await countStockGapSignals(primary.businessId, NOW);
    const unusedIds = (
      await prisma.product.findMany({
        where: unusedCatalogueProductWhere(primary.businessId, NOW),
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map((p) => p.id);
    const genuineIds = (
      await prisma.product.findMany({
        where: stockSetupGapProductWhere(primary.businessId, NOW),
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map((p) => p.id);

    const correctness = {
      seedExpectedUnused: expected.expectedUnusedIds.length,
      seedExpectedGenuine: expected.expectedGenuineIds.length,
      oracleUnused: oracle.unusedIds.length,
      oracleGenuine: oracle.genuineIds.length,
      appCountUnused: counts.unusedCatalogueProductCount,
      appCountGenuine: counts.productsNeedingOpeningQtyCount,
      destinationUnused: unusedIds.length,
      destinationGenuine: genuineIds.length,
      unusedMatchesSeed: arraysEqual(unusedIds, expected.expectedUnusedIds),
      genuineMatchesSeed: arraysEqual(genuineIds, expected.expectedGenuineIds),
      unusedMatchesOracle: arraysEqual(unusedIds, oracle.unusedIds),
      genuineMatchesOracle: arraysEqual(genuineIds, oracle.genuineIds),
      countMatchesDestination:
        counts.unusedCatalogueProductCount === unusedIds.length &&
        counts.productsNeedingOpeningQtyCount === genuineIds.length,
      noOverlap: unusedIds.filter((id) => genuineIds.includes(id)).length === 0,
      sharedWhereBuilders: true,
    };

    const countPerf = await measureCounts(primary.businessId, args.iters);
    const destUnused = await measureDestination(primary.businessId, 'UNUSED_CATALOGUE', args.iters);
    const destGenuine = await measureDestination(primary.businessId, 'STOCK_SETUP_GAP', args.iters);
    const concurrency = [
      await measureConcurrency(primary.businessId, other.businessId, 5),
      await measureConcurrency(primary.businessId, other.businessId, 20),
    ];
    const plans = await explainPostgres(primary.businessId);
    const resolution = await resolutionChecks({
      businessId: primary.businessId,
      otherBusinessId: other.businessId,
      productIdsByIndex: primary.productIdsByIndex,
      bucketByIndex: primary.bucketByIndex,
      storeIds: primary.storeIds,
      unitId: primary.unitId,
      tillId: primary.tillId,
      cashierId: primary.cashierId,
    });

    const targets = {
      countP95Ms: size <= 1000 ? 400 : size <= 10000 ? 1000 : 2500,
      destP95Ms: size <= 1000 ? 800 : size <= 10000 ? 1500 : 2500,
    };
    const perfPass =
      (countPerf.warm.p95 ?? Infinity) <= targets.countP95Ms &&
      (destUnused.page1.p95 ?? Infinity) <= targets.destP95Ms &&
      (destGenuine.page1.p95 ?? Infinity) <= targets.destP95Ms;

    const report = {
      size,
      environment: 'preview-postgres-tillflow_preview_qa',
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
        sales: await prisma.salesInvoice.count({ where: { businessId: primary.businessId } }),
      },
      correctness,
      performance: { countPerf, destUnused, destGenuine, concurrency, targets, perfPass },
      queryPlans: {
        unused_count: summarizePlan(plans.unused_count),
        genuine_count: summarizePlan(plans.genuine_count),
        sold_without_qty_count: summarizePlan(plans.sold_without_qty_count),
        unused_page: summarizePlan(plans.unused_page),
        genuine_page: summarizePlan(plans.genuine_page),
        raw: plans,
      },
      resolution,
    };
    results.push(report);
    console.log(
      JSON.stringify(
        {
          size,
          correctnessPass:
            correctness.unusedMatchesSeed &&
            correctness.genuineMatchesSeed &&
            correctness.countMatchesDestination &&
            correctness.noOverlap,
          perfPass,
          countWarmP95: countPerf.warm.p95,
          destUnusedP1P95: destUnused.page1.p95,
          destGenuineP1P95: destGenuine.page1.p95,
          resolution,
        },
        null,
        2
      )
    );

    // Cleanup scale tenants to keep Preview DB lean
    await deleteScaleTenant(primary.ownerEmail);
    await deleteScaleTenant(other.ownerEmail);
  }

  const out = `tmp/catalogue-scale-preview-pg-${Date.now()}.json`;
  writeFileSync(
    out,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), args, results },
      (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      2
    )
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
