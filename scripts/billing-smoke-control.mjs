/**
 * Verify Control business billing display for smoke businesses.
 */
import { createHmac } from 'node:crypto';
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
    // optional
  }
}

loadEnv('.env.production.local');
loadEnv('tishgroup-control/.env.production.local');
const pg =
  process.env.POSTGRES_URL_NON_POOLING?.replace(/\\n/g, '').trim() ||
  process.env.POSTGRES_PRISMA_URL?.replace(/\\n/g, '').trim();
if (pg) {
  process.env.POSTGRES_PRISMA_URL = pg;
  process.env.DATABASE_URL = pg;
}

const secret =
  process.env.CONTROL_SESSION_SECRET?.trim() ||
  process.env.CONTROL_PLANE_ACCESS_KEY?.trim();
const email = process.env.CONTROL_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const prisma = new PrismaClient();

function encodeSession(staffId, staffEmail, role) {
  const payload = { staffId, email: staffEmail, role, exp: Math.floor(Date.now() / 1000) + 3600 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

const CHECKS = [
  {
    namePrefix: 'Smoke Growth Addon Annual',
    mustInclude: ['Billing: Annual', 'Monthly value: GHS 549', 'Annual charge: GHS 5,490', 'Saving: GHS 1,098', 'Storefront: Add-on selected'],
    expectedCollectionGhs: 5490,
  },
  {
    namePrefix: 'Smoke Pro Monthly',
    mustInclude: ['Billing: Monthly', 'Monthly value: GHS 699', 'Current charge: GHS 699/month', 'Storefront: Included'],
    expectedCollectionGhs: 699,
  },
];

const staff = await prisma.controlStaff.findUnique({ where: { email } });
const token = encodeSession(staff.id, staff.email, staff.role);
const cookie = `tishgroup_control_session=${token}`;
const base = 'https://tishgroup-control.vercel.app';
const results = [];

for (const check of CHECKS) {
  const business = await prisma.business.findFirst({
    where: { name: { startsWith: check.namePrefix } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true },
  });
  if (!business) {
    results.push({ scenario: check.namePrefix, status: 'NOT_FOUND' });
    continue;
  }

  const res = await fetch(`${base}/businesses/${business.id}?tab=billing`, { headers: { Cookie: cookie } });
  const html = await res.text();
  const missing = check.mustInclude.filter((text) => !html.includes(text));
  const profile = await prisma.controlBusinessProfile.findUnique({
    where: { businessId: business.id },
    select: { subscription: { select: { billingCadence: true, monthlyValuePence: true, outstandingAmountPence: true } } },
  });

  results.push({
    scenario: check.namePrefix,
    status: res.status === 200 && missing.length === 0 ? 'PASS' : 'FAIL',
    businessId: business.id,
    missing,
    controlCadence: profile?.subscription?.billingCadence ?? null,
    controlMonthlyValue: profile?.subscription?.monthlyValuePence ?? null,
    expectedCollectionGhs: check.expectedCollectionGhs,
  });
}

console.log(JSON.stringify({ results }, null, 2));
await prisma.$disconnect();
