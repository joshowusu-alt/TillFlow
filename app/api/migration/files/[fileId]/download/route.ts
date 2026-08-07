import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import {
  isMigrationServiceError,
} from '@/lib/services/migration/errors';
import { openMigrationFileDownload } from '@/lib/services/migration/file-download';

export const runtime = 'nodejs';

/**
 * Authenticated private download of a finalised migration file.
 * Streams through the server using MIGRATION_BLOB_READ_WRITE_TOKEN — never
 * redirects to a public Blob URL.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ fileId: string }> | { fileId: string } },
) {
  try {
    const user = await requireRole(['OWNER', 'MANAGER']);
    const params = await Promise.resolve(context.params);
    const fileId = params.fileId;
    if (!fileId) {
      return NextResponse.json({ error: 'fileId required' }, { status: 400 });
    }

    const download = await openMigrationFileDownload(
      {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        businessId: user.businessId,
      },
      { fileId },
    );

    const headers = new Headers();
    headers.set('Content-Type', download.contentType);
    headers.set('Content-Length', String(download.byteLength));
    headers.set(
      'Content-Disposition',
      `attachment; filename="${download.downloadFilename.replace(/"/g, '')}"`,
    );
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, no-store');

    return new NextResponse(download.stream, { status: 200, headers });
  } catch (error) {
    if (isMigrationServiceError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }
    // requireRole redirects unauthenticated users; other errors stay generic.
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    return NextResponse.json({ error: 'Download failed.' }, { status: 500 });
  }
}
