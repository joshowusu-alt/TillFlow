import { NextRequest, NextResponse } from 'next/server';
import { handleMobileMoneyWebhook } from '@/lib/services/mobile-money';

function headersToObject(request: NextRequest): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of request.headers.entries()) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

function verifyWebhookSecret(headers: Record<string, string>): boolean {
  const secret = process.env.MTN_MOMO_COLLECTION_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const incoming =
    headers['x-momo-webhook-secret'] ??
    headers['x-webhook-secret'] ??
    headers['authorization']?.replace(/^Bearer\s+/i, '').trim();
  return incoming === secret;
}

export async function POST(request: NextRequest) {
  try {
    const headers = headersToObject(request);
    if (!verifyWebhookSecret(headers)) {
      return NextResponse.json({ error: 'Unauthorized webhook request.' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') ?? '';
    const rawBody = await request.text();
    let parsedBody: unknown = rawBody;

    if (contentType.includes('application/json')) {
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        parsedBody = { raw: rawBody };
      }
    }

    const result = await handleMobileMoneyWebhook({
      providerKey: 'MTN_COLLECTIONS',
      body: parsedBody,
      headers,
    });

    return NextResponse.json({
      ok: true,
      received: result.received,
      updated: result.updated,
      ignored: result.ignored,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Webhook processing failed.',
      },
      { status: 500 }
    );
  }
}
