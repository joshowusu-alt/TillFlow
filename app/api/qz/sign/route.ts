import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { isQzSigningConfigured, signQzPayload } from '@/lib/qz-signing.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isQzSigningConfigured()) {
    return new NextResponse('QZ signing is not configured.', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }

  let payload = '';
  try {
    const body = await request.json();
    payload = typeof body?.request === 'string' ? body.request : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!payload) {
    return NextResponse.json({ error: 'Missing request payload.' }, { status: 400 });
  }

  try {
    const signature = signQzPayload(payload);
    return new NextResponse(signature, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  } catch (error) {
    console.error('[qz] signing failed:', error);
    return NextResponse.json({ error: 'Unable to sign QZ payload.' }, { status: 500 });
  }
}
