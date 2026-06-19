/**
 * 1) Verify Control storefront copy lines for Starter / Growth / Growth+addon / Pro.
 * 2) Cancel the two postfix verification businesses via the real Control UI.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

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

const secret = process.env.CONTROL_SESSION_SECRET?.trim() || process.env.CONTROL_PLANE_ACCESS_KEY?.trim();
const adminEmail = process.env.CONTROL_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const prisma = new PrismaClient();

const staff = await prisma.controlStaff.findUnique({ where: { email: adminEmail } });
const payload = { staffId: staff.id, email: staff.email, role: staff.role, exp: Math.floor(Date.now() / 1000) + 3600 };
const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
const signature = createHmac('sha256', secret).update(body).digest('base64url');
const token = `${body}.${signature}`;
const base = 'https://tishgroup-control.vercel.app';
const cookie = `tishgroup_control_session=${token}`;

// --- 1) Copy verification --------------------------------------------------
const COPY_CHECKS = [
  { namePrefix: 'Smoke Starter Monthly', mustInclude: ['Storefront: Not available'] },
  { namePrefix: 'Smoke Growth Monthly', mustInclude: ['Storefront: Not selected'] },
  { namePrefix: 'Smoke Growth Addon Monthly', mustInclude: ['Storefront: Add-on selected (+GHS 200/month)'] },
  { namePrefix: 'Smoke Pro Monthly', mustInclude: ['Storefront: Included'] },
];

const copyResults = [];
for (const check of COPY_CHECKS) {
  const business = await prisma.business.findFirst({
    where: { name: { startsWith: check.namePrefix } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true },
  });
  if (!business) {
    copyResults.push({ scenario: check.namePrefix, status: 'NOT_FOUND' });
    continue;
  }
  const res = await fetch(`${base}/businesses/${business.id}?tab=billing`, { headers: { Cookie: cookie } });
  const html = await res.text();
  const missing = check.mustInclude.filter((text) => !html.includes(text));
  copyResults.push({
    scenario: check.namePrefix,
    status: res.status === 200 && missing.length === 0 ? 'PASS' : 'FAIL',
    missing,
  });
}
console.log(JSON.stringify({ copyResults }, null, 2));

// --- 2) Cleanup: cancel postfix verification businesses via Control UI -----
const toCancel = await prisma.business.findMany({
  where: { name: { startsWith: 'Smoke Postfix ' } },
  select: { id: true, name: true, planStatus: true },
});

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies([
  {
    name: 'tishgroup_control_session',
    value: token,
    domain: 'tishgroup-control.vercel.app',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  },
]);
const page = await context.newPage();
page.on('dialog', (dialog) => dialog.accept());

const cleanupResults = [];
for (const business of toCancel) {
  try {
    await page.goto(`${base}/businesses/${business.id}?tab=billing`, { waitUntil: 'networkidle' });
    const statusSelect = page.locator('select[name="status"]:visible').first();
    await statusSelect.waitFor({ state: 'visible' });
    await statusSelect.selectOption('INACTIVE');
    await page.locator('button:visible', { hasText: 'Save subscription state' }).first().click();
    await page.waitForURL(/updated=/, { timeout: 60000 });
    cleanupResults.push({ business: business.name, id: business.id, status: 'CANCELLED_OK' });
  } catch (error) {
    cleanupResults.push({ business: business.name, id: business.id, status: 'FAILED', error: String(error).slice(0, 200) });
  }
}
await browser.close();

const after = await prisma.business.findMany({
  where: { name: { startsWith: 'Smoke Postfix ' } },
  select: { name: true, planStatus: true, subscriptionStatus: true, cancelledAt: true },
});

console.log(JSON.stringify({ cleanupResults, after }, null, 2));
await prisma.$disconnect();
