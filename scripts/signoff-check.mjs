/**
 * Production sign-off DB checks (Neon). No secrets printed.
 * Usage: node scripts/signoff-check.mjs [businessName]
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

function loadEnv(path) {
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] ??= v.replace(/\\n$/, '');
  }
}
loadEnv('.env.production.local');
const pg =
  process.env.POSTGRES_URL_NON_POOLING?.replace(/\\n/g, '').trim() ||
  process.env.POSTGRES_PRISMA_URL?.replace(/\\n/g, '').trim();
if (pg) {
  process.env.POSTGRES_PRISMA_URL = pg;
  process.env.DATABASE_URL = pg;
}

const prisma = new PrismaClient();
const businessName = process.argv[2] ?? 'Adom Test Mart';
const productSku = process.argv[3];

const business = await prisma.business.findFirst({
  where: { name: businessName },
  orderBy: { createdAt: 'desc' },
  select: {
    id: true,
    name: true,
    setupProgressPct: true,
    activationStatus: true,
  },
});

if (!business) {
  console.log(JSON.stringify({ error: 'BUSINESS_NOT_FOUND' }));
  process.exit(0);
}

const profile = await prisma.controlBusinessProfile.findUnique({
  where: { businessId: business.id },
  select: {
    activationScore: true,
    onboardingStage: true,
    productCountSnapshot: true,
  },
});

let product = null;
let openingMovement = null;
if (productSku) {
  product = await prisma.product.findFirst({
    where: { businessId: business.id, sku: productSku },
    select: {
      id: true,
      name: true,
      sku: true,
      sellingPriceBasePence: true,
    },
  });
  if (product) {
    const balance = await prisma.inventoryBalance.findFirst({
      where: { productId: product.id },
      select: { qtyOnHandBase: true },
    });
    openingMovement = await prisma.stockMovement.findFirst({
      where: {
        productId: product.id,
        type: 'OPENING',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, qtyBase: true, createdAt: true },
    });
    product = { ...product, qtyOnHandBase: balance?.qtyOnHandBase ?? 0, openingMovement };
  }
}

const importCount = await prisma.productImport.count({
  where: { businessId: business.id },
});

const signoffSkus = await prisma.product.findMany({
  where: { businessId: business.id, sku: { startsWith: 'SIGNOFF' } },
  select: { sku: true, name: true },
  orderBy: { sku: 'asc' },
});

const latestImport = await prisma.productImport.findFirst({
  where: { businessId: business.id },
  orderBy: { createdAt: 'desc' },
  select: {
    id: true,
    status: true,
    createdAt: true,
    fileName: true,
    rowsImported: true,
    rowsParsed: true,
  },
});

console.log(
  JSON.stringify(
    {
      business,
      profile,
      productCount: await prisma.product.count({ where: { businessId: business.id } }),
      importCount,
      latestImport,
      signoffSkus,
      product,
    },
    null,
    2
  )
);

await prisma.$disconnect();
