/**
 * Shared SMS transport. Both OTP delivery and the storefront-notifications
 * dispatcher route through here so we have one place to add providers,
 * retries, dev-mode handling, and observability.
 *
 * The transport is intentionally dumb: take a recipient + body, send it,
 * report success/failure. Idempotency, retries, and templating belong to
 * callers.
 */

const DEFAULT_SENDER_ID = 'TillFlow';

export type StorefrontSmsResult =
  | { ok: true; providerStatus: string; messageId?: string }
  | { ok: false; error: string; providerStatus?: string; retryable: boolean };

export type SendStorefrontSmsArgs = {
  to: string;
  body: string;
  /**
   * Override the sender ID for this message. If omitted, the env-configured
   * Hubtel sender ID is used; if that's also missing, we fall back to
   * "TillFlow". Custom sender IDs require Hubtel approval.
   */
  senderId?: string | null;
};

function isDevMode(): boolean {
  return String(process.env.SMS_DEV_MODE ?? '').trim().toLowerCase() === 'true';
}

function resolveSenderId(override?: string | null): string {
  const trimmed = override?.trim();
  if (trimmed) return trimmed.slice(0, 11); // Hubtel alphanumeric IDs cap at 11 chars
  const fromEnv = process.env.HUBTEL_SMS_SENDER_ID?.trim();
  if (fromEnv) return fromEnv.slice(0, 11);
  return DEFAULT_SENDER_ID;
}

function hasHubtelCredentials(): boolean {
  return Boolean(process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET);
}

async function sendViaHubtel(args: {
  to: string;
  body: string;
  senderId: string;
}): Promise<StorefrontSmsResult> {
  const clientId = process.env.HUBTEL_CLIENT_ID!;
  const clientSecret = process.env.HUBTEL_CLIENT_SECRET!;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams({
    From: args.senderId,
    To: args.to,
    Content: args.body,
    RegisteredDelivery: 'true',
  });
  const url = `https://smsc.hubtel.com/v1/messages/send?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error contacting SMS provider.',
      retryable: true,
    };
  }

  if (!response.ok) {
    const status = String(response.status);
    // 4xx (other than 429) generally won't help on retry — bad number, bad
    // credentials, banned content. 5xx and 429 are worth retrying.
    const retryable = response.status === 429 || response.status >= 500;
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 240);
    } catch {
      // ignore
    }
    return {
      ok: false,
      error: `Hubtel responded ${status}${detail ? `: ${detail}` : ''}`,
      providerStatus: status,
      retryable,
    };
  }

  let messageId: string | undefined;
  try {
    const payload = (await response.json()) as { Data?: { MessageId?: string } };
    messageId = payload?.Data?.MessageId;
  } catch {
    // Response body isn't JSON — Hubtel sometimes returns a plain string.
  }

  return { ok: true, providerStatus: 'ACCEPTED', messageId };
}

/**
 * Send a single SMS. Returns a discriminated result the caller can route to
 * a retry queue (retryable) or a terminal failure handler (not retryable).
 *
 * Dev mode (SMS_DEV_MODE=true) short-circuits before any network call —
 * useful for local dev / staging where you don't want to spend SMS credit.
 */
export async function sendStorefrontSms(args: SendStorefrontSmsArgs): Promise<StorefrontSmsResult> {
  const senderId = resolveSenderId(args.senderId);

  if (isDevMode()) {
    console.warn('[storefront-sms] DEV MODE — not sending', {
      to: args.to,
      senderId,
      body: args.body,
    });
    return { ok: true, providerStatus: 'DEV_MODE' };
  }

  if (!hasHubtelCredentials()) {
    // Production with no provider configured. Don't pretend success — this
    // gives the dispatcher a clear "FAILED" so ops can see it in the outbox.
    return {
      ok: false,
      error: 'No SMS provider configured (HUBTEL_CLIENT_ID / HUBTEL_CLIENT_SECRET).',
      retryable: false,
    };
  }

  return sendViaHubtel({ to: args.to, body: args.body, senderId });
}

export const STOREFRONT_SMS_DEFAULT_SENDER_ID = DEFAULT_SENDER_ID;
