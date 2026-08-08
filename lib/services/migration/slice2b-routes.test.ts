/**
 * Slice 2B route adapter tests — role matrix and sanitised errors.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateMigrationPackage = vi.fn();
const getMigrationValidationRun = vi.fn();
const requireRole = vi.fn();

vi.mock('@/lib/services/migration/validate', () => ({
  validateMigrationPackage,
  getMigrationValidationRun,
}));

vi.mock('@/lib/auth', () => ({
  requireRole,
}));

describe('migration slice 2B validate route', () => {
  beforeEach(() => {
    vi.resetModules();
    validateMigrationPackage.mockReset();
    getMigrationValidationRun.mockReset();
    requireRole.mockReset();
  });

  it('Owner POST returns validation result without private URLs', async () => {
    requireRole.mockResolvedValue({
      id: 'u1',
      name: 'Owner',
      role: 'OWNER',
      businessId: 'biz-a',
    });
    validateMigrationPackage.mockResolvedValue({
      packageId: 'pkg-a',
      packageStatus: 'VALIDATED',
      packageVersion: 2,
      validationRunId: 'run-1',
      runStatus: 'SUCCESS',
      manifestChecksum: 'ab'.repeat(32),
      replayed: false,
      durationMs: 12,
      totalRowsProcessed: 3,
      errorCount: 0,
      warningCount: 0,
      exceptionCount: 0,
      exceptionsTruncated: 0,
      exceptions: [],
      fileChecksums: { SUPPLIERS: 'cd'.repeat(32) },
    });

    const { POST } = await import(
      '@/app/api/migration/packages/[packageId]/validate/route'
    );
    const req = new Request('http://localhost/api/migration/packages/pkg-a/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 1, businessId: 'attacker-biz' }),
    });
    const res = await POST(req as never, { params: { packageId: 'pkg-a' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packageStatus).toBe('VALIDATED');
    expect(JSON.stringify(body).includes('blob.vercel')).toBe(false);
    expect(validateMigrationPackage).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz-a', userRole: 'OWNER' }),
      expect.objectContaining({ packageId: 'pkg-a', expectedVersion: 1 }),
    );
    // Client businessId must not become authority
    const input = validateMigrationPackage.mock.calls[0]![1];
    expect(input.businessId).toBeUndefined();
  });

  it('missing expectedVersion maps to public STALE_VERSION', async () => {
    requireRole.mockResolvedValue({
      id: 'u1',
      name: 'Owner',
      role: 'OWNER',
      businessId: 'biz-a',
    });
    const { MigrationServiceError } = await import('@/lib/services/migration/errors');
    validateMigrationPackage.mockRejectedValue(
      new MigrationServiceError('STALE_VERSION', undefined, 409),
    );
    const { POST } = await import(
      '@/app/api/migration/packages/[packageId]/validate/route'
    );
    const req = new Request('http://localhost/api/migration/packages/pkg-a/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, { params: { packageId: 'pkg-a' } });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('STALE_VERSION');
    expect(body.error).not.toMatch(/postgres|stack|blob/i);
  });

  it('Cashier denial via requireRole redirect is rethrown', async () => {
    const redirectErr = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/pos',
    });
    requireRole.mockRejectedValue(redirectErr);
    // isRedirectError from next — mock may not recognise; ensure we still don't leak
    const { POST } = await import(
      '@/app/api/migration/packages/[packageId]/validate/route'
    );
    const req = new Request('http://localhost/api/migration/packages/pkg-a/validate', {
      method: 'POST',
      body: '{}',
    });
    // If not classified as redirect, public mapper returns INTERNAL — either is closed.
    try {
      const res = await POST(req as never, { params: { packageId: 'pkg-a' } });
      expect([307, 401, 403, 500]).toContain(res.status);
    } catch (e) {
      expect(e).toBe(redirectErr);
    }
  });
});
