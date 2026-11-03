import type { Prisma } from '@prisma/client';
import {
  type DocumentSequenceName,
  formatDocumentNumber,
} from '@/lib/reliability/walkthrough-contracts';

type SequenceClient = {
  businessSequence: {
    upsert: (args: unknown) => Promise<{ nextVal: number }>;
  };
};

/**
 * Reserve the next tenant-scoped presentation number.
 * Does not replace primary keys. Historic rows keep a null transactionNumber.
 * Uses upsert so concurrent first-inserts do not abort the caller transaction.
 */
export async function reserveNextDocumentNumber(
  tx: SequenceClient | Prisma.TransactionClient,
  businessId: string,
  sequenceName: DocumentSequenceName,
): Promise<string> {
  return formatDocumentNumber(sequenceName, await reserveNextSequenceValue(tx, businessId, sequenceName));
}

/** Native upsert also handles concurrent bootstrap without aborting a PG tx. */
export async function reserveNextSequenceValue(
  tx: SequenceClient | Prisma.TransactionClient,
  businessId: string,
  sequenceName: DocumentSequenceName,
  initialValue = 1,
): Promise<number> {
  if (!Number.isSafeInteger(initialValue) || initialValue < 1) throw new Error('Invalid initial document sequence value');
  const updated = await tx.businessSequence.upsert({
    where: {
      businessId_sequenceName: {
        businessId,
        sequenceName,
      },
    },
    create: {
      businessId,
      sequenceName,
      nextVal: initialValue,
    },
    update: {
      nextVal: { increment: 1 },
    },
    select: { nextVal: true },
  } as never);
  return updated.nextVal;
}
