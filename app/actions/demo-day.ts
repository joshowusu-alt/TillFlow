'use server';

import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const DEMO_TAG = 'DEMO_DAY';

/** Simple cuid-like ID generator for pre-generating IDs in createMany batches */
function genId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  const rand2 = Math.random().toString(36).slice(2, 6);
  return `dm${ts}${rand}${rand2}`;
}

/**
 * Generate a realistic week of demo transactions — sales, expenses — so that
 * the owner can see what TillFlow looks like when it's alive.  All records are
 * tagged with qaTag = 'DEMO_DAY' so they can be wiped cleanly.
 *
 * Uses createMany for bulk inserts to stay well within Vercel function timeouts.
 */
export async function generateDemoDay(): Promise<{ ok: boolean; salesCount: number; error?: string }> {
  const { user, business } = await requireBusiness(['OWNER']);

  if (business.hasDemoData) {
    return { ok: true, salesCount: 0, error: 'Demo data already generated. Wipe first to regenerate.' };
  }

  const store = await prisma.store.findFirst({
    where: { businessId: business.id },
    select: { id: true },
  });
  if (!store) return { ok: false, salesCount: 0, error: 'No store found.' };

  const till = await prisma.till.findFirst({
    where: { storeId: store.id, active: true },
    select: { id: true },
  });
  if (!till) return { ok: false, salesCount: 0, error: 'No active till found.' };

  // Gather existing products & accounts
  const products = await prisma.product.findMany({
    where: { businessId: business.id },
    include: {
      productUnits: { where: { isBaseUnit: true }, take: 1 },
    },
  });
  if (products.length === 0) {
    return { ok: false, salesCount: 0, error: 'Add at least one product first.' };
  }

  const customers = await prisma.customer.findMany({
    where: { businessId: business.id },
    select: { id: true, name: true },
    take: 5,
  });
  const walkIn = customers.find(c => c.name === 'Walk-in Customer') ?? customers[0];

  const expenseAccounts = await prisma.account.findMany({
    where: { businessId: business.id, type: 'EXPENSE' },
    select: { id: true, code: true, name: true },
    take: 5,
  });

  // Time helpers — spread transactions across the past 7 days
  const now = new Date();
  const dayMs = 1000 * 60 * 60 * 24;
  const randTime = (daysAgo: number) => {
    const base = now.getTime() - daysAgo * dayMs;
    const hourOffset = Math.floor(Math.random() * 10 + 7) * 60 * 60 * 1000; // 7am – 5pm
    const minOffset = Math.floor(Math.random() * 60) * 60 * 1000;
    return new Date(base + hourOffset + minOffset - 12 * 60 * 60 * 1000);
  };

  // Deterministic random using business id hash
  const seed = business.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  let rng = seed;
  const nextRand = () => { rng = (rng * 16807 + 11) % 2147483647; return (rng & 0x7fffffff) / 0x7fffffff; };
  const randInt = (min: number, max: number) => Math.floor(nextRand() * (max - min + 1)) + min;

  // Sales patterns — morning rush, mid-day, afternoon
  const salesPerDay = [5, 4, 6, 3, 5, 4, 3]; // 7 days, ~30 total
  let txNum = 1000;

  // ---------- Build all data in-memory first, then bulk-insert ----------
  const invoiceBatch: {
    id: string; businessId: string; storeId: string; tillId: string;
    cashierUserId: string; customerId: string | null; transactionNumber: string;
    paymentStatus: string; subtotalPence: number; vatPence: number;
    totalPence: number; grossMarginPence: number; cashReceivedPence: number;
    changeDuePence: number; qaTag: string; createdAt: Date;
  }[] = [];
  const lineBatch: {
    salesInvoiceId: string; productId: string; unitId: string;
    qtyBase: number; qtyInUnit: number; conversionToBase: number;
    unitPricePence: number; lineSubtotalPence: number; lineTotalPence: number;
    lineVatPence: number;
  }[] = [];
  const paymentBatch: {
    salesInvoiceId: string; method: string; amountPence: number;
  }[] = [];

  for (let day = 6; day >= 0; day--) {
    const count = salesPerDay[day];
    for (let s = 0; s < count; s++) {
      const invoiceId = genId();

      // Pick 1-4 random products per sale
      const lineCount = randInt(1, Math.min(4, products.length));
      const saleProducts = new Set<number>();
      while (saleProducts.size < lineCount) {
        saleProducts.add(Math.floor(nextRand() * products.length));
      }

      let subtotal = 0;
      let totalCost = 0;

      for (const idx of saleProducts) {
        const p = products[idx];
        const baseUnit = p.productUnits[0];
        if (!baseUnit) continue; // skip products without a base unit
        const qty = randInt(1, 3);
        const lineTotal = p.sellingPriceBasePence * qty;
        const lineCost = (p.defaultCostBasePence ?? 0) * qty;
        subtotal += lineTotal;
        totalCost += lineCost;
        lineBatch.push({
          salesInvoiceId: invoiceId,
          productId: p.id,
          unitId: baseUnit.unitId,
          qtyBase: qty,
          qtyInUnit: qty,
          unitPricePence: p.sellingPriceBasePence,
          lineTotalPence: lineTotal,
          lineSubtotalPence: lineTotal,
          lineVatPence: 0,
          conversionToBase: 1,
        });
      }

      // Ensure we have at least some amount (in case all products lacked base units)
      if (subtotal === 0) subtotal = 100;

      const createdAt = randTime(day);
      txNum++;
      const transactionNumber = `DEMO-${String(txNum).padStart(5, '0')}`;

      invoiceBatch.push({
        id: invoiceId,
        businessId: business.id,
        storeId: store.id,
        tillId: till.id,
        cashierUserId: user.id,
        customerId: walkIn?.id ?? null,
        transactionNumber,
        paymentStatus: 'PAID',
        subtotalPence: subtotal,
        vatPence: 0,
        totalPence: subtotal,
        grossMarginPence: subtotal - totalCost,
        cashReceivedPence: subtotal,
        changeDuePence: 0,
        qaTag: DEMO_TAG,
        createdAt,
      });

      paymentBatch.push({
        salesInvoiceId: invoiceId,
        method: nextRand() > 0.7 ? 'MOBILE_MONEY' : 'CASH',
        amountPence: subtotal,
      });
    }
  }

  // Demo expenses
  const expenseBatch: {
    businessId: string; storeId: string; userId: string; accountId: string;
    amountPence: number; paymentStatus: string; method: string;
    vendorName: string; notes: string; qaTag: string; createdAt: Date;
  }[] = [];

  if (expenseAccounts.length > 0) {
    const demoExpenses = [
      { name: 'Electricity bill', amount: randInt(8000, 15000), daysAgo: 5, acctName: 'Utilities' },
      { name: 'Shop rent (partial)', amount: randInt(30000, 50000), daysAgo: 6, acctName: 'Rent' },
      { name: 'Fuel for delivery', amount: randInt(3000, 6000), daysAgo: 3, acctName: 'Fuel & Transport' },
      { name: 'Cleaning supplies', amount: randInt(1000, 3000), daysAgo: 1, acctName: 'Operating Expenses' },
    ];
    for (const de of demoExpenses) {
      const acct = expenseAccounts.find(a => a.name === de.acctName) ?? expenseAccounts[0];
      expenseBatch.push({
        businessId: business.id,
        storeId: store.id,
        userId: user.id,
        accountId: acct.id,
        amountPence: de.amount,
        paymentStatus: 'PAID',
        method: 'CASH',
        vendorName: de.name,
        notes: `[Demo] ${de.name}`,
        qaTag: DEMO_TAG,
        createdAt: randTime(de.daysAgo),
      });
    }
  }

  try {
    // Bulk-insert in one transaction — only 5 DB calls instead of ~140
    await prisma.$transaction(async (tx) => {
      await tx.salesInvoice.createMany({ data: invoiceBatch });
      await tx.salesInvoiceLine.createMany({ data: lineBatch });
      await tx.salesPayment.createMany({ data: paymentBatch });
      if (expenseBatch.length > 0) {
        await tx.expense.createMany({ data: expenseBatch });
      }
      await tx.business.update({
        where: { id: business.id },
        data: { hasDemoData: true },
      });
    });

    revalidatePath('/', 'layout');
    return { ok: true, salesCount: salesPerDay.reduce((a, b) => a + b, 0) };
  } catch (err) {
    console.error('[demo-day] Failed to generate demo data:', err);
    const msg = err instanceof Error ? err.message : '';
    return { ok: false, salesCount: 0, error: `Failed to generate demo data.${msg ? ' ' + msg.slice(0, 120) : ''}` };
  }
}

/**
 * Wipe all demo-generated data (tagged DEMO_DAY) and reset the flag.
 */
export async function wipeDemoData(): Promise<{ ok: boolean; error?: string }> {
  const { business } = await requireBusiness(['OWNER']);

  if (!business.hasDemoData) {
    return { ok: true };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Delete in dependency order: payments → lines → invoices
      const demoInvoices = await tx.salesInvoice.findMany({
        where: { businessId: business.id, qaTag: DEMO_TAG },
        select: { id: true },
      });
      const invoiceIds = demoInvoices.map(i => i.id);

      if (invoiceIds.length > 0) {
        await tx.salesPayment.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } });
        await tx.salesInvoiceLine.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } });
        await tx.salesInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
      }

      // Delete demo expenses
      await tx.expense.deleteMany({ where: { businessId: business.id, qaTag: DEMO_TAG } });

      // Reset flag
      await tx.business.update({
        where: { id: business.id },
        data: { hasDemoData: false },
      });
    });

    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (err) {
    console.error('[demo-day] Failed to wipe demo data:', err);
    return { ok: false, error: 'Failed to wipe demo data.' };
  }
}
