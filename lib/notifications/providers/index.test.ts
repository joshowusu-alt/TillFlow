import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildWhatsAppDeepLink, sendWhatsAppMessage } from './index';

const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('buildWhatsAppDeepLink', () => {
  it('builds a phone-specific wa.me link', () => {
    expect(buildWhatsAppDeepLink('233 24 123 4567', 'Hello')).toBe(
      'https://wa.me/233241234567?text=Hello',
    );
  });
});

describe('sendWhatsAppMessage', () => {
  it('falls back to manual review when Meta is not configured', async () => {
    delete process.env.META_WHATSAPP_MOCK;
    delete process.env.META_WHATSAPP_ACCESS_TOKEN;
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;

    await expect(
      sendWhatsAppMessage({
        recipient: '233241234567',
        text: 'Daily summary',
        messageType: 'EOD_SUMMARY',
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 'REVIEW_REQUIRED',
      provider: 'WHATSAPP_DEEPLINK',
      providerStatus: 'MANUAL_REVIEW_REQUIRED',
    });
  });

  it('falls back to manual review when Meta returns a failure', async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '123456789';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 500,
        text: async () => JSON.stringify({ error: { message: 'Provider down' } }),
      }),
    );

    await expect(
      sendWhatsAppMessage({
        recipient: '233241234567',
        text: 'Daily summary',
        messageType: 'EOD_SUMMARY',
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 'REVIEW_REQUIRED',
      provider: 'WHATSAPP_DEEPLINK',
      providerStatus: 'FALLBACK_MANUAL_REVIEW',
      attemptedProvider: 'META_WHATSAPP',
      errorMessage: 'Provider down',
    });
  });

  it('returns accepted delivery when Meta succeeds', async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.META_WHATSAPP_MOCK = 'true';

    await expect(
      sendWhatsAppMessage({
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
});
