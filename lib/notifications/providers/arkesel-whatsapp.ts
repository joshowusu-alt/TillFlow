/**
 * Arkesel WhatsApp Business API provider.
 *
 * Uses Arkesel's WhatsApp Business Service (WBS) to deliver template messages.
 * Configure via:
 *   ARKESEL_WHATSAPP_TOKEN      — WBS token from the Arkesel dashboard
 *   ARKESEL_WHATSAPP_TEMPLATE_ID — pre-approved Meta template ID from Arkesel WBS
 *   ARKESEL_WHATSAPP_MOCK       — set to "true" to skip network calls in dev/test
 *
 * Arkesel WBS requires a pre-approved Meta message template. The template
 * delivers the notification; the rich text payload is preserved in the message
 * log and deeplink for audit/manual review.
 */

import type {
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
  WhatsAppProvider,
} from './types';

const ARKESEL_WBS_URL = 'https://sms.arkesel.com/api/wbs/sendcampaigns';
const DEFAULT_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function isTruthy(value: string | undefined) {
  const n = value?.trim().toLowerCase();
  return n === '1' || n === 'true' || n === 'yes';
}

export function hasArkeselWhatsAppConfiguration(env: NodeJS.ProcessEnv = process.env): boolean {
  if (shouldUseArkeselWhatsAppMockMode(env)) return true;
  return Boolean(env.ARKESEL_WHATSAPP_TOKEN?.trim() && env.ARKESEL_WHATSAPP_TEMPLATE_ID?.trim());
}

export function shouldUseArkeselWhatsAppMockMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthy(env.ARKESEL_WHATSAPP_MOCK);
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type ArkeselWhatsAppDiagnostics = {
  arkeselConfigured: boolean;
  arkeselMockMode: boolean;
  issues: string[];
};

export function getArkeselWhatsAppDiagnostics(
  env: NodeJS.ProcessEnv = process.env,
): ArkeselWhatsAppDiagnostics {
  const arkeselMockMode = shouldUseArkeselWhatsAppMockMode(env);
  const tokenPresent = Boolean(env.ARKESEL_WHATSAPP_TOKEN?.trim());
  const templatePresent = Boolean(env.ARKESEL_WHATSAPP_TEMPLATE_ID?.trim());
  const arkeselConfigured = arkeselMockMode || (tokenPresent && templatePresent);

  const issues: string[] = [];
  if (!arkeselMockMode) {
    if (!tokenPresent) issues.push('ARKESEL_WHATSAPP_TOKEN is not set (Arkesel WBS dashboard → API token).');
    if (!templatePresent) issues.push('ARKESEL_WHATSAPP_TEMPLATE_ID is not set (approved template ID from Arkesel WBS).');
  }

  return { arkeselConfigured, arkeselMockMode, issues };
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

/** Strip non-digit characters so Arkesel receives e.g. 233XXXXXXXXX */
function toMsisdn(phone: string): string {
  return phone.replace(/\D/g, '');
}

async function sendViaArkeselWbs(
  input: SendWhatsAppMessageInput,
): Promise<SendWhatsAppMessageResult> {
  const token = process.env.ARKESEL_WHATSAPP_TOKEN!;
  const templateId = process.env.ARKESEL_WHATSAPP_TEMPLATE_ID!;
  const phone = toMsisdn(input.recipient);
  const campaignName = `TillFlow-${input.messageType}-${Date.now()}`;

  const body = {
    token,
    phone,
    campaign_name: campaignName,
    template_id: templateId,
    group_id: null,
    schedule_time: null,
  };

  let response: Response;
  try {
    response = await fetch(ARKESEL_WBS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      status: 'FAILED',
      provider: 'ARKESEL_WHATSAPP',
      providerStatus: 'NETWORK_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Network error contacting Arkesel WBS.',
    };
  }

  let payload: { status?: string; message?: string; errors?: unknown } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // ignore parse errors — fall through to status check
  }

  if (!response.ok || payload.status === 'error') {
    const retryable = response.status === 429 || response.status >= 500;
    const errorMsg =
      typeof payload.message === 'string'
        ? `Arkesel WBS: ${payload.message}`
        : `Arkesel WBS: HTTP ${response.status}`;

    console.error('[arkesel-whatsapp] send failed', {
      phone,
      httpStatus: response.status,
      responseStatus: payload.status,
      responseMessage: payload.message,
    });

    return {
      ok: false,
      status: 'FAILED',
      provider: 'ARKESEL_WHATSAPP',
      providerStatus: payload.status?.toUpperCase() ?? String(response.status),
      errorMessage: errorMsg,
      rawPayload: payload,
      ...(retryable ? {} : {}),
    };
  }

  const campaignId = typeof payload.message === 'string' ? payload.message : undefined;
  console.info('[arkesel-whatsapp] send accepted', { phone, campaignId });

  return {
    ok: true,
    status: 'ACCEPTED',
    provider: 'ARKESEL_WHATSAPP',
    providerStatus: 'ACCEPTED',
    providerMessageId: campaignId ?? null,
  };
}

export const arkeselWhatsAppProvider: WhatsAppProvider = {
  key: 'ARKESEL_WHATSAPP',

  isConfigured() {
    return hasArkeselWhatsAppConfiguration();
  },

  async sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
    if (!this.isConfigured()) {
      throw new Error('Arkesel WhatsApp is not configured (ARKESEL_WHATSAPP_TOKEN / ARKESEL_WHATSAPP_TEMPLATE_ID).');
    }

    if (shouldUseArkeselWhatsAppMockMode()) {
      return {
        ok: true,
        status: 'ACCEPTED',
        provider: 'ARKESEL_WHATSAPP',
        providerStatus: 'MOCK_ACCEPTED',
        providerMessageId: `mock-arkesel-${Date.now()}`,
      };
    }

    return sendViaArkeselWbs(input);
  },
};
