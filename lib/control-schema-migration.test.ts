import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ControlStaff auth and ControlAuditLog migration SQL', () => {
  const sql = readFileSync(
    join(__dirname, '../prisma/migrations/20260904160000_control_staff_auth_and_audit/migration.sql'),
    'utf8',
  );

  it('adopts existing objects instead of failing on CREATE', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "passwordHash"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "ControlAuditLog"');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "ControlAuditLog_businessId_createdAt_idx"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "sessionVersion"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "idempotencyKey"');
  });

  it('fails closed on incompatible existing shapes', () => {
    expect(sql).toContain("RAISE EXCEPTION 'ControlStaff.passwordHash exists with an incompatible type'");
    expect(sql).toContain("RAISE EXCEPTION 'ControlAuditLog.metadata exists with an incompatible type'");
  });
});
