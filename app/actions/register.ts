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

  const rawPlan = String(formData.get('plan') || 'STARTER').toUpperCase();
  const rawAddonSelected = formData.get('addonOnlineStorefront') === 'on';
  const { plan, addonOnlineStorefront } = resolveRegisterPlanSelection(rawPlan, rawAddonSelected);

  // Validation
  if (!businessName || !ownerName || !email || !password) {
    redirect('/register?error=missing');
  }
  if (password.length < 6) {
    redirect('/register?error=weak');
  }

  // Check if email already taken
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect('/register?error=exists');
  }

  // Create Business → Store → Till → Owner (all in one transaction)
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: businessName,
        currency,
        ...createTrialSubscription(plan, { addonOnlineStorefront }),
        vatEnabled: false,
        mode: 'SIMPLE',
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
      },
    });

    return { business, store, owner };
  });

  await ensureControlPlaneBusinessBootstrap(prisma as any, {
    businessId: result.business.id,
    ownerName,
    ownerEmail: result.owner.email,
    plan: result.business.plan,
    addonOnlineStorefront: result.business.addonOnlineStorefront,
    status: result.business.subscriptionStatus ?? result.business.planStatus,
    supportStatus: 'UNREVIEWED',
    notes: 'Awaiting first Tishgroup commercial review after signup.',
    startedAt: result.business.planSetAt,
    referralSource,
    referredByName,
    referredByPhone,
    sourceChannel,
    referralStatus: 'TRIAL_STARTED',
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
  await seedEssentials(result.business.id);

  // Auto-login
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  await prisma.session.create({
    data: { token, userId: result.owner.id, expiresAt },
  });
  const cookieStore = cookies();
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
async function seedEssentials(businessId: string) {
  try {
    // Units (global / shared) — create if missing
    const existingUnits = await prisma.unit.findMany();
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
      await prisma.unit.createMany({ data: missingUnits });
    }

    // Chart of Accounts — required for accounting to work
    await prisma.account.createMany({
      data: [
        { businessId, code: '1000', name: 'Cash on Hand', type: 'ASSET' },
        { businessId, code: '1010', name: 'Bank', type: 'ASSET' },
        { businessId, code: '1100', name: 'Accounts Receivable', type: 'ASSET' },
        { businessId, code: '1200', name: 'Inventory', type: 'ASSET' },
        { businessId, code: '1300', name: 'VAT Receivable', type: 'ASSET' },
        { businessId, code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
        { businessId, code: '2100', name: 'VAT Payable', type: 'LIABILITY' },
        { businessId, code: '3000', name: 'Retained Earnings', type: 'EQUITY' },
        { businessId, code: '4000', name: 'Sales Revenue', type: 'INCOME' },
        { businessId, code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
        { businessId, code: '6000', name: 'Operating Expenses', type: 'EXPENSE' },
        { businessId, code: '6100', name: 'Rent', type: 'EXPENSE' },
        { businessId, code: '6200', name: 'Utilities', type: 'EXPENSE' },
        { businessId, code: '6300', name: 'Salaries', type: 'EXPENSE' },
        { businessId, code: '6400', name: 'Repairs & Maintenance', type: 'EXPENSE' },
        { businessId, code: '6500', name: 'Fuel & Transport', type: 'EXPENSE' },
        { businessId, code: '6600', name: 'Marketing', type: 'EXPENSE' },
      ],
    });

    // Default walk-in customer
    await prisma.customer.create({
      data: { businessId, name: 'Walk-in Customer' },
    });

    console.log(`[register] Essentials seeded for business ${businessId}`);
  } catch (err) {
    console.error('[register] Failed to seed essentials:', err);
  }
}
