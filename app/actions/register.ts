'use server';

import { cookies } from 'next/headers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkRegisterRateLimit } from '@/lib/security/register-throttle';
import { ACTIVE_BUSINESS_COOKIE, getBusinessSessionCookieName } from '@/lib/business-scope';
import { ensureControlPlaneBusinessBootstrap } from '@/lib/control-plane-bootstrap';
import { resolveRegisterPlanSelection } from '@/lib/plan-pricing';
import { createTrialSubscription } from '@/lib/subscription-lifecycle';
import { enqueueSubscriptionReminder } from '@/lib/subscription-reminders';
import { CHART_OF_ACCOUNTS } from '@/lib/accounting';
import { isValidRegisterEmail, REGISTER_CURRENCIES } from '@/lib/register/advance';
import { resolveRegisterQaTag } from '@/lib/reliability/preview-qa-tag';

/**
 * Self-service registration: creates a new Business, Store, Till, and OWNER user.
 * Then seeds only the essentials needed for a clean business setup.
 */
export async function register(formData: FormData) {
  // Rate limit by IP
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const throttle = await checkRegisterRateLimit(ip);
  if (throttle.blocked) {
    redirect('/register?error=throttled');
  }

  const businessName = String(formData.get('businessName') || '').trim();
  const ownerName = String(formData.get('ownerName') || '').trim();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const password = String(formData.get('password') || '');
  const currency = String(formData.get('currency') || 'GHS');
  const referralSource = String(formData.get('referralSource') || '').trim() || null;
  const referredByName = String(formData.get('referredByName') || '').trim() || null;
  const referredByPhone = String(formData.get('referredByPhone') || '').trim() || null;
  const sourceChannel = String(formData.get('sourceChannel') || 'INBOUND').trim() || 'INBOUND';
  const qaTag = resolveRegisterQaTag({
    vercelEnv: process.env.VERCEL_ENV,
    requestedTag: String(formData.get('qaTag') || '').trim(),
  });

  const rawPlan = String(formData.get('plan') || 'STARTER').toUpperCase();
  const rawAddonSelected = formData.get('addonOnlineStorefront') === 'on';
  const rawBillingInterval = String(formData.get('billingInterval') || 'MONTHLY');
  const { plan, addonOnlineStorefront, billingInterval } = resolveRegisterPlanSelection(
    rawPlan,
    rawAddonSelected,
    rawBillingInterval,
  );

  // Validation
  if (!businessName || !ownerName || !email || !password) {
    redirect('/register?error=missing');
  }
  if (password.length < 6) {
    redirect('/register?error=weak');
  }

  if (!isValidRegisterEmail(email) || businessName.length > 120 || ownerName.length > 120 || !REGISTER_CURRENCIES.includes(currency)) {
    redirect('/register?error=invalid');
  }

  // Check if email already taken
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect('/register?error=exists');
  }

  // Create Business → Store → Till → Owner (all in one transaction)
  const passwordHash = await bcrypt.hash(password, 10);

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: businessName,
        currency,
        ...createTrialSubscription(plan, { addonOnlineStorefront, billingInterval }),
        vatEnabled: false,
        mode: 'SIMPLE',
        requireOpenTillForSales: true,
      },
    });

    const store = await tx.store.create({
      data: {
        businessId: business.id,
        name: 'Main Branch',
      },
    });

    await tx.till.createMany({
      data: [
        { storeId: store.id, name: 'Till 1' },
        { storeId: store.id, name: 'Till 2' },
      ],
    });

    const owner = await tx.user.create({
      data: {
        businessId: business.id,
        name: ownerName,
        email,
        passwordHash,
        role: 'OWNER',
        ...(qaTag ? { qaTag } : {}),
      },
    });

    // Required setup must succeed before the business can be committed.
    await seedEssentials(tx, business.id);
    await ensureControlPlaneBusinessBootstrap(tx as any, {
      businessId: business.id,
      ownerName,
      ownerEmail: owner.email,
      plan: business.plan,
      addonOnlineStorefront: business.addonOnlineStorefront,
      billingCadence: business.billingInterval,
      status: business.subscriptionStatus ?? business.planStatus,
      supportStatus: 'UNREVIEWED',
      notes: 'Awaiting first Tishgroup commercial review after signup.',
      startedAt: business.planSetAt,
      referralSource,
      referredByName,
      referredByPhone,
      sourceChannel,
      referralStatus: 'TRIAL_STARTED',
    });

    await tx.session.create({ data: { token, userId: owner.id, expiresAt } });
    return { business, store, owner };
  }, { timeout: 30_000 }).catch((error: unknown) => {
    // Two requests can pass the precheck together; the unique constraint wins.
    const conflict = error as { code?: string; meta?: { target?: string | string[] } };
    const target = conflict?.meta?.target;
    if (conflict?.code === 'P2002' && (Array.isArray(target) ? target.includes('email') : target?.includes('email'))) {
      redirect('/register?error=exists');
    }
    throw error;
  });

  await enqueueSubscriptionReminder(
    {
      id: result.business.id,
      name: result.business.name,
      phone: null,
      plan: result.business.plan,
      selectedPlan: result.business.selectedPlan,
      planStatus: result.business.planStatus,
      subscriptionStatus: result.business.subscriptionStatus,
      trialStartedAt: result.business.trialStartedAt,
      trialEndsAt: result.business.trialEndsAt,
      billingInterval: result.business.billingInterval,
    },
    'SUBSCRIPTION_TRIAL_STARTED',
  ).catch((error) => {
    console.warn('[register] subscription trial SMS enqueue skipped', error);
  });

  // Registration always creates a clean business. The public demo is a separate
  // read-only fixture under /demo and does not write seeded demo data here.

  // Session was committed atomically with the new business.
  const cookieStore = await cookies();
  cookieStore.set(getBusinessSessionCookieName(result.business.id), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  cookieStore.set(ACTIVE_BUSINESS_COOKIE, result.business.id, {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  redirect('/getting-started');
}

// ---------------------------------------------------------------------------
// Essentials seeder — only chart of accounts and units (for fresh businesses)
// ---------------------------------------------------------------------------
async function seedEssentials(tx: import('@prisma/client').Prisma.TransactionClient, businessId: string) {
    // Units (global / shared) — create if missing
    const existingUnits = await tx.unit.findMany();
    const unitNames = new Set(existingUnits.map(u => u.name));

    const unitDefs = [
      { name: 'piece', pluralName: 'pieces', symbol: 'pc' },
      { name: 'carton', pluralName: 'cartons', symbol: 'ctn' },
      { name: 'bottle', pluralName: 'bottles', symbol: 'btl' },
      { name: 'pack', pluralName: 'packs', symbol: 'pk' },
      { name: 'bag', pluralName: 'bags', symbol: 'bag' },
      { name: 'box', pluralName: 'boxes', symbol: 'bx' },
      { name: 'sachet', pluralName: 'sachets', symbol: 'sct' },
      { name: 'tin', pluralName: 'tins', symbol: 'tin' },
      { name: 'crate', pluralName: 'crates', symbol: 'crt' },
    ];

    const missingUnits = unitDefs.filter(u => !unitNames.has(u.name));
    if (missingUnits.length > 0) {
      await tx.unit.createMany({ data: missingUnits });
    }

    await tx.account.createMany({
      data: CHART_OF_ACCOUNTS.map(account => ({ businessId, ...account })),
    });

    // Default walk-in customer
    await tx.customer.create({
      data: { businessId, name: 'Walk-in Customer' },
    });

    console.log(`[register] Essentials seeded for business ${businessId}`);
}
