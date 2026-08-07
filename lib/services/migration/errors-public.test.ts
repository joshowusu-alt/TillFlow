import { describe, expect, it } from 'vitest';
import {
  MigrationServiceError,
  MIGRATION_PUBLIC_ERROR_MESSAGES,
  toPublicMigrationError,
  type MigrationServiceErrorCode,
} from '@/lib/services/migration/errors';

const ALL_CODES = Object.keys(
  MIGRATION_PUBLIC_ERROR_MESSAGES,
) as MigrationServiceErrorCode[];

describe('toPublicMigrationError', () => {
  it('never leaks fabricated secrets from unknown Error', () => {
    const secret = 'SECRET_DB_DETAIL_xyz';
    const pub = toPublicMigrationError(new Error(secret));
    expect(pub.body.code).toBe('INTERNAL');
    expect(pub.body.error).toBe(MIGRATION_PUBLIC_ERROR_MESSAGES.INTERNAL);
    expect(pub.body.error).not.toContain(secret);
    expect(JSON.stringify(pub)).not.toContain(secret);
  });

  it('maps every MigrationServiceError code to MIGRATION_PUBLIC_ERROR_MESSAGES', () => {
    for (const code of ALL_CODES) {
      const pub = toPublicMigrationError(new MigrationServiceError(code));
      expect(pub.body.code).toBe(code);
      expect(pub.body.error).toBe(MIGRATION_PUBLIC_ERROR_MESSAGES[code]);
    }
  });

  it('AUDIT_FAILURE public message contains no prisma/constraint/token leaks', () => {
    const pub = toPublicMigrationError(
      new MigrationServiceError('AUDIT_FAILURE', 'prisma constraint token leak detail'),
    );
    expect(pub.body.code).toBe('AUDIT_FAILURE');
    expect(pub.body.error).toBe(MIGRATION_PUBLIC_ERROR_MESSAGES.AUDIT_FAILURE);
    const lower = pub.body.error.toLowerCase();
    expect(lower).not.toContain('prisma');
    expect(lower).not.toContain('constraint');
    expect(lower).not.toContain('token');
  });

  it('STORAGE_FAILURE public message contains no prisma/constraint/token leaks', () => {
    const pub = toPublicMigrationError(
      new MigrationServiceError('STORAGE_FAILURE', 'prisma token constraint detail'),
    );
    expect(pub.body.code).toBe('STORAGE_FAILURE');
    expect(pub.body.error).toBe(MIGRATION_PUBLIC_ERROR_MESSAGES.STORAGE_FAILURE);
    const lower = pub.body.error.toLowerCase();
    expect(lower).not.toContain('prisma');
    expect(lower).not.toContain('constraint');
    expect(lower).not.toContain('token');
  });
});
