import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

/**
 * GET /api/seed-once
 * Idempotent seed endpoint — creates the demo business, store, users, and
 * products only if they don't already exist.  Safe to call multiple times.
 *
 * Protected by a simple token check (SEED_SECRET env var or hardcoded fallback).
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Block entirely in production unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && !process.env.SEED_ENABLED) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const SEED_TOKEN = process.env.SEED_SECRET;
  if (!SEED_TOKEN) {
    return NextResponse.json({ error: 'SEED_SECRET env var not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (token !== SEED_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const results: string[] = [];

    // 1. Business
    let business = await prisma.business.findFirst();
    if (!business) {
      business = await prisma.business.create({
        data: {
          name: 'Supermarket Demo',
          currency: 'GHS',
          vatEnabled: false,
          mode: 'SIMPLE',
          openingCapitalPence: 2000000,
        },
      });
      results.push('Created business');
    } else {
      results.push('Business already exists');
    }

    // 2. Store
    let store = await prisma.store.findFirst({ where: { businessId: business.id } });
    if (!store) {
      store = await prisma.store.create({
        data: { businessId: business.id, name: 'Main Store', address: 'High Street' },
      });
      results.push('Created store');
    } else {
      results.push('Store already exists');
    }

    // 3. Organization
    let org = await (prisma as any).organization.findUnique({ where: { businessId: business.id } }).catch(() => null);
    if (!org) {
      org = await (prisma as any).organization.create({
        data: { businessId: business.id, name: `${business.name} Organization` },
      }).catch(() => null);
      results.push(org ? 'Created organization' : 'Skipped organization');
    } else {
      results.push('Organization already exists');
    }

    // 4. Branch
    if (org) {
      const existingBranch = await prisma.branch.findFirst({
        where: { businessId: business.id, storeId: store.id },
      });
      if (!existingBranch) {
        await prisma.branch.create({
          data: {
            businessId: business.id,
            organizationId: org.id,
            storeId: store.id,
            code: 'MAIN01',
            name: store.name,
          },
        });
        results.push('Created branch');
      } else {
        results.push('Branch already exists');
      }
    }

    // 5. Tills
    const tills = await prisma.till.findMany({ where: { storeId: store.id } });
    if (tills.length === 0) {
      await prisma.till.createMany({
        data: [
          { storeId: store.id, name: 'Till 1' },
          { storeId: store.id, name: 'Till 2' },
        ],
      });
      results.push('Created tills');
    } else {
      results.push('Tills already exist');
    }

    // 6. Users
    const ownerPasswordHash = await bcrypt.hash('Pass1234!', 10);
    const cashierPasswordHash = await bcrypt.hash('Pass1234!', 10);
    const ownerPinHash = await bcrypt.hash('1234', 10);

    await prisma.user.upsert({
      where: { email: 'owner@store.com' },
      update: { approvalPinHash: ownerPinHash, passwordHash: ownerPasswordHash },
      create: {
        businessId: business.id,
        name: 'Owner',
        email: 'owner@store.com',
        passwordHash: ownerPasswordHash,
        approvalPinHash: ownerPinHash,
        role: 'OWNER',
      },
    });
    results.push('Upserted owner user');

    await prisma.user.upsert({
      where: { email: 'cashier@store.com' },
      update: { passwordHash: cashierPasswordHash },
      create: {
        businessId: business.id,
        name: 'Cashier',
        email: 'cashier@store.com',
        passwordHash: cashierPasswordHash,
        role: 'CASHIER',
      },
    });
    results.push('Upserted cashier user');

    // 7. Units
    const unitData = [
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
    for (const u of unitData) {
      const existing = await prisma.unit.findFirst({ where: { name: u.name } });
      if (!existing) {
        await prisma.unit.create({ data: u });
      }
    }
    results.push('Seeded units');

    // 8. Accounts (basic chart of accounts)
    const accountData = [
      { code: '1000', name: 'Cash', type: 'ASSET' },
      { code: '1100', name: 'Bank', type: 'ASSET' },
      { code: '1200', name: 'Inventory', type: 'ASSET' },
      { code: '1300', name: 'Mobile Money', type: 'ASSET' },
      { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
      { code: '3000', name: 'Owner Equity', type: 'EQUITY' },
      { code: '4000', name: 'Sales Revenue', type: 'REVENUE' },
      { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
      { code: '5100', name: 'Operating Expenses', type: 'EXPENSE' },
      { code: '5200', name: 'VAT Collected', type: 'LIABILITY' },
    ];
    for (const a of accountData) {
      const existing = await prisma.account.findFirst({
        where: { businessId: business.id, code: a.code },
      });
      if (!existing) {
        await prisma.account.create({
          data: { businessId: business.id, ...a },
        });
      }
    }
    results.push('Seeded accounts');

    return NextResponse.json({
      status: 'ok',
      message: 'Seed completed',
      results,
    });
  } catch (error: any) {
    console.error('[seed-once] Error:', error);
    return NextResponse.json(
      { error: 'seed_failed', message: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
