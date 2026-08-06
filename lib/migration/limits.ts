/**
 * Hard limits, expiry constants, and CSV export sanitisation.
 *
 * Provenance: adapted from historic lib/migration/limits.ts (0f6a917 / 995c96f).
 */

/** Unapproved packages expire 14 days after initial package creation. */
export const MIGRATION_UNAPPROVED_EXPIRY_DAYS = 14;

/** Retain protected source files for 90 days after terminal package status. */
export const MIGRATION_FILE_RETENTION_DAYS = 90;

export const MIGRATION_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MIGRATION_MAX_ROWS = 50_000;
export const MIGRATION_MAX_EXCEPTIONS_RETAINED = 2_000;
export const MIGRATION_MAX_JSON_CHARS = 500_000;
/** Documented future import chunk size — not used by P0 execution. */
export const MIGRATION_DEFAULT_CHUNK_SIZE = 200;

export function computePackageExpiresAt(createdAt: Date): Date {
  const expires = new Date(createdAt.getTime());
  expires.setUTCDate(expires.getUTCDate() + MIGRATION_UNAPPROVED_EXPIRY_DAYS);
  return expires;
}

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

/**
 * Neutralise formula/CSV injection in downloaded exception / export cells.
 * Does not mutate values stored for import identity.
 */
export function sanitizeCsvCell(value: string): string {
  const s = String(value ?? '');
  if (/^[=+\-@]/.test(s)) return `'${s}`;
  return s;
}

/** Store only a safe basename — strip path segments and NULs. */
export function sanitizeOriginalFilename(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).replace(/\u0000/g, '').trim();
  if (!trimmed) return null;
  const base = trimmed.split(/[/\\]/).pop() ?? trimmed;
  const cleaned = base.replace(/[<>:"|?*\u0000-\u001f]/g, '_').slice(0, 255);
  return cleaned || null;
}
