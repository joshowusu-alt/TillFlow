import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { ensureInventoryIncreaseAccounts } from '@/lib/accounting-inventory-increase-accounts';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import { isInventoryIncreasePhase2EnabledForBusiness } from '@/lib/inventory-increase-flag';
import { incrementInventoryBalanceQtyOnly } from './shared';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';

export const INVENTORY_INCREASE_SCHEMA_VERSION = 1;

export const INVENTORY_INCREASE_REASON_CODES = [
  'PHYSICAL_COUNT_SURPLUS',
  'STOCK_FOUND',
] as const;

export type InventoryIncreaseReasonCode = (typeof INVENTORY_INCREASE_REASON_CODES)[number];

export const INVENTORY_INCREASE_ERROR = {
  FLAG_DISABLED: 'FLAG_DISABLED',
  UNAUTHORISED: 'UNAUTHORISED',
  INVALID_ADJUSTMENT: 'INVALID_ADJUSTMENT',
  MISSING_BALANCE: 'MISSING_BALANCE',
  MISSING_VALUATION: 'MISSING_VALUATION',
  DUPLICATE_MISMATCH: 'DUPLICATE_MISMATCH',
  ACCOUNT_MAPPING_UNAVAILABLE: 'ACCOUNT_MAPPING_UNAVAILABLE',
  ARITHMETIC_LIMIT: 'ARITHMETIC_LIMIT',
  POSTING_FAILURE: 'POSTING_FAILURE',
  AUDIT_FAILURE: 'AUDIT_FAILURE',
  CORRECTION_INVALID: 'CORRECTION_INVALID',
} as const;

export type InventoryIncreaseErrorCode =
  (typeof INVENTORY_INCREASE_ERROR)[keyof typeof INVENTORY_INCREASE_ERROR];

export class InventoryIncreaseError extends Error {
  readonly code: InventoryIncreaseErrorCode;

  constructor(code: InventoryIncreaseErrorCode, message: string) {
    super(message);
    this.name = 'InventoryIncreaseError';
    this.code = code;
  }
}

export type InventoryIncreaseInput = {
  businessId: string;
  storeId: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
  reasonCode: InventoryIncreaseReasonCode;
  reason: string;
  idempotencyKey: string;
  userId: string;
  userName: string;
  userRole: string;
  /** Owner-only interim compensating-entry linkage (no schema migration). */
  correctsAdjustmentId?: string | null;
};

export type InventoryIncreaseResult = {
  id: string;
  storeId: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
  qtyBase: number;
  direction: 'INCREASE';
  reasonCode: string;
  reason: string | null;
  idempotencyKey: string | null;
  payloadHash: string | null;
  unitCostBasePence: number | null;
  valuePence: number | null;
  schemaVersion: number | null;
  previousQtyBase: number;
  newQtyBase: number;
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

export function isInventoryIncreaseReasonCode(
  value: string,
): value is InventoryIncreaseReasonCode {
  return (INVENTORY_INCREASE_REASON_CODES as readonly string[]).includes(value);
}

export function checkedMul(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.ARITHMETIC_LIMIT,
      'Quantity and cost must be integers',
    );
  }
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.ARITHMETIC_LIMIT,
      'Arithmetic limit exceeded',
    );
  }
  return product;
}

export function buildInventoryIncreasePayloadHash(parts: {
  businessId: string;
  storeId: string;
  productId: string;
  unitId: string;
  conversionToBase: number;
  qtyBase: number;
  reasonCode: string;
  normalizedReason: string;
  schemaVersion: number;
  correctsAdjustmentId: string | null;
}): string {
  const canonical = [
    parts.businessId,
    parts.storeId,
    parts.productId,
    parts.unitId,
    String(parts.conversionToBase),
    String(parts.qtyBase),
    'INCREASE',
    parts.reasonCode,
    parts.normalizedReason,
    String(parts.schemaVersion),
    parts.correctsAdjustmentId ?? '',
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
  extras: { previousQtyBase: number; newQtyBase: number; replayed: boolean },
): InventoryIncreaseResult {
  return {
    id: row.id,
    storeId: row.storeId,
    productId: row.productId,
    unitId: row.unitId,
    qtyInUnit: row.qtyInUnit,
    qtyBase: row.qtyBase,
    direction: 'INCREASE',
    reasonCode: row.reasonCode ?? '',
    reason: row.reason,
    idempotencyKey: row.idempotencyKey,
    payloadHash: row.payloadHash,
    unitCostBasePence: row.unitCostBasePence,
    valuePence: row.valuePence,
    schemaVersion: row.schemaVersion,
    previousQtyBase: extras.previousQtyBase,
    newQtyBase: extras.newQtyBase,
    replayed: extras.replayed,
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
 * Phase 2 controlled quantity-increase.
 * Requires global Phase 2 flag AND exact business allowlist membership.
 * Inherits locked avgCostBasePence only — does not recompute WAC or accept user cost.
 */
export async function createInventoryIncrease(
  input: InventoryIncreaseInput,
  outerTx?: Prisma.TransactionClient,
): Promise<InventoryIncreaseResult> {
  return measureServerOperation(
    'action.stock-adjustment.increase',
    () => createInventoryIncreaseImpl(input, outerTx),
    {
      businessId: input.businessId,
      storeId: input.storeId,
      action: 'createInventoryIncrease',
      cacheState: outerTx ? 'nested-transaction' : 'write-through',
    },
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'action' },
  );
}

async function createInventoryIncreaseImpl(
  input: InventoryIncreaseInput,
  outerTx?: Prisma.TransactionClient,
): Promise<InventoryIncreaseResult> {
  // Fail-closed scoped gate before any durable work (including idempotency reads).
  if (!isInventoryIncreasePhase2EnabledForBusiness(input.businessId)) {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.FLAG_DISABLED,
      'Inventory increase Phase 2 is not enabled',
    );
  }

  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.INVALID_ADJUSTMENT,
      'Idempotency key is required',
    );
  }

  if (
    !Number.isFinite(input.qtyInUnit) ||
    !Number.isInteger(input.qtyInUnit) ||
    input.qtyInUnit < 1
  ) {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.INVALID_ADJUSTMENT,
      'Quantity must be an integer of at least 1',
    );
  }

  if (!isInventoryIncreaseReasonCode(input.reasonCode)) {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.INVALID_ADJUSTMENT,
      'Invalid reason code',
    );
  }

  const normalizedReason = normalizeReasonText(input.reason);
  if (normalizedReason.length < 3) {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.INVALID_ADJUSTMENT,
      'Reason text is required',
    );
  }

  const userRole = typeof input.userRole === 'string' ? input.userRole.trim() : '';
  if (!userRole) {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.INVALID_ADJUSTMENT,
      'Actor role is required for authoritative audit',
    );
  }
  if (userRole !== 'OWNER' && userRole !== 'MANAGER') {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.UNAUTHORISED,
      'Only Owner or Manager may record inventory increases',
    );
  }

  const correctsAdjustmentId = input.correctsAdjustmentId?.trim() || null;
  if (correctsAdjustmentId && userRole !== 'OWNER') {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.UNAUTHORISED,
      'Only Owner may post a compensating correction increase',
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
        product: { businessId: input.businessId, active: true },
      },
      select: { conversionToBase: true },
    }),
  ]);

  if (!store) {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.UNAUTHORISED,
      'Store not found for this business',
    );
  }
  if (!productUnit) {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.UNAUTHORISED,
      'Unit not configured for an active product in this business',
    );
  }

  const conversionToBase = productUnit.conversionToBase;
  if (!Number.isInteger(conversionToBase) || conversionToBase < 1) {
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.INVALID_ADJUSTMENT,
      'Invalid unit conversion',
    );
  }

  const qtyBase = checkedMul(input.qtyInUnit, conversionToBase);
  const payloadHash = buildInventoryIncreasePayloadHash({
    businessId: input.businessId,
    storeId: store.id,
    productId: input.productId,
    unitId: input.unitId,
    conversionToBase,
    qtyBase,
    reasonCode: input.reasonCode,
    normalizedReason,
    schemaVersion: INVENTORY_INCREASE_SCHEMA_VERSION,
    correctsAdjustmentId,
  });

  const existing = await findByIdempotencyKey(store.id, idempotencyKey);
  if (existing) {
    if (existing.payloadHash === payloadHash) {
      const movement = await prisma.stockMovement.findFirst({
        where: {
          referenceType: 'STOCK_ADJUSTMENT',
          referenceId: existing.id,
          type: 'ADJUSTMENT',
        },
        select: { beforeQtyBase: true, afterQtyBase: true },
        orderBy: { createdAt: 'desc' },
      });
      return toResult(existing, {
        previousQtyBase: movement?.beforeQtyBase ?? 0,
        newQtyBase: movement?.afterQtyBase ?? existing.qtyBase,
        replayed: true,
      });
    }
    throw new InventoryIncreaseError(
      INVENTORY_INCREASE_ERROR.DUPLICATE_MISMATCH,
      'Duplicate request with a different payload',
    );
  }

  const doWork = async (tx: Prisma.TransactionClient) => {
    if (correctsAdjustmentId) {
      const original = await tx.stockAdjustment.findFirst({
        where: {
          id: correctsAdjustmentId,
          storeId: store.id,
          productId: input.productId,
        },
        select: { id: true, direction: true, qtyBase: true },
      });
      if (!original) {
        throw new InventoryIncreaseError(
          INVENTORY_INCREASE_ERROR.CORRECTION_INVALID,
          'Original adjustment not found for this store and product',
        );
      }
      if (original.direction === 'INCREASE' || original.direction === 'IN') {
        throw new InventoryIncreaseError(
          INVENTORY_INCREASE_ERROR.CORRECTION_INVALID,
          'Never correct an increase with another increase',
        );
      }
      if (original.direction !== 'DECREASE' && original.direction !== 'OUT') {
        throw new InventoryIncreaseError(
          INVENTORY_INCREASE_ERROR.CORRECTION_INVALID,
          'Original adjustment direction is not a decrease',
        );
      }
    }

    const balance = await lockInventoryBalance(tx, store.id, input.productId);
    if (!balance) {
      throw new InventoryIncreaseError(
        INVENTORY_INCREASE_ERROR.MISSING_BALANCE,
        'No inventory balance exists for this product — retained average cost is required',
      );
    }

    const unitCostBasePence = balance.avgCostBasePence;
    if (!Number.isInteger(unitCostBasePence) || unitCostBasePence <= 0) {
      throw new InventoryIncreaseError(
        INVENTORY_INCREASE_ERROR.MISSING_VALUATION,
        'Authoritative average cost is missing or zero',
      );
    }

    const valuePence = checkedMul(unitCostBasePence, qtyBase);
    const beforeQty = balance.qtyOnHandBase;
    if (!Number.isSafeInteger(beforeQty + qtyBase)) {
      throw new InventoryIncreaseError(
        INVENTORY_INCREASE_ERROR.ARITHMETIC_LIMIT,
        'Resulting quantity would exceed arithmetic limits',
      );
    }
    const afterQty = beforeQty + qtyBase;

    const created = await tx.stockAdjustment.create({
      data: {
        storeId: store.id,
        productId: input.productId,
        unitId: input.unitId,
        qtyInUnit: input.qtyInUnit,
        qtyBase,
        direction: 'INCREASE',
        reason: normalizedReason,
        reasonCode: input.reasonCode,
        idempotencyKey,
        payloadHash,
        unitCostBasePence,
        valuePence,
        schemaVersion: INVENTORY_INCREASE_SCHEMA_VERSION,
        userId: input.userId,
      },
      select: ADJUSTMENT_SELECT,
    });

    const newQty = await incrementInventoryBalanceQtyOnly(
      tx,
      store.id,
      input.productId,
      qtyBase,
    );
    if (newQty !== afterQty) {
      // Defensive: locked row + atomic increment should match. Fail closed.
      throw new InventoryIncreaseError(
        INVENTORY_INCREASE_ERROR.POSTING_FAILURE,
        'Inventory quantity reconciliation failed after increment',
      );
    }

    await tx.stockMovement.create({
      data: {
        storeId: store.id,
        productId: input.productId,
        qtyBase,
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
      const accountMap = await ensureInventoryIncreaseAccounts(input.businessId, tx);
      await postJournalEntry({
        businessId: input.businessId,
        description: `Inventory increase ${created.id}`,
        referenceType: 'STOCK_ADJUSTMENT',
        referenceId: created.id,
        lines: [
          { accountCode: ACCOUNT_CODES.inventory, debitPence: valuePence },
          { accountCode: ACCOUNT_CODES.inventoryGain, creditPence: valuePence },
        ],
        prismaClient: tx as any,
        accountMap,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Journal posting failed';
      if (
        message.includes('Account not found') ||
        message.includes('Account 4100') ||
        message.includes('Account 1200') ||
        message.includes('Inventory Gain') ||
        message.includes('incorrectly configured')
      ) {
        throw new InventoryIncreaseError(
          INVENTORY_INCREASE_ERROR.ACCOUNT_MAPPING_UNAVAILABLE,
          message,
        );
      }
      throw new InventoryIncreaseError(
        INVENTORY_INCREASE_ERROR.POSTING_FAILURE,
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
            phase: 'inventory-increase-phase2',
            rolloutGate: 'phase2-business-allowlist',
            scopedEligible: true,
            direction: 'INCREASE',
            reasonCode: input.reasonCode,
            reason: normalizedReason,
            qtyInUnit: input.qtyInUnit,
            qtyBase,
            beforeQtyBase: beforeQty,
            afterQtyBase: afterQty,
            unitCostBasePence,
            valuePence,
            avgCostUnchanged: true,
            idempotencyKey,
            payloadHash,
            schemaVersion: INVENTORY_INCREASE_SCHEMA_VERSION,
            correctsAdjustmentId,
            journal: {
              debit: ACCOUNT_CODES.inventory,
              credit: ACCOUNT_CODES.inventoryGain,
            },
          }),
        },
      });

      if (correctsAdjustmentId) {
        await tx.auditLog.create({
          data: {
            businessId: input.businessId,
            userId: input.userId,
            userName: input.userName || 'Unknown',
            userRole,
            action: 'INVENTORY_ADJUST_CORRECTION_LINK',
            entity: 'StockAdjustment',
            entityId: correctsAdjustmentId,
            details: JSON.stringify({
              phase: 'inventory-increase-phase2',
              correctedByAdjustmentId: created.id,
              correctingDirection: 'INCREASE',
              originalDirection: 'DECREASE',
              reason: normalizedReason,
            }),
          },
        });
      }
    } catch (error) {
      throw new InventoryIncreaseError(
        INVENTORY_INCREASE_ERROR.AUDIT_FAILURE,
        error instanceof Error ? error.message : 'Audit write failed',
      );
    }

    return toResult(created, {
      previousQtyBase: beforeQty,
      newQtyBase: afterQty,
      replayed: false,
    });
  };

  try {
    if (outerTx) {
      return await doWork(outerTx);
    }
    return await prisma.$transaction(doWork);
  } catch (error) {
    if (
      !outerTx &&
      isPrismaUniqueConstraintOn(error, ['storeId', 'idempotencyKey'])
    ) {
      const winner = await findByIdempotencyKey(store.id, idempotencyKey);
      if (winner && winner.payloadHash === payloadHash) {
        const movement = await prisma.stockMovement.findFirst({
          where: {
            referenceType: 'STOCK_ADJUSTMENT',
            referenceId: winner.id,
            type: 'ADJUSTMENT',
          },
          select: { beforeQtyBase: true, afterQtyBase: true },
          orderBy: { createdAt: 'desc' },
        });
        return toResult(winner, {
          previousQtyBase: movement?.beforeQtyBase ?? 0,
          newQtyBase: movement?.afterQtyBase ?? winner.qtyBase,
          replayed: true,
        });
      }
      throw new InventoryIncreaseError(
        INVENTORY_INCREASE_ERROR.DUPLICATE_MISMATCH,
        'Duplicate request with a different payload',
      );
    }
    throw error;
  }
}
