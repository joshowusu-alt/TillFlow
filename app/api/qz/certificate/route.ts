import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { getQzCertificate } from '@/lib/qz-signing.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const certificate = getQzCertificate();
  if (!certificate) {
    return new NextResponse('QZ certificate not configured.', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }

  return new NextResponse(certificate, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}
