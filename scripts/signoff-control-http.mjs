/**
 * Verify Control production routes with a signed session (no secrets logged).
 */
import { createHmac } from 'node:crypto';
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

if (!secret || !email) {
  console.log(JSON.stringify({ error: 'MISSING_ENV' }));
  process.exit(1);
}

const prisma = new PrismaClient();
const staff = await prisma.controlStaff.findUnique({ where: { email } });
if (!staff?.active) {
  console.log(JSON.stringify({ error: 'NO_STAFF', email }));
  await prisma.$disconnect();
  process.exit(1);
}

function encodeSession(staffId, staffEmail, role) {
  const payload = {
    staffId,
    email: staffEmail,
    role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

const token = encodeSession(staff.id, staff.email, staff.role);
const cookie = `tishgroup_control_session=${token}`;
const base = 'https://tishgroup-control.vercel.app';
const routes = [
  '/command/scale',
  '/command/digest',
  '/command/support',
  '/command/referrals',
  '/command/templates',
  '/command/guides',
];

const results = [];
for (const route of routes) {
  const res = await fetch(`${base}${route}`, {
    redirect: 'manual',
    headers: { Cookie: cookie },
  });
  const loc = res.headers.get('location') ?? '';
  const html = res.status < 400 ? await res.text() : '';
  const isLogin = loc.includes('/login') || html.includes('Access Tish Group Control');
  const hasScale = html.includes('Scale Cockpit') || html.includes('scale-cockpit');
  const hasDigest = html.includes('Digest') || html.includes('digest');
  const hasSupport = html.includes('Support') || route.includes('support');
  results.push({
    route,
    status: res.status,
    redirectedToLogin: isLogin,
    ok: res.status === 200 && !isLogin,
    snippet: isLogin ? 'login' : html.slice(0, 200).replace(/\s+/g, ' '),
  });
}

// Adom Test Mart on Scale
const scaleRes = await fetch(`${base}/command/scale`, { headers: { Cookie: cookie } });
const scaleHtml = await scaleRes.text();
const adomIdx = scaleHtml.indexOf('Adom Test Mart');
const adomSlice = adomIdx >= 0 ? scaleHtml.slice(adomIdx, adomIdx + 2500) : '';
const pctMatches = [...adomSlice.matchAll(/(\d{1,3})\s*%/g)].map((m) => m[1]);
const adomPct = pctMatches[0] ?? null;

const business = await prisma.business.findFirst({
  where: { name: 'Adom Test Mart' },
  orderBy: { createdAt: 'desc' },
  select: { setupProgressPct: true },
});
let profile = null;
if (business?.id) {
  profile = await prisma.controlBusinessProfile.findUnique({
    where: { businessId: business.id },
    select: { activationScore: true },
  });
}

console.log(
  JSON.stringify(
    {
      staffEmail: email,
      routes: results,
      allRoutesOk: results.every((r) => r.ok),
      adomSetupPctOnScale: adomPct,
      dbSetupProgressPct: business?.setupProgressPct ?? null,
      profileActivationScore: profile?.activationScore ?? null,
    },
    null,
    2
  )
);

await prisma.$disconnect();
