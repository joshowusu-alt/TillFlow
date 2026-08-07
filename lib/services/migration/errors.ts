/**
 * Slice 2A migration-domain errors (sealed services).
 *
 * Client-facing messages are stable and non-sensitive. Raw database, Blob,
 * SDK and provider details must never cross the server boundary.
 */

export type MigrationServiceErrorCode =
  | 'UNAUTHENTICATED'
  | 'ROLE_DENIED'
  | 'CROSS_TENANT_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'LIFECYCLE'
  | 'CONTRACT'
  | 'STORAGE_NOT_CONFIGURED'
  | 'STORAGE_FAILURE'
  | 'FILE_POLICY'
  | 'STALE_VERSION'
  | 'AUDIT_FAILURE'
  | 'INTERNAL';

/** Stable messages safe to return to authenticated clients. */
export const MIGRATION_PUBLIC_ERROR_MESSAGES: Record<MigrationServiceErrorCode, string> = {
  UNAUTHENTICATED: 'Authentication required for migration access.',
  ROLE_DENIED: 'Migration access denied for this role.',
  CROSS_TENANT_DENIED: 'Migration package not found.',
  NOT_FOUND: 'Migration package not found.',
  CONFLICT: 'The migration request conflicts with an existing record.',
  LIFECYCLE: 'Package is not mutable in its current lifecycle state.',
  CONTRACT: 'The migration request is invalid.',
  STORAGE_NOT_CONFIGURED: 'Migration private storage is not configured for this environment.',
  STORAGE_FAILURE: 'Unable to complete private migration storage operation.',
  FILE_POLICY: 'The uploaded file does not meet migration file policy rules.',
  STALE_VERSION: 'Package was modified by another request. Retry with the current version.',
  AUDIT_FAILURE: 'Unable to complete the migration update. Please try again.',
  INTERNAL: 'Unable to complete the migration request. Please try again.',
};

export class MigrationServiceError extends Error {
  readonly code: MigrationServiceErrorCode;
  readonly httpStatus: number;

  constructor(code: MigrationServiceErrorCode, message?: string, httpStatus = 400) {
    super(message ?? MIGRATION_PUBLIC_ERROR_MESSAGES[code]);
    this.name = 'MigrationServiceError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function isMigrationServiceError(error: unknown): error is MigrationServiceError {
  return error instanceof MigrationServiceError;
}

export type PublicMigrationErrorBody = {
  error: string;
  code: MigrationServiceErrorCode;
};

/** Map any thrown value to a client-safe migration error body. */
export function toPublicMigrationError(error: unknown): {
  status: number;
  body: PublicMigrationErrorBody;
} {
  if (isMigrationServiceError(error)) {
    return {
      status: error.httpStatus,
      body: {
        code: error.code,
        error: MIGRATION_PUBLIC_ERROR_MESSAGES[error.code],
      },
    };
  }
  return {
    status: 500,
    body: {
      code: 'INTERNAL',
      error: MIGRATION_PUBLIC_ERROR_MESSAGES.INTERNAL,
    },
  };
}

/** Safe operational log fields only — never log raw CSV, tokens, or secrets. */
export function safeMigrationLogFields(input: {
  correlationId?: string;
  code?: string;
  packageId?: string;
  businessId?: string;
  entityType?: string;
  storageKey?: string;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value == null || value === '') continue;
    out[key] = String(value);
  }
  return out;
}
