import { createHmac } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extractMetaWebhookStatusEvents,
  getMetaWhatsAppDiagnostics,
  hasMetaWhatsAppConfiguration,
  hasMetaWhatsAppWebhookConfiguration,
  readMetaWhatsAppConfig,
  shouldUseMetaWhatsAppMockMode,
  verifyMetaWebhookSignature,
  metaWhatsAppProvider,
} from './meta-whatsapp';

const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('meta-whatsapp config', () => {
  it('detects explicit mock mode', () => {
    process.env.META_WHATSAPP_MOCK = 'true';

    expect(shouldUseMetaWhatsAppMockMode()).toBe(true);
    expect(hasMetaWhatsAppConfiguration()).toBe(true);
  });

  it('requires access token and phone number id outside mock mode', () => {
    delete process.env.META_WHATSAPP_MOCK;
    delete process.env.META_WHATSAPP_ACCESS_TOKEN;
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;

    expect(hasMetaWhatsAppConfiguration()).toBe(false);
    expect(() => readMetaWhatsAppConfig()).toThrow(
      'Meta WhatsApp delivery is not configured.',
    );
  });

  it('reports webhook configuration when verify token and app secret exist', () => {
    process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'verify-token';
    process.env.META_WHATSAPP_APP_SECRET = 'app-secret';

    expect(hasMetaWhatsAppWebhookConfiguration()).toBe(true);
  });

  it('returns honest diagnostics for manual-review mode', () => {
    const diagnostics = getMetaWhatsAppDiagnostics({} as NodeJS.ProcessEnv);

    expect(diagnostics.deliveryMode).toBe('MANUAL_REVIEW_ONLY');
    expect(diagnostics.metaConfigured).toBe(false);
    expect(diagnostics.webhookConfigured).toBe(false);
    expect(diagnostics.issues.length).toBeGreaterThan(0);
  });
});

describe('metaWhatsAppProvider.sendMessage', () => {
  it('returns an accepted mock response in mock mode', async () => {
    process.env.META_WHATSAPP_MOCK = 'true';

    await expect(
      metaWhatsAppProvider.sendMessage({
        recipient: '233241234567',
        text: 'Daily summary',
        messageType: 'EOD_SUMMARY',
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 'ACCEPTED',
      provider: 'META_WHATSAPP',
      providerStatus: 'MOCK_ACCEPTED',
    });
  });

  it('sends a template payload when template env is configured', async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.META_WHATSAPP_TEMPLATE_NAME = 'daily_summary';
    process.env.META_WHATSAPP_TEMPLATE_LANGUAGE_CODE = 'en_GB';

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ messages: [{ id: 'wamid.123' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await metaWhatsAppProvider.sendMessage({
      recipient: '233241234567',
      text: 'Summary body',
      messageType: 'EOD_SUMMARY',
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'ACCEPTED',
      providerMessageId: 'wamid.123',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v23.0/123456789/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('daily_summary');
    expect(body.template.components[0].parameters[0].text).toBe('Summary body');
  });

  it('returns a failed result when Meta rejects the request', async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '123456789';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'Bad request' } }),
      }),
    );

    await expect(
      metaWhatsAppProvider.sendMessage({
        recipient: '233241234567',
        text: 'Summary body',
        messageType: 'EOD_SUMMARY',
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 'FAILED',
      providerStatus: 'HTTP_400',
      errorMessage: 'Bad request',
    });
  });
});

describe('Meta webhook helpers', () => {
  it('verifies a valid x-hub-signature-256 header', () => {
    const rawBody = JSON.stringify({ hello: 'world' });
    const signature = 'sha256=' + createHmac('sha256', 'app-secret').update(rawBody).digest('hex');

    expect(verifyMetaWebhookSignature(rawBody, signature, 'app-secret')).toBe(true);
    expect(verifyMetaWebhookSignature(rawBody, signature, 'wrong-secret')).toBe(false);
  });

  it('extracts delivery status events from Meta webhook payloads', () => {
    const result = extractMetaWebhookStatusEvents({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid.123',
                    status: 'delivered',
                    recipient_id: '233241234567',
                    timestamp: '1710427800',
                  },
                  {
                    id: 'wamid.124',
                    status: 'failed',
                    timestamp: '1710427900',
                    errors: [{ title: 'Recipient unavailable' }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      providerMessageId: 'wamid.123',
      status: 'DELIVERED',
      recipient: '233241234567',
    });
    expect(result[1]).toMatchObject({
      providerMessageId: 'wamid.124',
      status: 'FAILED',
      errorMessage: 'Recipient unavailable',
    });
  });
});
