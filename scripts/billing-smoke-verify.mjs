/**
 * Verify billing fields for smoke-test businesses in production DB.
 * Usage: node scripts/billing-smoke-verify.mjs
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] ??= v.replace(/\\n$/, '');
    }
  } catch {
    // optional file
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

const EXPECTED = [
  { namePrefix: 'Smoke Starter Monthly', plan: 'STARTER', billingInterval: 'MONTHLY', addonOnlineStorefront: false, billingAmount: 19900 },
  { namePrefix: 'Smoke Starter Annual', plan: 'STARTER', billingInterval: 'ANNUAL', addonOnlineStorefront: false, billingAmount: 199000 },
  { namePrefix: 'Smoke Growth Monthly', plan: 'GROWTH', billingInterval: 'MONTHLY', addonOnlineStorefront: false, billingAmount: 34900 },
  { namePrefix: 'Smoke Growth Annual', plan: 'GROWTH', billingInterval: 'ANNUAL', addonOnlineStorefront: false, billingAmount: 349000 },
  { namePrefix: 'Smoke Growth Addon Monthly', plan: 'GROWTH', billingInterval: 'MONTHLY', addonOnlineStorefront: true, billingAmount: 54900 },
  { namePrefix: 'Smoke Growth Addon Annual', plan: 'GROWTH', billingInterval: 'ANNUAL', addonOnlineStorefront: true, billingAmount: 549000 },
  { namePrefix: 'Smoke Pro Monthly', plan: 'PRO', billingInterval: 'MONTHLY', addonOnlineStorefront: false, billingAmount: 69900 },
  { namePrefix: 'Smoke Pro Annual', plan: 'PRO', billingInterval: 'ANNUAL', addonOnlineStorefront: false, billingAmount: 699000 },
];

const prisma = new PrismaClient();
const results = [];

for (const expected of EXPECTED) {
  const business = await prisma.business.findFirst({
    where: { name: { startsWith: expected.namePrefix } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      plan: true,
      billingInterval: true,
      addonOnlineStorefront: true,
      billingAmount: true,
      storefrontEnabled: true,
    },
  });

  if (!business) {
    results.push({ scenario: expected.namePrefix, status: 'NOT_FOUND' });
    continue;
  }

  const profile = await prisma.controlBusinessProfile.findUnique({
    where: { businessId: business.id },
    select: {
      subscription: {
        select: {
          billingCadence: true,
          monthlyValuePence: true,
          outstandingAmountPence: true,
          purchasedPlan: true,
        },
      },
    },
  });

  const ok =
    business.plan === expected.plan &&
    business.billingInterval === expected.billingInterval &&
    business.addonOnlineStorefront === expected.addonOnlineStorefront &&
    business.billingAmount === expected.billingAmount &&
    business.storefrontEnabled === false;

  results.push({
    scenario: expected.namePrefix,
    status: ok ? 'PASS' : 'FAIL',
    businessId: business.id,
    got: {
      plan: business.plan,
      billingInterval: business.billingInterval,
      addonOnlineStorefront: business.addonOnlineStorefront,
      billingAmount: business.billingAmount,
      storefrontEnabled: business.storefrontEnabled,
      controlCadence: profile?.subscription?.billingCadence ?? null,
      controlMonthlyValue: profile?.subscription?.monthlyValuePence ?? null,
    },
    expected,
  });
}

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
await prisma.$disconnect();
