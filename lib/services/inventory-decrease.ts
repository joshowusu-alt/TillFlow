import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { assertAccount5100SafeForInventoryLoss } from '@/lib/accounting-inventory-loss-5100';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import { isInventoryDecreasePhase1Enabled } from '@/lib/inventory-decrease-flag';
import { decrementInventoryBalance } from './shared';
import { detectInventoryAdjustmentRisk } from './risk-monitor';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

export const INVENTORY_DECREASE_SCHEMA_VERSION = 1;

export const INVENTORY_DECREASE_REASON_CODES = [
  'WASTAGE',
  'EXPIRED',
  'DAMAGED',
  'THEFT',
  'STOCKTAKE_SHORTFALL',
  'AUTHORISED_QUANTITY_CORRECTION',
] as const;

export type InventoryDecreaseReasonCode = (typeof INVENTORY_DECREASE_REASON_CODES)[number];

export const INVENTORY_DECREASE_ERROR = {
  FLAG_DISABLED: 'FLAG_DISABLED',
  UNAUTHORISED: 'UNAUTHORISED',
  INVALID_ADJUSTMENT: 'INVALID_ADJUSTMENT',
  INSUFFICIENT_QUANTITY: 'INSUFFICIENT_QUANTITY',
  MISSING_VALUATION: 'MISSING_VALUATION',
  DUPLICATE_MISMATCH: 'DUPLICATE_MISMATCH',
  ACCOUNT_MAPPING_UNAVAILABLE: 'ACCOUNT_MAPPING_UNAVAILABLE',
  ARITHMETIC_LIMIT: 'ARITHMETIC_LIMIT',
  POSTING_FAILURE: 'POSTING_FAILURE',
  AUDIT_FAILURE: 'AUDIT_FAILURE',
} as const;

export type InventoryDecreaseErrorCode =
  (typeof INVENTORY_DECREASE_ERROR)[keyof typeof INVENTORY_DECREASE_ERROR];

export class InventoryDecreaseError extends Error {
  readonly code: InventoryDecreaseErrorCode;

  constructor(code: InventoryDecreaseErrorCode, message: string) {
    super(message);
    this.name = 'InventoryDecreaseError';
    this.code = code;
  }
}

export type InventoryDecreaseInput = {
  businessId: string;
  storeId: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
  reasonCode: InventoryDecreaseReasonCode;
  reason: string;
  idempotencyKey: string;
  userId: string;
  userName: string;
  userRole: string;
};

export type InventoryDecreaseResult = {
  id: string;
  storeId: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
  qtyBase: number;
  direction: 'DECREASE';
  reasonCode: string;
  reason: string | null;
  idempotencyKey: string | null;
  payloadHash: string | null;
  unitCostBasePence: number | null;
  valuePence: number | null;
  schemaVersion: number | null;
  replayed: boolean;
};

type LockedBalance = {
  qtyOnHandBase: number;
  avgCostBasePence: number;
};

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function isPrismaUniqueConstraintOn(error: unknown, fields: string[]): boolean {
  if (!hasPrismaErrorCode(error, 'P2002')) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) {
    const targetFields = target.map((item) => String(item));
    return fields.every((field) => targetFields.includes(field));
  }
  if (typeof target === 'string') {
    return fields.every((field) => target.includes(field));
  }
  return false;
}

export function normalizeReasonText(reason: string): string {
  return reason.trim().replace(/\s+/g, ' ');
}

export function isInventoryDecreaseReasonCode(
  value: string,
): value is InventoryDecreaseReasonCode {
  return (INVENTORY_DECREASE_REASON_CODES as readonly string[]).includes(value);
}

export function checkedMul(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.ARITHMETIC_LIMIT,
      'Quantity and cost must be integers',
    );
  }
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.ARITHMETIC_LIMIT,
      'Arithmetic limit exceeded',
    );
  }
  return product;
}

export function buildInventoryDecreasePayloadHash(parts: {
  businessId: string;
  storeId: string;
  productId: string;
  unitId: string;
  conversionToBase: number;
  qtyBase: number;
  reasonCode: string;
  normalizedReason: string;
  schemaVersion: number;
}): string {
  const canonical = [
    parts.businessId,
    parts.storeId,
    parts.productId,
    parts.unitId,
    String(parts.conversionToBase),
    String(parts.qtyBase),
    'DECREASE',
    parts.reasonCode,
    parts.normalizedReason,
    String(parts.schemaVersion),
  ].join('\0');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function toResult(
  row: {
    id: string;
    storeId: string;
    productId: string;
    unitId: string;
    qtyInUnit: number;
    qtyBase: number;
    reasonCode: string | null;
    reason: string | null;
    idempotencyKey: string | null;
    payloadHash: string | null;
    unitCostBasePence: number | null;
    valuePence: number | null;
    schemaVersion: number | null;
  },
  replayed: boolean,
): InventoryDecreaseResult {
  return {
    id: row.id,
    storeId: row.storeId,
    productId: row.productId,
    unitId: row.unitId,
    qtyInUnit: row.qtyInUnit,
    qtyBase: row.qtyBase,
    direction: 'DECREASE',
    reasonCode: row.reasonCode ?? '',
    reason: row.reason,
    idempotencyKey: row.idempotencyKey,
    payloadHash: row.payloadHash,
    unitCostBasePence: row.unitCostBasePence,
    valuePence: row.valuePence,
    schemaVersion: row.schemaVersion,
    replayed,
  };
}

const ADJUSTMENT_SELECT = {
  id: true,
  storeId: true,
  productId: true,
  unitId: true,
  qtyInUnit: true,
  qtyBase: true,
  reasonCode: true,
  reason: true,
  idempotencyKey: true,
  payloadHash: true,
  unitCostBasePence: true,
  valuePence: true,
  schemaVersion: true,
} as const;

async function lockInventoryBalance(
  tx: Prisma.TransactionClient,
  storeId: string,
  productId: string,
): Promise<LockedBalance | null> {
  if (isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    const rows = await tx.$queryRaw<LockedBalance[]>`
      SELECT "qtyOnHandBase", "avgCostBasePence"
      FROM "InventoryBalance"
      WHERE "storeId" = ${storeId} AND "productId" = ${productId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  return tx.inventoryBalance.findUnique({
    where: { storeId_productId: { storeId, productId } },
    select: { qtyOnHandBase: true, avgCostBasePence: true },
  });
}

async function findByIdempotencyKey(storeId: string, idempotencyKey: string) {
  return prisma.stockAdjustment.findUnique({
    where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
    select: ADJUSTMENT_SELECT,
  });
}

/**
 * Phase 1 quantity-decrease only. Requires rollout flag.
 * Does not fall back to Product.defaultCostBasePence — uses locked avgCostBasePence only.
 */
export async function createInventoryDecrease(
  input: InventoryDecreaseInput,
  outerTx?: Prisma.TransactionClient,
): Promise<InventoryDecreaseResult> {
  return measureServerOperation(
    'action.stock-adjustment.create',
    () => createInventoryDecreaseImpl(input, outerTx),
    {
      businessId: input.businessId,
      storeId: input.storeId,
      action: 'createInventoryDecrease',
      cacheState: outerTx ? 'nested-transaction' : 'write-through',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
  );
}

async function createInventoryDecreaseImpl(
  input: InventoryDecreaseInput,
  outerTx?: Prisma.TransactionClient,
): Promise<InventoryDecreaseResult> {
  if (!isInventoryDecreasePhase1Enabled()) {
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.FLAG_DISABLED,
      'Inventory decrease Phase 1 is not enabled',
    );
  }

  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.INVALID_ADJUSTMENT,
      'Idempotency key is required',
    );
  }

  if (!Number.isInteger(input.qtyInUnit) || input.qtyInUnit < 1) {
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.INVALID_ADJUSTMENT,
      'Quantity must be an integer of at least 1',
    );
  }

  if (!isInventoryDecreaseReasonCode(input.reasonCode)) {
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.INVALID_ADJUSTMENT,
      'Invalid reason code',
    );
  }

  const normalizedReason = normalizeReasonText(input.reason);
  if (normalizedReason.length < 3) {
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.INVALID_ADJUSTMENT,
      'Reason text is required',
    );
  }

  const userRole = typeof input.userRole === 'string' ? input.userRole.trim() : '';
  if (!userRole) {
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.INVALID_ADJUSTMENT,
      'Actor role is required for authoritative audit',
    );
  }

  const client = outerTx ?? prisma;

  const [store, productUnit] = await Promise.all([
    client.store.findFirst({
      where: { id: input.storeId, businessId: input.businessId },
      select: { id: true },
    }),
    client.productUnit.findFirst({
      where: {
        productId: input.productId,
        unitId: input.unitId,
        product: { businessId: input.businessId },
      },
      select: { conversionToBase: true },
    }),
  ]);

  if (!store) {
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.UNAUTHORISED,
      'Store not found for this business',
    );
  }
  if (!productUnit) {
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.UNAUTHORISED,
      'Unit not configured for product in this business',
    );
  }

  const conversionToBase = productUnit.conversionToBase;
  if (!Number.isInteger(conversionToBase) || conversionToBase < 1) {
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.INVALID_ADJUSTMENT,
      'Invalid unit conversion',
    );
  }

  const qtyBase = checkedMul(input.qtyInUnit, conversionToBase);
  const payloadHash = buildInventoryDecreasePayloadHash({
    businessId: input.businessId,
    storeId: store.id,
    productId: input.productId,
    unitId: input.unitId,
    conversionToBase,
    qtyBase,
    reasonCode: input.reasonCode,
    normalizedReason,
    schemaVersion: INVENTORY_DECREASE_SCHEMA_VERSION,
  });

  // 1. Preliminary idempotency lookup (outside the authoritative write tx).
  const existing = await findByIdempotencyKey(store.id, idempotencyKey);
  if (existing) {
    if (existing.payloadHash === payloadHash) {
      return toResult(existing, true);
    }
    throw new InventoryDecreaseError(
      INVENTORY_DECREASE_ERROR.DUPLICATE_MISMATCH,
      'Duplicate request with a different payload',
    );
  }

  const doWork = async (tx: Prisma.TransactionClient) => {
    const balance = await lockInventoryBalance(tx, store.id, input.productId);
    if (!balance) {
      throw new InventoryDecreaseError(
        INVENTORY_DECREASE_ERROR.INSUFFICIENT_QUANTITY,
        'No inventory balance exists for this product',
      );
    }
    if (balance.qtyOnHandBase < qtyBase) {
      throw new InventoryDecreaseError(
        INVENTORY_DECREASE_ERROR.INSUFFICIENT_QUANTITY,
        'Insufficient quantity on hand',
      );
    }

    const unitCostBasePence = balance.avgCostBasePence;
    if (!Number.isInteger(unitCostBasePence) || unitCostBasePence <= 0) {
      throw new InventoryDecreaseError(
        INVENTORY_DECREASE_ERROR.MISSING_VALUATION,
        'Authoritative average cost is missing or zero',
      );
    }

    const valuePence = checkedMul(unitCostBasePence, qtyBase);
    const beforeQty = balance.qtyOnHandBase;
    const afterQty = beforeQty - qtyBase;

    const created = await tx.stockAdjustment.create({
      data: {
        storeId: store.id,
        productId: input.productId,
        unitId: input.unitId,
        qtyInUnit: input.qtyInUnit,
        qtyBase: -qtyBase,
        direction: 'DECREASE',
        reason: normalizedReason,
        reasonCode: input.reasonCode,
        idempotencyKey,
        payloadHash,
        unitCostBasePence,
        valuePence,
        schemaVersion: INVENTORY_DECREASE_SCHEMA_VERSION,
        userId: input.userId,
      },
      select: ADJUSTMENT_SELECT,
    });

    await decrementInventoryBalance(tx, store.id, input.productId, qtyBase);

    await tx.stockMovement.create({
      data: {
        storeId: store.id,
        productId: input.productId,
        qtyBase: -qtyBase,
        beforeQtyBase: beforeQty,
        afterQtyBase: afterQty,
        unitCostBasePence,
        type: 'ADJUSTMENT',
        referenceType: 'STOCK_ADJUSTMENT',
        referenceId: created.id,
        userId: input.userId,
      },
    });

    try {
      await assertAccount5100SafeForInventoryLoss(tx, input.businessId);
      await postJournalEntry({
        businessId: input.businessId,
        description: `Inventory decrease ${created.id}`,
        referenceType: 'STOCK_ADJUSTMENT',
        referenceId: created.id,
        lines: [
          { accountCode: ACCOUNT_CODES.inventoryLoss, debitPence: valuePence },
          { accountCode: ACCOUNT_CODES.inventory, creditPence: valuePence },
        ],
        prismaClient: tx as any,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Journal posting failed';
      if (
        message.includes('Account not found') ||
        message.includes('Account 5100') ||
        message.includes('Inventory Loss')
      ) {
        throw new InventoryDecreaseError(
          INVENTORY_DECREASE_ERROR.ACCOUNT_MAPPING_UNAVAILABLE,
          message,
        );
      }
      throw new InventoryDecreaseError(
        INVENTORY_DECREASE_ERROR.POSTING_FAILURE,
        message,
      );
    }

    try {
      await tx.auditLog.create({
        data: {
          businessId: input.businessId,
          userId: input.userId,
          userName: input.userName || 'Unknown',
          userRole,
          action: 'INVENTORY_ADJUST',
          entity: 'StockAdjustment',
          entityId: created.id,
          details: JSON.stringify({
            phase: 'inventory-decrease-phase1',
            direction: 'DECREASE',
            reasonCode: input.reasonCode,
            reason: normalizedReason,
            qtyInUnit: input.qtyInUnit,
            qtyBase,
            beforeQtyBase: beforeQty,
            afterQtyBase: afterQty,
            unitCostBasePence,
            valuePence,
            idempotencyKey,
            payloadHash,
            schemaVersion: INVENTORY_DECREASE_SCHEMA_VERSION,
            journal: {
              debit: ACCOUNT_CODES.inventoryLoss,
              credit: ACCOUNT_CODES.inventory,
            },
          }),
        },
      });
    } catch (error) {
      throw new InventoryDecreaseError(
        INVENTORY_DECREASE_ERROR.AUDIT_FAILURE,
        error instanceof Error ? error.message : 'Audit write failed',
      );
    }

    return toResult(created, false);
  };

  let result: InventoryDecreaseResult;
  try {
    if (outerTx) {
      result = await doWork(outerTx);
    } else {
      result = await prisma.$transaction(doWork);
    }
  } catch (error) {
    // Unique race: never continue inside an aborted Postgres transaction.
    // Re-read the winner outside, then replay or mismatch.
    if (
      !outerTx &&
      isPrismaUniqueConstraintOn(error, ['storeId', 'idempotencyKey'])
    ) {
      const winner = await findByIdempotencyKey(store.id, idempotencyKey);
      if (winner && winner.payloadHash === payloadHash) {
        return toResult(winner, true);
      }
      throw new InventoryDecreaseError(
        INVENTORY_DECREASE_ERROR.DUPLICATE_MISMATCH,
        'Duplicate request with a different payload',
      );
    }
    throw error;
  }

  if (!result.replayed && !outerTx) {
    const business = await prisma.business.findUnique({
      where: { id: input.businessId },
      select: { inventoryAdjustmentRiskThresholdBase: true },
    });
    detectInventoryAdjustmentRisk({
      businessId: input.businessId,
      storeId: store.id,
      cashierUserId: input.userId,
      adjustmentId: result.id,
      qtyBase: -qtyBase,
      thresholdQtyBase: business?.inventoryAdjustmentRiskThresholdBase ?? 50,
    }).catch(() => {});
  }

  return result;
}
