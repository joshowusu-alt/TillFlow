import { NextRequest, NextResponse } from 'next/server';
import { applyMetaWhatsAppWebhookEvents } from '@/lib/services/whatsapp-delivery';
import { verifyMetaWebhookSignature } from '@/lib/notifications/providers/meta-whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getWebhookVerifyToken() {
  return process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ?? '';
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !challenge) {
    return NextResponse.json({ error: 'Invalid webhook verification request.' }, { status: 400 });
  }

  if (!getWebhookVerifyToken() || token !== getWebhookVerifyToken()) {
    return NextResponse.json({ error: 'Webhook verification failed.' }, { status: 401 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    if (!verifyMetaWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Unauthorized webhook request.' }, { status: 401 });
    }

    let parsedBody: unknown = {};
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: 'Malformed webhook payload.' }, { status: 400 });
    }
    const result = await applyMetaWhatsAppWebhookEvents(parsedBody);

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Meta webhook processing failed.',
      },
      { status: 500 },
    );
  }
}
