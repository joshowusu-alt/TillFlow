/**
 * Lightweight migration domain errors (avoid importing Next/prisma action-utils in unit tests).
 */

export class MigrationContractError extends Error {
  readonly code: string;

  constructor(message: string, code = 'MIGRATION_CONTRACT') {
    super(message);
    this.name = 'MigrationContractError';
    this.code = code;
  }
}

export class MigrationPolicyError extends Error {
  readonly code: string;

  constructor(message: string, code = 'MIGRATION_POLICY') {
    super(message);
    this.name = 'MigrationPolicyError';
    this.code = code;
  }
}

export class MigrationLifecycleError extends Error {
  readonly code: string;

  constructor(message: string, code = 'MIGRATION_LIFECYCLE') {
    super(message);
    this.name = 'MigrationLifecycleError';
    this.code = code;
  }
}
