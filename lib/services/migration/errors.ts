/**
 * Slice 2A migration-domain errors (sealed services).
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

export class MigrationServiceError extends Error {
  readonly code: MigrationServiceErrorCode;
  readonly httpStatus: number;

  constructor(code: MigrationServiceErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = 'MigrationServiceError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function isMigrationServiceError(error: unknown): error is MigrationServiceError {
  return error instanceof MigrationServiceError;
}
