import { createHmac, timingSafeEqual } from 'crypto';

import type {
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
  WhatsAppDeliveryStatus,
  WhatsAppProvider,
} from './types';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_API_VERSION = 'v23.0';
const DEFAULT_TEMPLATE_LANGUAGE_CODE = 'en_GB';

type MetaWhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  templateName?: string;
  templateLanguageCode: string;
  mockMode: boolean;
};

export type MetaWhatsAppWebhookStatus = Extract<
  WhatsAppDeliveryStatus,
  'ACCEPTED' | 'DELIVERED' | 'READ' | 'FAILED'
>;

export type MetaWhatsAppStatusEvent = {
  providerMessageId: string;
  providerStatus: string;
  status: MetaWhatsAppWebhookStatus;
  recipient: string | null;
  errorMessage: string | null;
  occurredAt: Date | null;
  deliveredAt: Date | null;
  rawPayload: unknown;
};

export type MetaWhatsAppDiagnostics = {
  deliveryMode: 'AUTOMATED_META' | 'MANUAL_REVIEW_ONLY';
  metaConfigured: boolean;
  metaMockMode: boolean;
  webhookConfigured: boolean;
  templateConfigured: boolean;
  issues: string[];
};

function isTruthy(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function shouldUseMetaWhatsAppMockMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthy(env.META_WHATSAPP_MOCK);
}

export function hasMetaWhatsAppConfiguration(env: NodeJS.ProcessEnv = process.env): boolean {
  if (shouldUseMetaWhatsAppMockMode(env)) {
    return true;
  }

  return Boolean(
    env.META_WHATSAPP_ACCESS_TOKEN?.trim() && env.META_WHATSAPP_PHONE_NUMBER_ID?.trim()
  );
}

export function hasMetaWhatsAppWebhookConfiguration(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() && env.META_WHATSAPP_APP_SECRET?.trim(),
  );
}

export function getMetaWhatsAppDiagnostics(
  env: NodeJS.ProcessEnv = process.env,
): MetaWhatsAppDiagnostics {
  const metaMockMode = shouldUseMetaWhatsAppMockMode(env);
  const metaConfigured = hasMetaWhatsAppConfiguration(env);
  const webhookConfigured = hasMetaWhatsAppWebhookConfiguration(env);
  const templateConfigured = Boolean(env.META_WHATSAPP_TEMPLATE_NAME?.trim());
  const issues: string[] = [];

  if (!metaConfigured) {
    issues.push('Meta access token and phone number ID are missing, so automated delivery is disabled.');
  }
  if (!webhookConfigured) {
    issues.push('Meta webhook verify token and app secret are missing, so delivery updates cannot be confirmed yet.');
  }

  return {
    deliveryMode: metaConfigured ? 'AUTOMATED_META' : 'MANUAL_REVIEW_ONLY',
    metaConfigured,
    metaMockMode,
    webhookConfigured,
    templateConfigured,
    issues,
  };
}

export function readMetaWhatsAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): MetaWhatsAppConfig {
  const mockMode = shouldUseMetaWhatsAppMockMode(env);
  const accessToken = env.META_WHATSAPP_ACCESS_TOKEN?.trim() ?? '';
  const phoneNumberId = env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() ?? '';
  const apiVersion = env.META_WHATSAPP_API_VERSION?.trim() || DEFAULT_API_VERSION;
  const templateName = env.META_WHATSAPP_TEMPLATE_NAME?.trim() || undefined;
  const templateLanguageCode =
    env.META_WHATSAPP_TEMPLATE_LANGUAGE_CODE?.trim() || DEFAULT_TEMPLATE_LANGUAGE_CODE;

  if (!mockMode && (!accessToken || !phoneNumberId)) {
    throw new Error(
      'Meta WhatsApp delivery is not configured. Set META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID.',
    );
  }

  return {
    accessToken,
    phoneNumberId,
    apiVersion,
    templateName,
    templateLanguageCode,
    mockMode,
  };
}

async function requestJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();

    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function parseMetaTimestamp(timestamp: unknown) {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return new Date(parsed * 1000);
}

function mapMetaWebhookStatus(status: string | null | undefined): MetaWhatsAppWebhookStatus {
  const normalized = (status ?? '').trim().toUpperCase();

  if (normalized === 'READ') return 'READ';
  if (normalized === 'DELIVERED') return 'DELIVERED';
  if (normalized === 'FAILED') return 'FAILED';
  return 'ACCEPTED';
}

function formatMetaWebhookError(errors: unknown) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }

  return errors
    .map((error) => {
      if (!error || typeof error !== 'object') {
        return null;
      }
      const details = error as Record<string, unknown>;
      const title = typeof details.title === 'string' ? details.title : null;
      const message = typeof details.message === 'string' ? details.message : null;
      return title || message || null;
    })
    .filter(Boolean)
    .join('; ') || null;
}

export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret = process.env.META_WHATSAPP_APP_SECRET?.trim() ?? '',
) {
  if (!appSecret || !signatureHeader) {
    return false;
  }

  const incoming = signatureHeader.trim();
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const incomingBuffer = Buffer.from(incoming);
  const expectedBuffer = Buffer.from(expected);

  if (incomingBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(incomingBuffer, expectedBuffer);
}

export function extractMetaWebhookStatusEvents(body: unknown): MetaWhatsAppStatusEvent[] {
  if (!body || typeof body !== 'object') {
    return [];
  }

  const payload = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          statuses?: Array<Record<string, unknown>>;
        };
      }>;
    }>;
  };

  const events: MetaWhatsAppStatusEvent[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const statusPayload of change.value?.statuses ?? []) {
        const providerMessageId =
          typeof statusPayload.id === 'string' ? statusPayload.id.trim() : '';
        if (!providerMessageId) {
          continue;
        }

        const providerStatus =
          typeof statusPayload.status === 'string' ? statusPayload.status.trim().toUpperCase() : 'UNKNOWN';
        const occurredAt = parseMetaTimestamp(statusPayload.timestamp);
        const mappedStatus = mapMetaWebhookStatus(providerStatus);

        events.push({
          providerMessageId,
          providerStatus,
          status: mappedStatus,
          recipient:
            typeof statusPayload.recipient_id === 'string' ? statusPayload.recipient_id.trim() : null,
          errorMessage: formatMetaWebhookError(statusPayload.errors),
          occurredAt,
          deliveredAt:
            mappedStatus === 'DELIVERED' || mappedStatus === 'READ' ? occurredAt : null,
          rawPayload: statusPayload,
        });
      }
    }
  }

  return events;
}

function buildMetaMessageBody(config: MetaWhatsAppConfig, input: SendWhatsAppMessageInput) {
  if (config.templateName) {
    return {
      messaging_product: 'whatsapp',
      to: input.recipient,
      type: 'template',
      template: {
        name: config.templateName,
        language: { code: config.templateLanguageCode },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: input.text }],
          },
        ],
      },
    };
  }

  return {
    messaging_product: 'whatsapp',
    to: input.recipient,
    type: 'text',
    text: {
      preview_url: false,
      body: input.text,
    },
  };
}

export const metaWhatsAppProvider: WhatsAppProvider = {
  key: 'META_WHATSAPP',

  isConfigured() {
    return hasMetaWhatsAppConfiguration();
  },

  async sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
    const config = readMetaWhatsAppConfig();

    if (config.mockMode) {
      return {
        ok: true,
        status: 'ACCEPTED',
        provider: 'META_WHATSAPP',
        providerStatus: 'MOCK_ACCEPTED',
        providerMessageId: `mock-wa-${input.recipient.slice(-6) || 'message'}`,
        rawPayload: { mock: true, recipient: input.recipient, messageType: input.messageType },
      };
    }

    const endpoint = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
    const response = await requestJson(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildMetaMessageBody(config, input)),
    });

    if (response.status < 200 || response.status >= 300) {
      const errorMessage =
        response.body?.error?.message ||
        (typeof response.body === 'string' ? response.body : JSON.stringify(response.body));

      return {
        ok: false,
        status: 'FAILED',
        provider: 'META_WHATSAPP',
        providerStatus: `HTTP_${response.status}`,
        errorMessage,
        rawPayload: response.body,
      };
    }

    return {
      ok: true,
      status: 'ACCEPTED',
      provider: 'META_WHATSAPP',
      providerStatus: 'ACCEPTED',
      providerMessageId: response.body?.messages?.[0]?.id ?? null,
      rawPayload: response.body,
    };
  },
};
