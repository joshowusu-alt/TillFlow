import type { Prisma } from '@prisma/client';
import { isPrismaUniqueConstraintOn } from './money-idempotency';
import {
  type DocumentSequenceName,
  formatDocumentNumber,
} from '@/lib/reliability/walkthrough-contracts';

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === code);
}

type SequenceClient = {
  businessSequence: {
    update: (args: unknown) => Promise<{ nextVal: number }>;
    create: (args: unknown) => Promise<{ nextVal: number }>;
  };
};

/**
 * Reserve the next tenant-scoped presentation number.
 * Does not replace primary keys. Historic rows keep a null transactionNumber.
 */
export async function reserveNextDocumentNumber(
  tx: SequenceClient | Prisma.TransactionClient,
  businessId: string,
  sequenceName: DocumentSequenceName,
): Promise<string> {
  const sequenceWhere = {
    businessId_sequenceName: {
      businessId,
      sequenceName,
    },
  };

  try {
    const updated = await tx.businessSequence.update({
      where: sequenceWhere,
      data: { nextVal: { increment: 1 } },
      select: { nextVal: true },
    } as never);
    return formatDocumentNumber(sequenceName, updated.nextVal);
  } catch (error) {
    if (!hasPrismaErrorCode(error, 'P2025')) {
      throw error;
    }
  }

  try {
    const created = await tx.businessSequence.create({
      data: {
        businessId,
        sequenceName,
        nextVal: 1,
      },
      select: { nextVal: true },
    } as never);
    return formatDocumentNumber(sequenceName, created.nextVal);
  } catch (error) {
    if (!isPrismaUniqueConstraintOn(error, ['businessId', 'sequenceName'])) {
      throw error;
    }
    const updated = await tx.businessSequence.update({
      where: sequenceWhere,
      data: { nextVal: { increment: 1 } },
      select: { nextVal: true },
    } as never);
    return formatDocumentNumber(sequenceName, updated.nextVal);
  }
}
