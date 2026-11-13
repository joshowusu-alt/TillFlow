import { UserError } from '@/lib/action-utils';

/** Shown when an opening-stock chunk hits the interactive transaction limit. */
export const IMPORT_STOCK_TIMEOUT_MESSAGE =
  'Saving stock timed out. Nothing was double-counted. Press Confirm again to finish the remaining stock.';

/** Shown when a database failure aborts the import after some work may be saved. */
export const IMPORT_STOCK_INCOMPLETE_MESSAGE =
  'Saving stock did not finish. Nothing was double-counted. Press Confirm again to finish the remaining stock.';

export function isImportWriteTimeout(message: string): boolean {
  return /timed out|timeout|expired transaction|transaction already closed|\bP2028\b|\bP2024\b/i.test(message);
}

function looksLikeDatabaseInternal(message: string): boolean {
  return /prisma|\bP\d{4}\b|raw query failed|\b42P01\b|ECONN|syntax error at|does not exist/i.test(message);
}

/**
 * Message safe to show on the import screen.
 * Validation and other UserError text pass through. Database internals do not.
 */
export function userFacingImportFailure(error: unknown): string {
  if (error instanceof UserError) return error.message;
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (isImportWriteTimeout(message)) return IMPORT_STOCK_TIMEOUT_MESSAGE;
  if (looksLikeDatabaseInternal(message)) return IMPORT_STOCK_INCOMPLETE_MESSAGE;
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 400) return IMPORT_STOCK_INCOMPLETE_MESSAGE;
  return trimmed;
}
