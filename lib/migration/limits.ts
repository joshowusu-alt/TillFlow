/** Phase 1 hard limits for migration uploads and retained JSON. */

export const MIGRATION_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MIGRATION_MAX_ROWS = 50_000;
export const MIGRATION_MAX_EXCEPTIONS_RETAINED = 2_000;
export const MIGRATION_MAX_JSON_CHARS = 500_000;
export const MIGRATION_DEFAULT_CHUNK_SIZE = 200;
/** Retention guidance for operators (not an automated cron in Phase 1). */
export const MIGRATION_FILE_RETENTION_DAYS = 90;

export function truncateExceptionsForStorage<T extends { message: string }>(
  exceptions: T[],
): { retained: T[]; truncated: number } {
  if (exceptions.length <= MIGRATION_MAX_EXCEPTIONS_RETAINED) {
    return { retained: exceptions, truncated: 0 };
  }
  return {
    retained: exceptions.slice(0, MIGRATION_MAX_EXCEPTIONS_RETAINED),
    truncated: exceptions.length - MIGRATION_MAX_EXCEPTIONS_RETAINED,
  };
}

export function clampJsonString(value: unknown): string {
  const raw = JSON.stringify(value);
  if (raw.length <= MIGRATION_MAX_JSON_CHARS) return raw;
  return JSON.stringify({
    truncated: true,
    originalChars: raw.length,
    note: 'Payload exceeded MIGRATION_MAX_JSON_CHARS and was replaced with this summary.',
  });
}

/** Neutralise formula/CSV injection in downloaded exception reports. */
export function sanitizeCsvCell(value: string): string {
  const s = String(value ?? '');
  if (/^[=+\-@]/.test(s)) return `'${s}`;
  return s;
}
