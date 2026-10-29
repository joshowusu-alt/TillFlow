/** Only the database adapter may attach this provenance to generic transport/quota errors. */
export class DatabaseUnavailableError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown) {
    super('Database temporarily unavailable');
    this.name = 'DatabaseUnavailableError';
    this.cause = cause;
  }
}

/** Never classify a payment/email provider timeout as a database outage. */
export function isDatabaseUnavailable(error: unknown, databaseContext = false): boolean {
  const seen = new Set<unknown>();
  let current = error;
  let fromDatabase = databaseContext;
  for (let depth = 0; current && typeof current === 'object' && depth < 8; depth++) {
    if (seen.has(current)) break;
    seen.add(current);
    const e = current as { code?: string; name?: string; message?: string; status?: number; statusCode?: number; cause?: unknown };
    if (e instanceof DatabaseUnavailableError) return true;
    // Normal Prisma query/constraint errors are never quota refusals, even when
    // their text (or a nested cause) contains a field/value such as quota or 402.
    // P2024 is the explicit connection-pool timeout exception.
    if (/^P2\d{3}$/.test(e.code ?? '') && e.code !== 'P2024') return false;
    fromDatabase ||= /^PrismaClient/.test(e.name ?? '') || /\bneon\b/i.test(e.message ?? '');
    if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(e.code ?? '') ||
        e.name === 'PrismaClientInitializationError') return true;
    if (fromDatabase) {
      if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(e.code ?? '')) return true;
      if (e.status === 402 || e.statusCode === 402 ||
          /quota|usage[ -]?limit|compute.*limit|network.*limit|payment required|\b402\b|endpoint.*disabled/i.test(e.message ?? '')) return true;
    }
    current = e.cause;
  }
  return false;
}

/** Called only around actual Prisma operations, preserving existing Prisma error codes/retries. */
export async function runDatabaseOperation<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (!isDatabaseUnavailable(error) && isDatabaseUnavailable(error, true)) {
      throw new DatabaseUnavailableError(error);
    }
    throw error;
  }
}
