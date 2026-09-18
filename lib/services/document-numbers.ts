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
      nextVal: 1,
    },
    update: {
      nextVal: { increment: 1 },
    },
    select: { nextVal: true },
  } as never);
  return formatDocumentNumber(sequenceName, updated.nextVal);
}
