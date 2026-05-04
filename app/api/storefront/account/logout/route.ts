import { NextRequest, NextResponse } from 'next/server';
import { destroyStorefrontSession } from '@/lib/services/storefront-customers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const slug = String(body?.slug ?? '');
  if (!slug) {
    return NextResponse.json({ error: 'Missing slug.' }, { status: 400 });
  }

  await destroyStorefrontSession(slug);
  return NextResponse.json({ ok: true });
}
