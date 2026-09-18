import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import { ensureInventoryDecreaseAccounts } from '@/lib/accounting-inventory-decrease-accounts';
import { ensureInventoryIncreaseAccounts } from '@/lib/accounting-inventory-increase-accounts';
import { assertAccount5100SafeForInventoryLoss } from '@/lib/accounting-inventory-loss-5100';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import { reserveNextDocumentNumber } from '@/lib/services/document-numbers';
import { decrementInventoryBalance, incrementInventoryBalanceQtyOnly } from './shared';

export const INVENTORY_REVERSAL_SCHEMA_VERSION = 1;

export const INVENTORY_REVERSAL_ERROR = {
  UNAUTHORISED: 'UNAUTHORISED',
  INVALID_ADJUSTMENT: 'INVALID_ADJUSTMENT',
  ALREADY_REVERSED: 'ALREADY_REVERSED',
  CANNOT_REVERSE_REVERSAL: 'CANNOT_REVERSE_REVERSAL',
  INSUFFICIENT_QUANTITY: 'INSUFFICIENT_QUANTITY',
  MISSING_VALUATION: 'MISSING_VALUATION',
  DUPLICATE_MISMATCH: 'DUPLICATE_MISMATCH',
  ACCOUNT_MAPPING_UNAVAILABLE: 'ACCOUNT_MAPPING_UNAVAILABLE',
  ARITHMETIC_LIMIT: 'ARITHMETIC_LIMIT',
  POSTING_FAILURE: 'POSTING_FAILURE',
  AUDIT_FAILURE: 'AUDIT_FAILURE',
} as const;

export type InventoryReversalErrorCode =
  (typeof INVENTORY_REVERSAL_ERROR)[keyof typeof INVENTORY_REVERSAL_ERROR];

export class InventoryReversalError extends Error {
  readonly code: InventoryReversalErrorCode;

  constructor(code: InventoryReversalErrorCode, message: string) {
    super(message);
    this.name = 'InventoryReversalError';
    this.code = code;
  }
}

export type ReverseInventoryAdjustmentInput = {
  businessId: string;
  storeId: string;
  originalAdjustmentId: string;
  reason: string;
  userId: string;
  userName: string;
  userRole: string;
};

export type ReverseInventoryAdjustmentResult = {
  id: string;
  originalAdjustmentId: string;
  direction: 'INCREASE' | 'DECREASE';
  qtyInUnit: number;
  qtyBase: number;
  valuePence: number | null;
  transactionNumber: string | null;
  idempotencyKey: string;
  replayed: boolean;
};

export function buildReversalIdempotencyKey(originalAdjustmentId: string): string {
  return `${originalAdjustmentId}:REVERSAL`;
}

export function normalizeReversalReason(reason: string): string {
  return reason.trim().replace(/\s+/g, ' ');
}

export function isIncreaseDirection(direction: string): boolean {
  return direction === 'INCREASE' || direction === 'IN';
}

export function oppositeAdjustmentDirection(direction: string): 'INCREASE' | 'DECREASE' {
  return isIncreaseDirection(direction) ? 'DECREASE' : 'INCREASE';
}

export function buildInventoryReversalPayloadHash(parts: {
  originalAdjustmentId: string;
  storeId: string;
  productId: string;
  unitId: string;
  qtyBase: number;
  direction: string;
  normalizedReason: string;
  schemaVersion: number;
}): string {
  return createHash('sha256')
    .update(
      [
        parts.originalAdjustmentId,
        parts.storeId,
        parts.productId,
        parts.unitId,
        String(parts.qtyBase),
        parts.direction,
        parts.normalizedReason,
        String(parts.schemaVersion),
      ].join('\0'),
      'utf8',
    )
    .digest('hex');
}

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

function checkedMul(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new InventoryReversalError(
      INVENTORY_REVERSAL_ERROR.ARITHMETIC_LIMIT,
      'Quantity and cost must be integers',
    );
  }
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw new InventoryReversalError(
      INVENTORY_REVERSAL_ERROR.ARITHMETIC_LIMIT,
      'Arithmetic limit exceeded',
    );
  }
  return product;
}

type LockedBalance = {
  qtyOnHandBase: number;
  avgCostBasePence: number;
};

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

const REVERSAL_SELECT = {
  id: true,
  storeId: true,
  productId: true,
  unitId: true,
  qtyInUnit: true,
  qtyBase: true,
  direction: true,
  reason: true,
  reversalOfId: true,
  reversalReason: true,
  idempotencyKey: true,
  payloadHash: true,
  unitCostBasePence: true,
  valuePence: true,
  transactionNumber: true,
} as const;

function toResult(
  row: {
    id: string;
    qtyInUnit: number;
    qtyBase: number;
    direction: string;
    reversalOfId: string | null;
    valuePence: number | null;
    transactionNumber: string | null;
    idempotencyKey: string | null;
  },
  replayed: boolean,
): ReverseInventoryAdjustmentResult {
  return {
    id: row.id,
    originalAdjustmentId: row.reversalOfId ?? '',
    direction: isIncreaseDirection(row.direction) ? 'INCREASE' : 'DECREASE',
    qtyInUnit: row.qtyInUnit,
    qtyBase: row.qtyBase,
    valuePence: row.valuePence,
    transactionNumber: row.transactionNumber,
    idempotencyKey: row.idempotencyKey ?? '',
    replayed,
  };
}

/**
 * Owner-only controlled reverse. Posts the exact opposite movement and links
 * via reversalOfId. Idempotent. Cannot reverse a reversal.
 */
export async function reverseInventoryAdjustment(
  input: ReverseInventoryAdjustmentInput,
  outerTx?: Prisma.TransactionClient,
): Promise<ReverseInventoryAdjustmentResult> {
  const userRole = typeof input.userRole === 'string' ? input.userRole.trim() : '';
  if (userRole !== 'OWNER') {
    throw new InventoryReversalError(
      INVENTORY_REVERSAL_ERROR.UNAUTHORISED,
      'Only Owner may reverse a stock adjustment',
    );
  }

  const normalizedReason = normalizeReversalReason(input.reason);
  if (normalizedReason.length < 3) {
    throw new InventoryReversalError(
      INVENTORY_REVERSAL_ERROR.INVALID_ADJUSTMENT,
      'A reversal reason is required',
    );
  }

  const originalId = input.originalAdjustmentId.trim();
  if (!originalId) {
    throw new InventoryReversalError(
      INVENTORY_REVERSAL_ERROR.INVALID_ADJUSTMENT,
      'Original adjustment is required',
    );
  }

  const idempotencyKey = buildReversalIdempotencyKey(originalId);
  const client = outerTx ?? prisma;

  const store = await client.store.findFirst({
    where: { id: input.storeId, businessId: input.businessId },
    select: { id: true },
  });
  if (!store) {
    throw new InventoryReversalError(
      INVENTORY_REVERSAL_ERROR.UNAUTHORISED,
      'Store not found for this business',
    );
  }

  const original = await client.stockAdjustment.findFirst({
    where: { id: originalId, storeId: store.id },
    select: {
      id: true,
      storeId: true,
      productId: true,
      unitId: true,
      qtyInUnit: true,
      qtyBase: true,
      direction: true,
      reasonCode: true,
      reason: true,
      reversalOfId: true,
      unitCostBasePence: true,
      valuePence: true,
      idempotencyKey: true,
      payloadHash: true,
    },
  });
  if (!original) {
    throw new InventoryReversalError(
      INVENTORY_REVERSAL_ERROR.INVALID_ADJUSTMENT,
      'Original adjustment not found for this store',
    );
  }
  if (original.reversalOfId) {
    throw new InventoryReversalError(
      INVENTORY_REVERSAL_ERROR.CANNOT_REVERSE_REVERSAL,
      'Cannot reverse a reversal',
    );
  }

  const oppositeDirection = oppositeAdjustmentDirection(original.direction);
  const absQtyBase = Math.abs(original.qtyBase);
  const qtyBase = oppositeDirection === 'DECREASE' ? -absQtyBase : absQtyBase;
  const payloadHash = buildInventoryReversalPayloadHash({
    originalAdjustmentId: original.id,
    storeId: store.id,
    productId: original.productId,
    unitId: original.unitId,
    qtyBase,
    direction: oppositeDirection,
    normalizedReason,
    schemaVersion: INVENTORY_REVERSAL_SCHEMA_VERSION,
  });

  const existingByKey = await client.stockAdjustment.findUnique({
    where: { storeId_idempotencyKey: { storeId: store.id, idempotencyKey } },
    select: REVERSAL_SELECT,
  });
  if (existingByKey) {
    if (existingByKey.payloadHash === payloadHash) {
      return toResult(existingByKey, true);
    }
    throw new InventoryReversalError(
      INVENTORY_REVERSAL_ERROR.DUPLICATE_MISMATCH,
      'Duplicate reversal request with a different payload',
    );
  }

  const existingByLink = await client.stockAdjustment.findUnique({
    where: { reversalOfId: original.id },
    select: REVERSAL_SELECT,
  });
  if (existingByLink) {
    if (existingByLink.payloadHash === payloadHash) {
      return toResult(existingByLink, true);
    }
    throw new InventoryReversalError(
      INVENTORY_REVERSAL_ERROR.ALREADY_REVERSED,
      'This adjustment has already been reversed',
    );
  }

  const doWork = async (tx: Prisma.TransactionClient) => {
    const already = await tx.stockAdjustment.findUnique({
      where: { reversalOfId: original.id },
      select: REVERSAL_SELECT,
    });
    if (already) {
      if (already.payloadHash === payloadHash) return toResult(already, true);
      throw new InventoryReversalError(
        INVENTORY_REVERSAL_ERROR.ALREADY_REVERSED,
        'This adjustment has already been reversed',
      );
    }

    const balance = await lockInventoryBalance(tx, store.id, original.productId);
    if (!balance) {
      throw new InventoryReversalError(
        INVENTORY_REVERSAL_ERROR.INSUFFICIENT_QUANTITY,
        'No inventory balance exists for this product',
      );
    }

    const unitCostBasePence =
      original.unitCostBasePence && original.unitCostBasePence > 0
        ? original.unitCostBasePence
        : balance.avgCostBasePence;
    if (!Number.isInteger(unitCostBasePence) || unitCostBasePence <= 0) {
      throw new InventoryReversalError(
        INVENTORY_REVERSAL_ERROR.MISSING_VALUATION,
        'Authoritative average cost is missing or zero',
      );
    }

    const valuePence = original.valuePence && original.valuePence > 0
      ? original.valuePence
      : checkedMul(unitCostBasePence, absQtyBase);

    const beforeQty = balance.qtyOnHandBase;
    const afterQty = oppositeDirection === 'DECREASE' ? beforeQty - absQtyBase : beforeQty + absQtyBase;
    if (oppositeDirection === 'DECREASE' && balance.qtyOnHandBase < absQtyBase) {
      throw new InventoryReversalError(
        INVENTORY_REVERSAL_ERROR.INSUFFICIENT_QUANTITY,
        'Insufficient quantity on hand to reverse this increase',
      );
    }

    const transactionNumber = await reserveNextDocumentNumber(tx, input.businessId, 'stock_adjustment');

    const created = await tx.stockAdjustment.create({
      data: {
        storeId: store.id,
        productId: original.productId,
        unitId: original.unitId,
        qtyInUnit: original.qtyInUnit,
        qtyBase,
        direction: oppositeDirection,
        reason: `Reversal: ${normalizedReason}`.slice(0, 500),
        reasonCode: original.reasonCode,
        reversalOfId: original.id,
        reversalReason: normalizedReason,
        idempotencyKey,
        payloadHash,
        unitCostBasePence,
        valuePence,
        schemaVersion: INVENTORY_REVERSAL_SCHEMA_VERSION,
        transactionNumber,
        userId: input.userId,
      },
      select: REVERSAL_SELECT,
    });

    if (oppositeDirection === 'DECREASE') {
      await decrementInventoryBalance(tx, store.id, original.productId, absQtyBase);
    } else {
      await incrementInventoryBalanceQtyOnly(tx, store.id, original.productId, absQtyBase);
    }

    await tx.stockMovement.create({
      data: {
        storeId: store.id,
        productId: original.productId,
        qtyBase,
        beforeQtyBase: beforeQty,
        afterQtyBase: afterQty,
        unitCostBasePence,
        type: 'ADJUSTMENT_REVERSAL',
        referenceType: 'STOCK_ADJUSTMENT',
        referenceId: created.id,
        userId: input.userId,
      },
    });

    try {
      if (oppositeDirection === 'INCREASE') {
        await assertAccount5100SafeForInventoryLoss(tx, input.businessId);
        const accountMap = await ensureInventoryDecreaseAccounts(input.businessId, tx);
        await postJournalEntry({
          businessId: input.businessId,
          description: `Inventory adjustment reversal ${created.id}`,
          referenceType: 'STOCK_ADJUSTMENT',
          referenceId: created.id,
          lines: [
            { accountCode: ACCOUNT_CODES.inventory, debitPence: valuePence },
            { accountCode: ACCOUNT_CODES.inventoryLoss, creditPence: valuePence },
          ],
          prismaClient: tx as any,
          accountMap,
        });
      } else {
        const accountMap = await ensureInventoryIncreaseAccounts(input.businessId, tx);
        await postJournalEntry({
          businessId: input.businessId,
          description: `Inventory adjustment reversal ${created.id}`,
          referenceType: 'STOCK_ADJUSTMENT',
          referenceId: created.id,
          lines: [
            { accountCode: ACCOUNT_CODES.inventoryGain, debitPence: valuePence },
            { accountCode: ACCOUNT_CODES.inventory, creditPence: valuePence },
          ],
          prismaClient: tx as any,
          accountMap,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Journal posting failed';
      if (
        message.includes('Account not found') ||
        message.includes('Account 5100') ||
        message.includes('Account 4100') ||
        message.includes('Account 1200') ||
        message.includes('incorrectly configured')
      ) {
        throw new InventoryReversalError(
          INVENTORY_REVERSAL_ERROR.ACCOUNT_MAPPING_UNAVAILABLE,
          message,
        );
      }
      throw new InventoryReversalError(INVENTORY_REVERSAL_ERROR.POSTING_FAILURE, message);
    }

    try {
      await tx.auditLog.create({
        data: {
          businessId: input.businessId,
          userId: input.userId,
          userName: input.userName || 'Unknown',
          userRole,
          action: 'INVENTORY_ADJUST_REVERSAL',
          entity: 'StockAdjustment',
          entityId: created.id,
          details: JSON.stringify({
            originalAdjustmentId: original.id,
            reversalOfId: original.id,
            direction: oppositeDirection,
            qtyInUnit: original.qtyInUnit,
            qtyBase,
            beforeQtyBase: beforeQty,
            afterQtyBase: afterQty,
            valuePence,
            reason: normalizedReason,
            idempotencyKey,
            payloadHash,
            transactionNumber,
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          businessId: input.businessId,
          userId: input.userId,
          userName: input.userName || 'Unknown',
          userRole,
          action: 'INVENTORY_ADJUST_REVERSAL',
          entity: 'StockAdjustment',
          entityId: original.id,
          details: JSON.stringify({
            reversedByAdjustmentId: created.id,
            reason: normalizedReason,
          }),
        },
      });
    } catch (error) {
      throw new InventoryReversalError(
        INVENTORY_REVERSAL_ERROR.AUDIT_FAILURE,
        error instanceof Error ? error.message : 'Audit write failed',
      );
    }

    return toResult(created, false);
  };

  try {
    if (outerTx) return await doWork(outerTx);
    return await prisma.$transaction(doWork);
  } catch (error) {
    if (
      !outerTx &&
      (isPrismaUniqueConstraintOn(error, ['storeId', 'idempotencyKey']) ||
        isPrismaUniqueConstraintOn(error, ['reversalOfId']))
    ) {
      const winner =
        (await prisma.stockAdjustment.findUnique({
          where: { storeId_idempotencyKey: { storeId: store.id, idempotencyKey } },
          select: REVERSAL_SELECT,
        })) ??
        (await prisma.stockAdjustment.findUnique({
          where: { reversalOfId: original.id },
          select: REVERSAL_SELECT,
        }));
      if (winner && winner.payloadHash === payloadHash) {
        return toResult(winner, true);
      }
      throw new InventoryReversalError(
        winner ? INVENTORY_REVERSAL_ERROR.ALREADY_REVERSED : INVENTORY_REVERSAL_ERROR.DUPLICATE_MISMATCH,
        winner
          ? 'This adjustment has already been reversed'
          : 'Duplicate reversal request with a different payload',
      );
    }
    throw error;
  }
}
