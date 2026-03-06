import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry, ensureChartOfAccounts } from '@/lib/accounting';
import {
  filterPositivePayments,
  splitPayments,
  derivePaymentStatus,
  creditCashBankLines,
  type PaymentInput,
  type JournalLine
} from './shared';
import { fetchInventoryMap, incrementInventoryBalance } from './shared';

export type PurchasePaymentInput = PaymentInput;

export type PurchaseLineInput = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
  unitCostPence?: number | null;
};

export type CreatePurchaseInput = {
  businessId: string;
  storeId: string;
  supplierId?: string | null;
  paymentStatus: 'PAID' | 'PART_PAID' | 'UNPAID';
  dueDate?: Date | null;
  payments: PurchasePaymentInput[];
  lines: PurchaseLineInput[];
  userId?: string | null;
};

export async function createPurchase(input: CreatePurchaseInput, db?: any) {
  if (!input.lines.length) {
    throw new Error('No items in purchase');
  }

  // ── SINGLE BATCH: fire all validation lookups in parallel ──
  // Business and store checks are stable reads; productUnits MUST use the
  // active transaction (if any) so newly-created products/units are visible
  // before the outer tx commits.
  const dbClient = (db ?? prisma) as typeof prisma;
  const [business, store, supplier, productUnits] = await Promise.all([
    prisma.business.findUnique({ where: { id: input.businessId } }),
    prisma.store.findFirst({
      where: { id: input.storeId, businessId: input.businessId },
      select: { id: true },
    }),
    input.supplierId
      ? prisma.supplier.findFirst({
          where: { id: input.supplierId, businessId: input.businessId },
          select: { id: true },
        })
      : Promise.resolve(null),
    dbClient.productUnit.findMany({
      where: {
        product: { businessId: input.businessId },
        productId: { in: [...new Set(input.lines.map((l) => l.productId))] },
      },
      include: { product: true, unit: true }
    }),
  ]);

  if (!business) throw new Error('Business not found');
  if (!store) throw new Error('Store not found');
  if (input.supplierId && !supplier) throw new Error('Supplier not found');

  const unitMap = new Map(productUnits.map((pu) => [`${pu.productId}:${pu.unitId}`, pu]));
  // Fallback map keyed by productId only (base unit, conversionToBase=1).
  // Used when the exact productId:unitId match is missing — e.g. existing
  // products whose DB unit ID was created in a prior import session.
  const baseUnitFallbackMap = new Map<string, typeof productUnits[0]>();
  for (const pu of productUnits) {
    if (pu.conversionToBase === 1 && !baseUnitFallbackMap.has(pu.productId)) {
      baseUnitFallbackMap.set(pu.productId, pu);
    }
  }

  const lineDetails = input.lines.map((line) => {
    if (line.qtyInUnit <= 0) {
      throw new Error('Quantity must be at least 1');
    }
    const productUnit =
      unitMap.get(`${line.productId}:${line.unitId}`) ??
      baseUnitFallbackMap.get(line.productId);
    if (!productUnit) throw new Error('Unit not configured for product');
    const qtyBase = line.qtyInUnit * productUnit.conversionToBase;
    const unitCostPence =
      line.unitCostPence ?? productUnit.product.defaultCostBasePence * productUnit.conversionToBase;
    const unitCostBasePence = Math.round(unitCostPence / productUnit.conversionToBase);
    const lineSubtotal = unitCostPence * line.qtyInUnit;
    const vatRate = business.vatEnabled ? productUnit.product.vatRateBps : 0;
    const lineVat = business.vatEnabled ? Math.round((lineSubtotal * vatRate) / 10000) : 0;
    const lineTotal = lineSubtotal + lineVat;
    return {
      ...line,
      productUnit,
      qtyBase,
      unitCostPence,
      unitCostBasePence,
      lineSubtotal,
      lineVat,
      lineTotal
    };
  });

  const positivePayments = filterPositivePayments(input.payments);
  const subtotal = lineDetails.reduce((sum, line) => sum + line.lineSubtotal, 0);
  const vatTotal = lineDetails.reduce((sum, line) => sum + line.lineVat, 0);
  const total = subtotal + vatTotal;

  const payments =
    positivePayments.length === 0 && input.paymentStatus === 'PAID'
      ? [{ method: 'CASH' as const, amountPence: total }]
      : positivePayments;
  const totalPaid = payments.reduce((sum, p) => sum + p.amountPence, 0);
  if (totalPaid > total) {
    throw new Error('Payment exceeds total due');
  }
  const finalStatus = derivePaymentStatus(total, totalPaid);

  const productTotals = new Map<
    string,
    { qtyBase: number; costPence: number; defaultCostBasePence: number }
  >();
  for (const line of lineDetails) {
    const existing =
      productTotals.get(line.productId) ?? {
        qtyBase: 0,
        costPence: 0,
        defaultCostBasePence: line.productUnit.product.defaultCostBasePence
      };
    existing.qtyBase += line.qtyBase;
    existing.costPence += line.lineSubtotal;
    productTotals.set(line.productId, existing);
  }

  const split = splitPayments(payments);
  const apAmount = total - split.totalPence;

  const journalLines: JournalLine[] = [
    { accountCode: ACCOUNT_CODES.inventory, debitPence: subtotal },
    business.vatEnabled && vatTotal > 0
      ? { accountCode: ACCOUNT_CODES.vatReceivable, debitPence: vatTotal }
      : null,
    ...creditCashBankLines(split),
    apAmount > 0 ? { accountCode: ACCOUNT_CODES.ap, creditPence: apAmount } : null
  ].filter(Boolean) as JournalLine[];

  // Pre-fetch GL account IDs OUTSIDE the transaction.
  // ensureChartOfAccounts must never run inside $transaction on libSQL/Turso
  // because it issues multiple writes and only one write is allowed at a time —
  // running it inside the tx causes SQLITE_BUSY which becomes the generic error.
  const glAccountCodes = journalLines.map((l) => l.accountCode);
  let glAccountRows = await prisma.account.findMany({
    where: { businessId: input.businessId, code: { in: glAccountCodes } },
    select: { id: true, code: true },
  });
  if (glAccountRows.length < glAccountCodes.filter((c, i, a) => a.indexOf(c) === i).length) {
    await ensureChartOfAccounts(input.businessId);
    glAccountRows = await prisma.account.findMany({
      where: { businessId: input.businessId, code: { in: glAccountCodes } },
      select: { id: true, code: true },
    });
  }
  const preloadedAccountMap = new Map(glAccountRows.map((a) => [a.code, a.id]));

  // ── Create invoice + lines + payments + GL entry ────────────────────────
  // Key constraint: libSQL/Turso interactive $transaction has a ~5 s timeout.
  // Nested `lines: { create: [...150] }` inside a $transaction generates
  // 150 sequential round-trips (150 × 30 ms RTT = 4.5 s) — right at the limit.
  //
  // Solution: avoid $transaction for the normal path. Use createMany for all
  // child records — each createMany is ONE SQL INSERT statement = 1 RTT.
  // For inventory: use array-form $transaction([...ops]) which sends all upserts
  // in a single HTTP batch to Turso (~30 ms total regardless of count).
  const _doInvoice = async (client: any) => {
    // 1. Invoice header — 1 RTT
    const created = await client.purchaseInvoice.create({
      data: {
        businessId: input.businessId,
        storeId: store.id,
        supplierId: input.supplierId || null,
        paymentStatus: finalStatus,
        dueDate: input.dueDate || null,
        subtotalPence: subtotal,
        vatPence: vatTotal,
        totalPence: total,
      }
    });

    // 2. All lines in one SQL INSERT — 1 RTT regardless of line count
    await client.purchaseInvoiceLine.createMany({
      data: lineDetails.map((line) => ({
        purchaseInvoiceId: created.id,
        productId: line.productId,
        unitId: line.unitId,
        qtyInUnit: line.qtyInUnit,
        conversionToBase: line.productUnit.conversionToBase,
        qtyBase: line.qtyBase,
        unitCostPence: line.unitCostPence,
        lineSubtotalPence: line.lineSubtotal,
        lineVatPence: line.lineVat,
        lineTotalPence: line.lineTotal,
      }))
    });

    // 3. Payments — 1 RTT
    if (payments.length > 0) {
      await client.purchasePayment.createMany({
        data: payments.map((payment) => ({
          purchaseInvoiceId: created.id,
          method: payment.method,
          amountPence: payment.amountPence,
          reference: payment.reference ?? null,
        }))
      });
    }

    // 4. GL entry — 2 RTTs (entry header + lines createMany in postJournalEntry)
    await postJournalEntry({
      businessId: input.businessId,
      description: `Purchase ${created.id}`,
      referenceType: 'PURCHASE_INVOICE',
      referenceId: created.id,
      lines: journalLines,
      prismaClient: client as any,
      accountMap: preloadedAccountMap,
    });

    return created;
  };

  const _doInventory = async (client: any, invoiceId: string) => {
    const inventoryMap = await fetchInventoryMap(
      store.id,
      Array.from(productTotals.keys()),
      client
    );

    // Pre-compute avg cost for all products
    const upsertArgs = Array.from(productTotals.entries()).map(([productId, totals]) => {
      const inv = inventoryMap.get(productId);
      const onHand = inv?.qtyOnHandBase ?? 0;
      const currentAvg =
        inv?.avgCostBasePence && inv.avgCostBasePence > 0
          ? inv.avgCostBasePence
          : totals.defaultCostBasePence;
      const existingValue = onHand * currentAvg;
      const newQty = onHand + totals.qtyBase;
      const newAvg = newQty > 0 ? Math.round((existingValue + totals.costPence) / newQty) : 0;
      return { productId, qtyBase: totals.qtyBase, newAvg };
    });

    if (db) {
      // Inside a caller-supplied tx — must use the tx client sequentially.
      // This path is used for single-invoice flows (small N), not bulk import.
      for (const { productId, qtyBase, newAvg } of upsertArgs) {
        await incrementInventoryBalance(client, store.id, productId, qtyBase, newAvg);
      }
    } else {
      // ── Bulk inventory upsert (1 SQL statement) ──────────────────────────
      // The OLD approach used prisma.$transaction([N × upsert]) which sends
      // each upsert as a separate SQL round-trip inside a PostgreSQL
      // transaction (BEGIN → N queries → COMMIT). At ≥10 ms RTT per query,
      // 150+ items easily exceed Prisma's default 5 s transaction timeout
      // (P2028 "Transaction already closed"), surfacing as the generic
      // "Something went wrong saving your data" message.
      //
      // FIX: on PostgreSQL, use a single INSERT … ON CONFLICT DO UPDATE —
      // 1 round-trip for any number of products. On SQLite (dev), fall back
      // to sub-batched $transaction with generous timeout.
      if (upsertArgs.length > 0) {
        const isPostgres = !!(process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING);

        if (isPostgres) {
          const sid = store.id;
          const values = upsertArgs.map(({ productId, qtyBase, newAvg }) =>
            Prisma.sql`(gen_random_uuid()::text, ${sid}, ${productId}, ${qtyBase}, ${newAvg}, NOW())`
          );
          await prisma.$executeRaw`
            INSERT INTO "InventoryBalance" ("id", "storeId", "productId", "qtyOnHandBase", "avgCostBasePence", "updatedAt")
            VALUES ${Prisma.join(values)}
            ON CONFLICT ("storeId", "productId") DO UPDATE SET
              "qtyOnHandBase" = "InventoryBalance"."qtyOnHandBase" + EXCLUDED."qtyOnHandBase",
              "avgCostBasePence" = EXCLUDED."avgCostBasePence",
              "updatedAt" = NOW()
          `;
        } else {
          // SQLite / dev: sub-batch the upserts to stay under the tx timeout.
          const UPSERT_BATCH = 50;
          for (let i = 0; i < upsertArgs.length; i += UPSERT_BATCH) {
            const batch = upsertArgs.slice(i, i + UPSERT_BATCH);
            await prisma.$transaction(
              batch.map(({ productId, qtyBase, newAvg }) =>
                prisma.inventoryBalance.upsert({
                  where: { storeId_productId: { storeId: store.id, productId } },
                  update: { qtyOnHandBase: { increment: qtyBase }, avgCostBasePence: newAvg },
                  create: { storeId: store.id, productId, qtyOnHandBase: qtyBase, avgCostBasePence: newAvg },
                })
              )
            );
          }
        }
      }
    }

    await (client as typeof prisma).stockMovement.createMany({
      data: lineDetails.map((line) => ({
        storeId: store.id,
        productId: line.productId,
        qtyBase: line.qtyBase,
        unitCostBasePence: line.unitCostBasePence,
        type: 'PURCHASE',
        referenceType: 'PURCHASE_INVOICE',
        referenceId: invoiceId,
        userId: input.userId ?? null
      }))
    });
  };

  let invoice: Awaited<ReturnType<typeof _doInvoice>>;
  if (db) {
    // Called inside a caller-supplied transaction — all writes in the same tx.
    invoice = await _doInvoice(db);
    await _doInventory(db, invoice.id);
  } else {
    // Normal path: no outer $transaction needed — createMany = 1 RTT per step.
    invoice = await _doInvoice(prisma);
    await _doInventory(prisma as any, invoice.id);
  }

  return invoice;
}

