import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toPublicMigrationError } from '@/lib/services/migration/errors';
import { getMigrationValidationRun } from '@/lib/services/migration/validate';
import { isRedirectError } from 'next/dist/client/components/redirect';

export const runtime = 'nodejs';

/**
 * Slice 2B — read a tenant-scoped validation run (thin results surface).
 * Does not trigger validation.
 */
export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ packageId: string; runId: string }> | { packageId: string; runId: string };
  },
) {
  try {
    const user = await requireRole(['OWNER', 'MANAGER']);
    const params = await Promise.resolve(context.params);
    const result = await getMigrationValidationRun(
      {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        businessId: user.businessId,
      },
      { packageId: params.packageId, runId: params.runId },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const pub = toPublicMigrationError(error);
    return NextResponse.json(pub.body, { status: pub.status });
  }
}
