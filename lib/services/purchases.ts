import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry, ensureChartOfAccounts } from '@/lib/accounting';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import {
  filterPositivePayments,
  splitPayments,
  derivePaymentStatus,
  creditCashBankLines,
  resolveEffectiveDefaultCostPence,
  type PaymentInput,
  type JournalLine
} from './shared';
import { fetchInventoryMap, incrementInventoryBalance } from './shared';
import {
  EXPLICIT_CASH_TILL_REQUIRED_MSG,
  getOpenCashShiftForPayment,
  recordCashDrawerEntryTx,
} from './cash-drawer';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import {
  assertMoneyMovementTenantChain,
  buildPurchaseCreatePayloadHash,
  findMoneyIdempotency,
  insertMoneyIdempotency,
  isPrismaUniqueConstraintOn,
  MoneyIdempotencyError,
  MONEY_IDEMPOTENCY_ERROR,
  normalizeMoneyIdempotencyKey,
  parseIdempotencyResult,
  replayOrConflict,
} from './money-idempotency';

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
  /**
   * Pass true to bypass the "cost looks suspiciously high" guard. The UI should
   * surface the error message and only set this once the user has explicitly
   * confirmed the cost is correct (e.g. for clearance buys or pricing errors).
   */
  acknowledgeHighCost?: boolean;
  /** Opening stock from import/setup uses OPENING in the stock ledger. */
  stockMovementType?: 'OPENING' | 'PURCHASE';
  /**
   * Import / bulk paths post Cash to GL without requiring an open till.
   * Cash drawer PAID_OUT entries are still recorded when a shift is open.
   */
  skipCashDrawerRequirement?: boolean;
  /** Required when cash payments are recorded and skipCashDrawerRequirement is not set. */
  tillId?: string | null;
  shiftId?: string | null;
  /** Required for durable replay when embedded payments are externally repeatable. */
  idempotencyKey?: string;
};

export type SupplierProductLinkSkippedProduct = {
  productId: string;
  productName: string;
  sku: string | null;
  currentSupplierId: string;
  currentSupplierName: string;
  purchaseSupplierId: string;
  purchaseSupplierName: string;
};

export type SupplierProductLinkSummary = {
  linkedCount: number;
  alreadyLinkedCount: number;
  skippedDifferentSupplierCount: number;
  skippedProducts: SupplierProductLinkSkippedProduct[];
};

/**
 * Multiplier above which a per-base-unit purchase cost is considered
 * suspicious relative to the product's selling price. Tuned to catch the
 * common "entered case price into per-bottle field" mistake without firing on
 * legitimate low-margin purchases.
 */
const SUSPICIOUS_COST_TO_SELLING_RATIO = 5;

export class HighPurchaseCostError extends Error {
  readonly code = 'HIGH_PURCHASE_COST';
  readonly productName: string;
  readonly unitCostPence: number;
  readonly sellingPricePence: number;

  constructor(args: { productName: string; unitCostPence: number; sellingPricePence: number }) {
    super(
      `Cost for "${args.productName}" looks too high — please confirm. ` +
        `You entered ${(args.unitCostPence / 100).toFixed(2)} per unit, ` +
        `but the selling price is ${(args.sellingPricePence / 100).toFixed(2)}.`,
    );
    this.name = 'HighPurchaseCostError';
    this.productName = args.productName;
    this.unitCostPence = args.unitCostPence;
    this.sellingPricePence = args.sellingPricePence;
  }
}

async function linkPurchasedProductsToSupplier(
  client: any,
  input: {
    businessId: string;
    supplierId?: string | null;
    supplierName?: string | null;
    lines: Array<{ productId?: string | null }>;
  },
): Promise<SupplierProductLinkSummary> {
  const productIds = [...new Set(input.lines.map((line) => line.productId).filter(Boolean))] as string[];
  if (!input.supplierId || productIds.length === 0) {
    return {
      linkedCount: 0,
      alreadyLinkedCount: 0,
      skippedDifferentSupplierCount: 0,
      skippedProducts: [],
    };
  }

  const products = await client.product.findMany({
    where: {
      businessId: input.businessId,
      id: { in: productIds },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      preferredSupplierId: true,
      preferredSupplier: { select: { id: true, name: true } },
    },
  });

  const toLink = products
    .filter((product: { preferredSupplierId: string | null }) => !product.preferredSupplierId)
    .map((product: { id: string }) => product.id);
  const alreadyLinkedCount = products.filter(
    (product: { preferredSupplierId: string | null }) => product.preferredSupplierId === input.supplierId,
  ).length;
  const skippedProducts = products
    .filter(
      (product: { preferredSupplierId: string | null }) =>
        Boolean(product.preferredSupplierId && product.preferredSupplierId !== input.supplierId),
    )
    .map(
      (product: {
        id: string;
        name: string;
        sku: string | null;
        preferredSupplierId: string | null;
        preferredSupplier: { id: string; name: string } | null;
      }) => ({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentSupplierId: product.preferredSupplierId ?? '',
        currentSupplierName: product.preferredSupplier?.name ?? 'Another supplier',
        purchaseSupplierId: input.supplierId,
        purchaseSupplierName: input.supplierName ?? 'Purchase supplier',
      }),
    );

  const updateResult =
    toLink.length > 0
      ? await client.product.updateMany({
          where: {
            businessId: input.businessId,
            id: { in: toLink },
            preferredSupplierId: null,
          },
          data: { preferredSupplierId: input.supplierId },
        })
      : { count: 0 };

  return {
    linkedCount: updateResult.count ?? 0,
    alreadyLinkedCount,
    skippedDifferentSupplierCount: skippedProducts.length,
    skippedProducts,
  };
}

export async function createPurchase(input: CreatePurchaseInput, db?: any) {
  return measureServerOperation(
    'action.purchase.create',
    () => createPurchaseImpl(input, db),
    {
      businessId: input.businessId,
      storeId: input.storeId,
      action: 'createPurchaseAction',
      rowCount: input.lines.length,
      cacheState: 'write-through',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
  );
}

async function createPurchaseInvoicePayments(
  client: any,
  input: {
    businessId: string;
    storeId: string;
    invoiceId: string;
    payments: PaymentInput[];
    recordedByUserId?: string | null;
    supplierName?: string | null;
    skipCashDrawerRequirement?: boolean;
    tillId?: string | null;
    shiftId?: string | null;
  }
) {
  if (input.payments.length === 0) return;

  const cashSplit = splitPayments(input.payments);
  let openShift: { id: string; tillId: string } | null = null;
  if (cashSplit.cashPence > 0) {
    if (input.skipCashDrawerRequirement) {
      // Imports post Cash to GL without a till. Do not guess a user shift.
      openShift = input.tillId
        ? await getOpenCashShiftForPayment(client, {
            businessId: input.businessId,
            storeId: input.storeId,
            tillId: input.tillId,
            shiftId: input.shiftId,
          })
        : null;
    } else {
      if (!input.tillId) {
        throw new Error(EXPLICIT_CASH_TILL_REQUIRED_MSG);
      }
      openShift = await getOpenCashShiftForPayment(client, {
        businessId: input.businessId,
        storeId: input.storeId,
        tillId: input.tillId,
        shiftId: input.shiftId,
      });
      if (!input.recordedByUserId || !openShift) {
        throw new Error('Open shift is required before recording cash supplier payments.');
      }
    }
  }

  await assertMoneyMovementTenantChain(client, {
    businessId: input.businessId,
    storeId: input.storeId,
    userId: input.recordedByUserId,
    tillId: openShift?.tillId,
    shiftId: openShift?.id,
  });

  for (const payment of input.payments) {
    const createdPayment = await client.purchasePayment.create({
      data: {
        businessId: input.businessId,
        purchaseInvoiceId: input.invoiceId,
        method: payment.method,
        amountPence: payment.amountPence,
        reference: payment.reference ?? null,
        ...(input.recordedByUserId ? { recordedByUserId: input.recordedByUserId } : {}),
      },
    });

    if (
      payment.method === 'CASH' &&
      payment.amountPence > 0 &&
      openShift &&
      input.recordedByUserId
    ) {
      await recordCashDrawerEntryTx(client, {
        businessId: input.businessId,
        storeId: input.storeId,
        tillId: openShift.tillId,
        shiftId: openShift.id,
        createdByUserId: input.recordedByUserId,
        cashierUserId: input.recordedByUserId,
        entryType: 'PAID_OUT_SUPPLIER',
        amountPence: -payment.amountPence,
        reasonCode: 'SUPPLIER_PAYMENT',
        reason: input.supplierName
          ? `Cash paid to supplier: ${input.supplierName}`
          : 'Cash paid to supplier',
        referenceType: 'PURCHASE_PAYMENT',
        referenceId: createdPayment.id,
      });
    }
  }
}

async function createPurchaseImpl(input: CreatePurchaseInput, db?: any) {
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
          select: { id: true, name: true },
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
      line.unitCostPence ?? resolveEffectiveDefaultCostPence(productUnit.product, productUnit);
    const unitCostBasePence = Math.round(unitCostPence / productUnit.conversionToBase);

    // Sanity guard: a per-base-unit cost more than 5× the selling price almost
    // always means the merchant typed a per-package cost into a per-base field
    // (or vice versa). Once committed, that wrong cost permanently inflates
    // WAC. Allow the merchant to acknowledge intentionally low-margin buys via
    // input.acknowledgeHighCost.
    const sellingPriceBasePence = productUnit.product.sellingPriceBasePence;
    if (
      !input.acknowledgeHighCost &&
      sellingPriceBasePence > 0 &&
      unitCostBasePence > sellingPriceBasePence * SUSPICIOUS_COST_TO_SELLING_RATIO
    ) {
      throw new HighPurchaseCostError({
        productName: productUnit.product.name,
        unitCostPence,
        sellingPricePence: resolveEffectiveDefaultCostPence(
          { defaultCostBasePence: sellingPriceBasePence },
          productUnit,
        ),
      });
    }

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
  /**
   * Paid money (any positive tender, including PAID with synthesized CASH)
   * requires a durable key at this service boundary. Unpaid/credit-only
   * (totalPaid === 0) may omit a key and creates a new AP invoice each call.
   * A key supplied on unpaid still participates in exact-replay.
   */
  if (totalPaid > 0 && !input.idempotencyKey?.trim()) {
    throw new MoneyIdempotencyError(
      MONEY_IDEMPOTENCY_ERROR.IDEMPOTENCY_REQUIRED,
      'This paid purchase needs a durable idempotency key before money can be recorded.',
    );
  }
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

  const idempotencyKey = input.idempotencyKey
    ? normalizeMoneyIdempotencyKey(input.idempotencyKey)
    : null;
  const payloadHash = idempotencyKey
    ? buildPurchaseCreatePayloadHash({
        businessId: input.businessId,
        storeId: input.storeId,
        supplierId: input.supplierId ?? '',
        payments,
        lines: input.lines,
        userId: input.userId ?? '',
      })
    : null;

  if (idempotencyKey && payloadHash) {
    const existing = await findMoneyIdempotency((db ?? prisma) as any, input.businessId, idempotencyKey);
    if (existing) {
      replayOrConflict(existing, { payloadHash, commandKind: 'PURCHASE_CREATE' });
      const parsed = parseIdempotencyResult<{ invoiceId: string }>(existing.resultJson);
      const replayed = await (db ?? prisma).purchaseInvoice.findFirst({
        where: { id: parsed.invoiceId, businessId: input.businessId },
      });
      if (!replayed) throw new Error('Purchase invoice not found');
      return replayed;
    }
  }

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

    // 3. Payments — individual creates so CASH rows can link to drawer entries
    if (payments.length > 0) {
      await createPurchaseInvoicePayments(client, {
        businessId: input.businessId,
        storeId: store.id,
        invoiceId: created.id,
        payments,
        recordedByUserId: input.userId ?? null,
        supplierName: supplier?.name ?? null,
        skipCashDrawerRequirement: input.skipCashDrawerRequirement,
        tillId: input.tillId,
        shiftId: input.shiftId,
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

    if (idempotencyKey && payloadHash) {
      await insertMoneyIdempotency(client, {
        businessId: input.businessId,
        key: idempotencyKey,
        payloadHash,
        commandKind: 'PURCHASE_CREATE',
        resultJson: JSON.stringify({ invoiceId: created.id }),
      });
    }

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

    if (upsertArgs.length > 0) {
      const isPostgres = isPostgresDatabaseUrl(process.env.DATABASE_URL);

      if (isPostgres && typeof client.$executeRaw === 'function') {
        const sid = store.id;
        const values = upsertArgs.map(({ productId, qtyBase, newAvg }) =>
          Prisma.sql`(gen_random_uuid()::text, ${sid}, ${productId}, ${qtyBase}, ${newAvg}, NOW())`
        );
        await client.$executeRaw`
          INSERT INTO "InventoryBalance" ("id", "storeId", "productId", "qtyOnHandBase", "avgCostBasePence", "updatedAt")
          VALUES ${Prisma.join(values)}
          ON CONFLICT ("storeId", "productId") DO UPDATE SET
            "qtyOnHandBase" = "InventoryBalance"."qtyOnHandBase" + EXCLUDED."qtyOnHandBase",
            "avgCostBasePence" = EXCLUDED."avgCostBasePence",
            "updatedAt" = NOW()
        `;
      } else {
        for (const { productId, qtyBase, newAvg } of upsertArgs) {
          await incrementInventoryBalance(client, store.id, productId, qtyBase, newAvg);
        }
      }
    }

    const movementType = input.stockMovementType ?? 'PURCHASE';
    const referenceType =
      movementType === 'OPENING' ? 'OPENING_STOCK' : 'PURCHASE_INVOICE';

    await (client as typeof prisma).stockMovement.createMany({
      data: lineDetails.map((line) => ({
        storeId: store.id,
        productId: line.productId,
        qtyBase: line.qtyBase,
        unitCostBasePence: line.unitCostBasePence,
        type: movementType,
        referenceType,
        referenceId: invoiceId,
        userId: input.userId ?? null
      }))
    });
  };

  const finishInvoice = async (created: Awaited<ReturnType<typeof _doInvoice>>, client: any) => {
    await _doInventory(client, created.id);
    const supplierProductLinkSummary = await linkPurchasedProductsToSupplier(client, {
      ...input,
      supplierName: supplier?.name ?? null,
    });
    (created as any).supplierProductLinkSummary = supplierProductLinkSummary;
    return created;
  };

  const runWithMoneyTx = async (client: any) => {
    try {
      return await _doInvoice(client);
    } catch (error) {
      if (idempotencyKey && payloadHash && isPrismaUniqueConstraintOn(error, ['businessId', 'key'])) {
        const winner = await findMoneyIdempotency(client, input.businessId, idempotencyKey);
        if (winner) {
          replayOrConflict(winner, { payloadHash, commandKind: 'PURCHASE_CREATE' });
          const parsed = parseIdempotencyResult<{ invoiceId: string }>(winner.resultJson);
          const replayed = await client.purchaseInvoice.findFirst({
            where: { id: parsed.invoiceId, businessId: input.businessId },
          });
          if (replayed) return replayed;
        }
        throw new MoneyIdempotencyError(
          MONEY_IDEMPOTENCY_ERROR.IDEMPOTENCY_CONFLICT,
          'This payment request conflicts with a previous submission.',
        );
      }
      throw error;
    }
  };

  let invoice: Awaited<ReturnType<typeof _doInvoice>>;
  const needsAtomicMoney = payments.length > 0;
  if (db) {
    invoice = await runWithMoneyTx(db);
    invoice = await finishInvoice(invoice, db);
  } else if (needsAtomicMoney) {
    invoice = await prisma.$transaction(async (tx) => {
      const created = await runWithMoneyTx(tx);
      return finishInvoice(created, tx);
    });
  } else {
    invoice = await runWithMoneyTx(prisma);
    invoice = await finishInvoice(invoice, prisma);
  }

  return invoice;
}

