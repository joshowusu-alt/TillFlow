import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toPublicMigrationError } from '@/lib/services/migration/errors';
import { finaliseMigrationUploadedObject } from '@/lib/services/migration/file-upload';
import { isRedirectError } from 'next/dist/client/components/redirect';

export const runtime = 'nodejs';

/**
 * Finalise a private object already uploaded via a prepare-issued client token.
 * Re-verifies ownership, size, content policy and checksum server-side.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(['OWNER', 'MANAGER']);
    const body = (await request.json()) as Record<string, unknown>;
    const result = await finaliseMigrationUploadedObject(
      {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        businessId: user.businessId,
      },
      {
        packageId: String(body.packageId ?? ''),
        entityType: String(body.entityType ?? ''),
        pathname: String(body.pathname ?? ''),
        expectedVersion: body.expectedVersion as number,
        replace: Boolean(body.replace),
        originalFilename: (body.originalFilename as string | null) ?? null,
        contentType: (body.contentType as string | null) ?? null,
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const pub = toPublicMigrationError(error);
    return NextResponse.json(pub.body, { status: pub.status });
  }
}
