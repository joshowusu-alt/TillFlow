import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toPublicMigrationError } from '@/lib/services/migration/errors';
import { validateMigrationPackage } from '@/lib/services/migration/validate';
import { isRedirectError } from 'next/dist/client/components/redirect';

export const runtime = 'nodejs';

/**
 * Slice 2B — validate a finalised Phase 1 migration package.
 * Owner/Manager only. Session business is authoritative. No GET trigger.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ packageId: string }> | { packageId: string } },
) {
  try {
    const user = await requireRole(['OWNER', 'MANAGER']);
    const params = await Promise.resolve(context.params);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await validateMigrationPackage(
      {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        businessId: user.businessId,
      },
      {
        packageId: params.packageId,
        expectedVersion: body.expectedVersion as number,
        // Explicitly ignore any client-supplied businessId.
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const pub = toPublicMigrationError(error);
    return NextResponse.json(pub.body, { status: pub.status });
  }
}
