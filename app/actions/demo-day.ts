'use server';

import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { revalidatePath, revalidateTag } from 'next/cache';
import { postJournalEntry, ensureChartOfAccounts, ACCOUNT_CODES } from '@/lib/accounting';

const DEMO_TAG = 'DEMO_DAY';
const SAMPLE_STOCK_ADJUSTMENT_REASONS = new Set([
  'QA risk threshold trigger',
  'Back room recount during dashboard preview',
]);

type InventoryRestoreLine = {
  productId: string;
  qtyBase: number;
};

function buildInventoryRestoreMap(lines: InventoryRestoreLine[]) {
  const inventoryRestores = new Map<string, number>();
  for (const line of lines) {
    inventoryRestores.set(line.productId, (inventoryRestores.get(line.productId) ?? 0) + line.qtyBase);
  }
  return inventoryRestores;
}

function accumulateInventoryRestore(inventoryRestores: Map<string, number>, productId: string, qtyBase: number) {
  inventoryRestores.set(productId, (inventoryRestores.get(productId) ?? 0) + qtyBase);
}

async function applyInventoryRestores(storeId: string | undefined, inventoryRestores: Map<string, number>) {
  if (!storeId || inventoryRestores.size === 0) return;

  await prisma.$transaction(
    Array.from(inventoryRestores.entries()).map(([productId, qtyBase]) =>
      prisma.inventoryBalance.upsert({
        where: { storeId_productId: { storeId, productId } },
        update: { qtyOnHandBase: { increment: qtyBase } },
        create: {
          storeId,
          productId,
          qtyOnHandBase: qtyBase,
          avgCostBasePence: 0,
        },
      })
    )
  );
}

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
    id: string; businessId: string; storeId: string; userId: string; accountId: string;
    amountPence: number; paymentStatus: string; method: string;
    vendorName: string; notes: string; qaTag: string; createdAt: Date;
  }[] = [];
  const expenseJournalInfo: { id: string; accountCode: string; amountPence: number; vendorName: string; createdAt: Date }[] = [];

  if (expenseAccounts.length > 0) {
    const demoExpenses = [
      { name: 'Electricity bill', amount: randInt(8000, 15000), daysAgo: 5, acctName: 'Utilities' },
      { name: 'Shop rent (partial)', amount: randInt(30000, 50000), daysAgo: 6, acctName: 'Rent' },
      { name: 'Fuel for delivery', amount: randInt(3000, 6000), daysAgo: 3, acctName: 'Fuel & Transport' },
      { name: 'Cleaning supplies', amount: randInt(1000, 3000), daysAgo: 1, acctName: 'Operating Expenses' },
    ];
    for (const de of demoExpenses) {
      const acct = expenseAccounts.find(a => a.name === de.acctName) ?? expenseAccounts[0];
      const expId = genId();
      const expCreatedAt = randTime(de.daysAgo);
      expenseBatch.push({
        id: expId,
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
        createdAt: expCreatedAt,
      });
      expenseJournalInfo.push({
        id: expId,
        accountCode: acct.code,
        amountPence: de.amount,
        vendorName: de.name,
        createdAt: expCreatedAt,
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

    // Post GL journal entries and update inventory OUTSIDE the main transaction
    // to avoid Neon interactive-transaction timeout (transaction kept minimal above).
    try {
      await ensureChartOfAccounts(business.id);
      const accounts = await prisma.account.findMany({
        where: { businessId: business.id },
        select: { id: true, code: true },
      });
      const accountMap = new Map(accounts.map(a => [a.code, a.id]));

      // Journal entries for each demo sale
      for (const invoice of invoiceBatch) {
        const costPence = invoice.totalPence - invoice.grossMarginPence;
        const payMethod = paymentBatch.find(p => p.salesInvoiceId === invoice.id)?.method;
        const cashCode = payMethod === 'MOBILE_MONEY' ? ACCOUNT_CODES.bank : ACCOUNT_CODES.cash;
        if (invoice.totalPence > 0) {
          await postJournalEntry({
            businessId: business.id,
            description: `Demo sale ${invoice.transactionNumber}`,
            referenceType: 'SALES_INVOICE',
            referenceId: invoice.id,
            entryDate: invoice.createdAt,
            lines: [
              { accountCode: cashCode, debitPence: invoice.totalPence },
              { accountCode: ACCOUNT_CODES.sales, creditPence: invoice.totalPence },
              ...(costPence > 0 ? [
                { accountCode: ACCOUNT_CODES.cogs, debitPence: costPence },
                { accountCode: ACCOUNT_CODES.inventory, creditPence: costPence },
              ] : []),
            ],
            accountMap,
          });
        }
      }

      // Journal entries for each demo expense
      for (const exp of expenseJournalInfo) {
        if (exp.amountPence > 0) {
          await postJournalEntry({
            businessId: business.id,
            description: `Demo expense: ${exp.vendorName}`,
            referenceType: 'EXPENSE',
            referenceId: exp.id,
            entryDate: exp.createdAt,
            lines: [
              { accountCode: exp.accountCode, debitPence: exp.amountPence },
              { accountCode: ACCOUNT_CODES.cash, creditPence: exp.amountPence },
            ],
            accountMap,
          });
        }
      }

      // Decrement inventory balances per product
      const inventoryDecrements = new Map<string, number>();
      for (const line of lineBatch) {
        inventoryDecrements.set(line.productId, (inventoryDecrements.get(line.productId) ?? 0) + line.qtyBase);
      }
      for (const [productId, qtyBase] of inventoryDecrements) {
        await prisma.inventoryBalance.upsert({
          where: { storeId_productId: { storeId: store.id, productId } },
          update: { qtyOnHandBase: { decrement: qtyBase } },
          create: { storeId: store.id, productId, qtyOnHandBase: -qtyBase },
        });
      }

    } catch (glErr) {
      console.error('[demo-day] GL/inventory post failed (non-fatal):', glErr);
    }

    revalidateTag(`readiness-${business.id}`);
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
    let demoStoreId: string | undefined;
    let inventoryRestores = new Map<string, number>();

    await prisma.$transaction(async (tx) => {
      // Delete in dependency order: payments → lines → invoices
      const demoInvoices = await tx.salesInvoice.findMany({
        where: { businessId: business.id, qaTag: DEMO_TAG },
        select: { id: true, storeId: true },
      });
      const invoiceIds = demoInvoices.map(i => i.id);
      demoStoreId = demoStoreId ?? demoInvoices[0]?.storeId;

      // Find demo expenses up-front so we can clean their journals
      const demoExpenses = await tx.expense.findMany({
        where: { businessId: business.id, qaTag: DEMO_TAG },
        select: { id: true },
      });
      const expenseIds = demoExpenses.map(e => e.id);

      if (invoiceIds.length > 0) {
        // Capture line quantities for inventory restoration before deletion
        const demoLines = await tx.salesInvoiceLine.findMany({
          where: { salesInvoiceId: { in: invoiceIds } },
          select: { productId: true, qtyBase: true },
        });
        demoStoreId = demoStoreId ?? demoInvoices[0]?.storeId;
        inventoryRestores = buildInventoryRestoreMap(demoLines);

        // Delete journal entries for demo sales (JournalLine cascades via schema)
        await tx.journalEntry.deleteMany({
          where: { referenceType: 'SALES_INVOICE', referenceId: { in: invoiceIds } },
        });
        await tx.salesPayment.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } });
        await tx.salesInvoiceLine.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } });
        await tx.salesInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
      }

      if (expenseIds.length > 0) {
        // Delete expense journal entries (JournalLine cascades via schema)
        await tx.journalEntry.deleteMany({
          where: { referenceType: 'EXPENSE', referenceId: { in: expenseIds } },
        });
        await tx.expense.deleteMany({ where: { id: { in: expenseIds } } });
      } else {
        // Fallback: no IDs to look up, just delete by tag (no journals to clean)
        await tx.expense.deleteMany({ where: { businessId: business.id, qaTag: DEMO_TAG } });
      }

      // Reset flag
      await tx.business.update({
        where: { id: business.id },
        data: { hasDemoData: false },
      });
    });

    await applyInventoryRestores(demoStoreId, inventoryRestores);

    revalidateTag(`readiness-${business.id}`);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (err) {
    console.error('[demo-day] Failed to wipe demo data:', err);
    return { ok: false, error: 'Failed to wipe demo data.' };
  }
}

// --- Registration-time demo product SKUs (from register.ts seedDemoData) ---
const DEMO_SKUS = [
  'CARN-001', 'COCA-001', 'MILO-001', 'SUGAR-001', 'RICE-001',
  'OIL-001', 'INDO-001', 'SOAP-001', 'CORB-001', 'COLG-001',
];
const DEMO_CUSTOMER_NAMES = ['Kofi Mensah', 'Ama Serwaa', 'Emmanuel Asante', 'Abena Pokua'];

/**
 * Clear ALL sample/demo data from a business — both Demo Day transactions
 * (tagged DEMO_DAY) AND registration-seeded products, categories, customers,
 * and supplier. Leaves chart of accounts, Walk-in Customer, and units intact.
 */
export async function clearSampleData(): Promise<{ ok: boolean; removed: string[]; error?: string }> {
  const { business } = await requireBusiness(['OWNER']);
  const removed: string[] = [];

  try {
    let demoStoreId: string | undefined;
    let inventoryRestores = new Map<string, number>();
    const deletedProductIds = new Set<string>();

    await prisma.$transaction(async (tx) => {
      // 1) Wipe Demo Day sales & expenses (same as wipeDemoData)
      if (business.hasDemoData) {
        const demoInvoices = await tx.salesInvoice.findMany({
          where: { businessId: business.id, qaTag: DEMO_TAG },
          select: { id: true, storeId: true },
        });
        const invoiceIds = demoInvoices.map(i => i.id);
        demoStoreId = demoStoreId ?? demoInvoices[0]?.storeId;
        const csaDemoExpenses = await tx.expense.findMany({
          where: { businessId: business.id, qaTag: DEMO_TAG },
          select: { id: true },
        });
        const csaExpenseIds = csaDemoExpenses.map(e => e.id);

        if (invoiceIds.length > 0) {
          // Capture line quantities for inventory restoration before deletion
          const demoLines = await tx.salesInvoiceLine.findMany({
            where: { salesInvoiceId: { in: invoiceIds } },
            select: { productId: true, qtyBase: true },
          });
          demoStoreId = demoStoreId ?? demoInvoices[0]?.storeId;
          inventoryRestores = buildInventoryRestoreMap(demoLines);
          await tx.journalEntry.deleteMany({
            where: { referenceType: 'SALES_INVOICE', referenceId: { in: invoiceIds } },
          });
          await tx.salesPayment.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } });
          await tx.salesInvoiceLine.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } });
          await tx.salesInvoice.deleteMany({ where: { id: { in: invoiceIds } } });
          removed.push(`${invoiceIds.length} demo sales`);
        }

        if (csaExpenseIds.length > 0) {
          await tx.journalEntry.deleteMany({
            where: { referenceType: 'EXPENSE', referenceId: { in: csaExpenseIds } },
          });
          await tx.expense.deleteMany({ where: { id: { in: csaExpenseIds } } });
        } else {
          await tx.expense.deleteMany({ where: { businessId: business.id, qaTag: DEMO_TAG } });
        }
        if (csaDemoExpenses.length > 0) removed.push(`${csaDemoExpenses.length} demo expenses`);
      }

      // 2) Delete registration-seeded demo products by SKU — but only if they
      //    have NO real (non-demo) sales referencing them.
      const demoProducts = await tx.product.findMany({
        where: { businessId: business.id, sku: { in: DEMO_SKUS } },
        select: { id: true, name: true },
      });
      if (demoProducts.length > 0) {
        // Check which products have real sales or purchases (non-demo)
        const allDemoProductIds = demoProducts.map(p => p.id);
        const [productsWithRealSales, productsWithPurchases] = await Promise.all([
          tx.salesInvoiceLine.findMany({
            where: {
              productId: { in: allDemoProductIds },
              salesInvoice: { qaTag: null },
            },
            select: { productId: true },
            distinct: ['productId'],
          }),
          tx.purchaseInvoiceLine.findMany({
            where: { productId: { in: allDemoProductIds } },
            select: { productId: true },
            distinct: ['productId'],
          }),
        ]);
        const realSaleProductIds = new Set([
          ...productsWithRealSales.map(p => p.productId),
          ...productsWithPurchases.map(p => p.productId),
        ]);

        // Only delete products that have NO real sales
        const safeToDelete = demoProducts.filter(p => !realSaleProductIds.has(p.id));
        const keptProducts = demoProducts.filter(p => realSaleProductIds.has(p.id));
        const sampleAdjustmentCandidates = await tx.stockAdjustment.findMany({
          where: {
            productId: { in: allDemoProductIds },
            OR: [
              { qaTag: { not: null } },
              { reason: { in: Array.from(SAMPLE_STOCK_ADJUSTMENT_REASONS) } },
            ],
          },
          select: { id: true, productId: true, qtyBase: true },
        });

        if (sampleAdjustmentCandidates.length > 0) {
          const sampleAdjustmentIds = sampleAdjustmentCandidates.map((adjustment) => adjustment.id);
          for (const adjustment of sampleAdjustmentCandidates) {
            accumulateInventoryRestore(inventoryRestores, adjustment.productId, -adjustment.qtyBase);
          }

          await tx.journalEntry.deleteMany({
            where: { referenceType: 'STOCK_ADJUSTMENT', referenceId: { in: sampleAdjustmentIds } },
          });
          await tx.stockMovement.deleteMany({
            where: { referenceType: 'STOCK_ADJUSTMENT', referenceId: { in: sampleAdjustmentIds } },
          });
          await tx.stockAdjustment.deleteMany({
            where: { id: { in: sampleAdjustmentIds } },
          });
          removed.push(`${sampleAdjustmentCandidates.length} sample stock adjustments`);
        }

        if (safeToDelete.length > 0) {
          const productIds = safeToDelete.map(p => p.id);
          productIds.forEach((productId) => deletedProductIds.add(productId));

          const stockAdjustmentIds = (await tx.stockAdjustment.findMany({
            where: { productId: { in: productIds } },
            select: { id: true },
          })).map((adjustment) => adjustment.id);

          // Must delete dependent records first (in safe order)
          await tx.salesInvoiceLine.deleteMany({
            where: { productId: { in: productIds }, salesInvoice: { qaTag: DEMO_TAG } },
          });
          await tx.inventoryBalance.deleteMany({ where: { productId: { in: productIds } } });
          await tx.productUnit.deleteMany({ where: { productId: { in: productIds } } });
          await tx.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
          if (stockAdjustmentIds.length > 0) {
            await tx.journalEntry.deleteMany({
              where: { referenceType: 'STOCK_ADJUSTMENT', referenceId: { in: stockAdjustmentIds } },
            });
          }
          await tx.stockAdjustment.deleteMany({ where: { productId: { in: productIds } } });
          await tx.purchaseInvoiceLine.deleteMany({ where: { productId: { in: productIds } } });
          await tx.stocktakeLine.deleteMany({ where: { productId: { in: productIds } } });
          await tx.stockTransferLine.deleteMany({ where: { productId: { in: productIds } } });
          await tx.reorderAction.deleteMany({ where: { productId: { in: productIds } } });
          await tx.product.deleteMany({ where: { id: { in: productIds } } });
          removed.push(`${safeToDelete.length} sample products`);
        }
        if (keptProducts.length > 0) {
          removed.push(`${keptProducts.length} sample products kept (have real sales)`);
        }
      }

      // 3) Delete demo categories that no longer have any products
      const demoCategories = await tx.category.findMany({
        where: { businessId: business.id },
        select: { id: true, name: true, _count: { select: { products: true } } },
      });
      const emptyCategories = demoCategories.filter(c => c._count.products === 0);
      if (emptyCategories.length > 0) {
        await tx.category.deleteMany({
          where: { id: { in: emptyCategories.map(c => c.id) } },
        });
        removed.push(`${emptyCategories.length} empty categories`);
      }

      // 4) Delete demo customers (keep Walk-in)
      const custDel = await tx.customer.deleteMany({
        where: { businessId: business.id, name: { in: DEMO_CUSTOMER_NAMES } },
      });
      if (custDel.count > 0) removed.push(`${custDel.count} sample customers`);

      // 5) Delete the seeded sample supplier if no purchase invoices reference it
      const defaultSupplier = await tx.supplier.findFirst({
        where: { businessId: business.id, name: 'Makola Wholesale' },
        select: { id: true, _count: { select: { purchaseInvoices: true } } },
      });
      if (defaultSupplier && defaultSupplier._count.purchaseInvoices === 0) {
        await tx.supplier.delete({ where: { id: defaultSupplier.id } });
        removed.push('sample supplier');
      }

      // 6) Reset demo data flag
      await tx.business.update({
        where: { id: business.id },
        data: { hasDemoData: false },
      });
    });

    if (deletedProductIds.size > 0 && inventoryRestores.size > 0) {
      inventoryRestores = new Map(
        Array.from(inventoryRestores.entries()).filter(([productId]) => !deletedProductIds.has(productId))
      );
    }

    await applyInventoryRestores(demoStoreId, inventoryRestores);

    revalidateTag(`readiness-${business.id}`);
    revalidatePath('/', 'layout');
    return { ok: true, removed };
  } catch (err) {
    console.error('[demo-day] Failed to clear sample data:', err);
    const msg = err instanceof Error ? err.message : '';
    return { ok: false, removed, error: `Failed to clear sample data.${msg ? ' ' + msg.slice(0, 120) : ''}` };
  }
}
