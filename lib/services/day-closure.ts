import { prisma } from '@/lib/prisma';

export interface CreateDayClosureInput {
  businessId: string;
  storeId: string;
  closedByUserId: string;
  /** Raw date — will be truncated to UTC midnight before writing. */
  date?: Date;
  summaryJson: string;
}

/**
 * Creates a DayClosure record for the given store on the given calendar day.
 *
 * `closureDate` is **always** truncated to UTC midnight so that the
 * `@@unique([storeId, closureDate])` constraint reliably prevents duplicate
 * closures for the same calendar day, even when a closure is retried
 * milliseconds after a failure.
 *
 * Returns the created record, or throws a Prisma unique-constraint error if a
 * closure for that store / day already exists.
 */
export async function createDayClosure(input: CreateDayClosureInput) {
  const rawDate = input.date ?? new Date();

  // Truncate to UTC midnight — must be idempotent across retries.
  const midnight = new Date(rawDate);
  midnight.setUTCHours(0, 0, 0, 0);

  return prisma.dayClosure.create({
    data: {
      businessId: input.businessId,
      storeId: input.storeId,
      closedByUserId: input.closedByUserId,
      closureDate: midnight,
      summaryJson: input.summaryJson,
    },
  });
}

/**
 * Returns the most recent DayClosure for the given store, or `null`.
 */
export async function getLastDayClosure(storeId: string, businessId: string) {
  return prisma.dayClosure.findFirst({
    where: { storeId, businessId },
    orderBy: { closureDate: 'desc' },
  });
}
