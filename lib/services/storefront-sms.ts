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

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

export function hasHubtelCredentials(): boolean {
  return Boolean(process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET);
}

export function hasArkeselCredentials(): boolean {
  return Boolean(process.env.ARKESEL_API_KEY);
}

export function hasSmsProviderConfigured(): boolean {
  return hasHubtelCredentials() || hasArkeselCredentials();
}

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

/** Strip leading + so both Arkesel and Hubtel receive 233XXXXXXXXX, not +233XXXXXXXXX */
function toMsisdn(phone: string): string {
  return phone.startsWith('+') ? phone.slice(1) : phone;
}

async function sendViaArkesel(args: {
  to: string;
  body: string;
  senderId: string;
}): Promise<StorefrontSmsResult> {
  const apiKey = process.env.ARKESEL_API_KEY!;
  const params = new URLSearchParams({
    action: 'send-sms',
    api_key: apiKey,
    to: toMsisdn(args.to),
    from: args.senderId,
    sms: args.body,
  });
  const url = `https://sms.arkesel.com/sms/api?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET' });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error contacting SMS provider.',
      retryable: true,
    };
  }

  let payload: { code?: string; message?: string } = {};
  try {
    payload = (await response.json()) as { code?: string; message?: string };
  } catch {
    // ignore parse errors
  }

  if (!response.ok || (payload.code && payload.code !== 'ok')) {
    const retryable = response.status === 429 || response.status >= 500;
    const errorMsg = `Arkesel: ${payload.message ?? payload.code ?? response.status}`;
    console.error('[storefront-sms] Arkesel send failed', {
      to: toMsisdn(args.to),
      senderId: args.senderId,
      httpStatus: response.status,
      responseCode: payload.code,
      responseMessage: payload.message,
    });
    return {
      ok: false,
      error: errorMsg,
      providerStatus: payload.code ?? String(response.status),
      retryable,
    };
  }

  console.info('[storefront-sms] Arkesel send ok', { to: toMsisdn(args.to) });
  return { ok: true, providerStatus: 'ACCEPTED' };
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
    To: toMsisdn(args.to),
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

  if (hasHubtelCredentials()) {
    return sendViaHubtel({ to: args.to, body: args.body, senderId });
  }

  if (hasArkeselCredentials()) {
    return sendViaArkesel({ to: args.to, body: args.body, senderId });
  }

  return {
    ok: false,
    error: 'No SMS provider configured (HUBTEL_CLIENT_ID/HUBTEL_CLIENT_SECRET or ARKESEL_API_KEY).',
    retryable: false,
  };
}

export const STOREFRONT_SMS_DEFAULT_SENDER_ID = DEFAULT_SENDER_ID;
