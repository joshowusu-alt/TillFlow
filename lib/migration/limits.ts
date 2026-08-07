/**
 * Hard limits, expiry constants, and CSV export sanitisation.
 *
 * P1 Slice 1 contractual limits (owner-closed):
 * - 25 MiB upload / uncompressed per file
 * - 50_000 data rows (excluding header)
 * - 32 columns
 * - no compressed uploads
 */

/** Unapproved packages expire 14 days after initial package creation. */
export const MIGRATION_UNAPPROVED_EXPIRY_DAYS = 14;

/** Approved packages remain import-eligible for 14 days after approval. */
export const MIGRATION_APPROVAL_VALIDITY_DAYS = 14;

/** Retain protected source files for 90 days after terminal package status. */
export const MIGRATION_FILE_RETENTION_DAYS = 90;

/** Contractual max uploaded bytes per file (25 MiB). */
export const MIGRATION_MAX_UPLOAD_BYTES = 26_214_400;

/** Contractual max uncompressed bytes per file (25 MiB; compression disabled). */
export const MIGRATION_MAX_UNCOMPRESSED_BYTES = 26_214_400;

/**
 * @deprecated Use MIGRATION_MAX_UPLOAD_BYTES. Kept as an alias so older imports
 * cannot silently retain the retired 5 MiB constant.
 */
export const MIGRATION_MAX_FILE_BYTES = MIGRATION_MAX_UPLOAD_BYTES;

/** Maximum data rows per file, excluding the header row. */
export const MIGRATION_MAX_ROWS = 50_000;

/** Maximum CSV columns per file (Phase 1 entity headers are ≤11). */
export const MIGRATION_MAX_COLUMNS = 32;

export const MIGRATION_MAX_EXCEPTIONS_RETAINED = 2_000;
export const MIGRATION_MAX_JSON_CHARS = 500_000;

/** Compressed uploads are not permitted in P1. */
export const MIGRATION_COMPRESSION_ALLOWED = false;

/** Documented future import chunk size — not used by P1 slice 1. */
export const MIGRATION_DEFAULT_CHUNK_SIZE = 200;

export const MIGRATION_FILE_STORAGE_STATUSES = ['PENDING', 'FINALISED', 'FAILED'] as const;
export type MigrationFileStorageStatus = (typeof MIGRATION_FILE_STORAGE_STATUSES)[number];

export const MIGRATION_VALIDATION_RUN_STATUSES = ['SUCCESS', 'FAILED', 'STALE'] as const;
export type MigrationValidationRunStatus = (typeof MIGRATION_VALIDATION_RUN_STATUSES)[number];

export function computePackageExpiresAt(createdAt: Date): Date {
  const expires = new Date(createdAt.getTime());
  expires.setUTCDate(expires.getUTCDate() + MIGRATION_UNAPPROVED_EXPIRY_DAYS);
  return expires;
}

export function computeApprovalExpiresAt(approvedAt: Date): Date {
  const expires = new Date(approvedAt.getTime());
  expires.setUTCDate(expires.getUTCDate() + MIGRATION_APPROVAL_VALIDITY_DAYS);
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
