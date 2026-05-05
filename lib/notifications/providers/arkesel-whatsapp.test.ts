import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  arkeselWhatsAppProvider,
  getArkeselWhatsAppDiagnostics,
  hasArkeselWhatsAppConfiguration,
  shouldUseArkeselWhatsAppMockMode,
} from './arkesel-whatsapp';

const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('arkesel-whatsapp config', () => {
  it('reports unconfigured when both env vars are absent', () => {
    delete process.env.ARKESEL_WHATSAPP_TOKEN;
    delete process.env.ARKESEL_WHATSAPP_TEMPLATE_ID;
    delete process.env.ARKESEL_WHATSAPP_MOCK;

    expect(hasArkeselWhatsAppConfiguration()).toBe(false);
    expect(arkeselWhatsAppProvider.isConfigured()).toBe(false);
  });

  it('reports unconfigured when only token is set', () => {
    process.env.ARKESEL_WHATSAPP_TOKEN = 'some-token';
    delete process.env.ARKESEL_WHATSAPP_TEMPLATE_ID;
    delete process.env.ARKESEL_WHATSAPP_MOCK;

    expect(hasArkeselWhatsAppConfiguration()).toBe(false);
  });

  it('reports configured when token and template id are both set', () => {
    process.env.ARKESEL_WHATSAPP_TOKEN = 'some-token';
    process.env.ARKESEL_WHATSAPP_TEMPLATE_ID = '12345';
    delete process.env.ARKESEL_WHATSAPP_MOCK;

    expect(hasArkeselWhatsAppConfiguration()).toBe(true);
  });

  it('detects mock mode via ARKESEL_WHATSAPP_MOCK=true', () => {
    process.env.ARKESEL_WHATSAPP_MOCK = 'true';
    delete process.env.ARKESEL_WHATSAPP_TOKEN;
    delete process.env.ARKESEL_WHATSAPP_TEMPLATE_ID;

    expect(shouldUseArkeselWhatsAppMockMode()).toBe(true);
    expect(hasArkeselWhatsAppConfiguration()).toBe(true);
  });

  it('returns diagnostics with issues when not configured', () => {
    const d = getArkeselWhatsAppDiagnostics({} as NodeJS.ProcessEnv);

    expect(d.arkeselConfigured).toBe(false);
    expect(d.arkeselMockMode).toBe(false);
    expect(d.issues.length).toBeGreaterThan(0);
  });

  it('returns clean diagnostics in mock mode', () => {
    const d = getArkeselWhatsAppDiagnostics({ ARKESEL_WHATSAPP_MOCK: 'true' } as unknown as NodeJS.ProcessEnv);

    expect(d.arkeselConfigured).toBe(true);
    expect(d.arkeselMockMode).toBe(true);
    expect(d.issues).toHaveLength(0);
  });
});

describe('arkeselWhatsAppProvider.sendMessage', () => {
  it('returns accepted mock response in mock mode', async () => {
    process.env.ARKESEL_WHATSAPP_MOCK = 'true';

    await expect(
      arkeselWhatsAppProvider.sendMessage({
        recipient: '233241234567',
        text: 'EOD summary text',
        messageType: 'EOD_SUMMARY',
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 'ACCEPTED',
      provider: 'ARKESEL_WHATSAPP',
      providerStatus: 'MOCK_ACCEPTED',
    });
  });

  it('throws when not configured', async () => {
    delete process.env.ARKESEL_WHATSAPP_TOKEN;
    delete process.env.ARKESEL_WHATSAPP_TEMPLATE_ID;
    delete process.env.ARKESEL_WHATSAPP_MOCK;

    await expect(
      arkeselWhatsAppProvider.sendMessage({
        recipient: '233241234567',
        text: 'EOD summary text',
        messageType: 'EOD_SUMMARY',
      }),
    ).rejects.toThrow('Arkesel WhatsApp is not configured');
  });

  it('returns FAILED with NETWORK_ERROR on fetch exception', async () => {
    process.env.ARKESEL_WHATSAPP_TOKEN = 'some-token';
    process.env.ARKESEL_WHATSAPP_TEMPLATE_ID = '12345';
    delete process.env.ARKESEL_WHATSAPP_MOCK;

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

    await expect(
      arkeselWhatsAppProvider.sendMessage({
        recipient: '233241234567',
        text: 'EOD summary',
        messageType: 'EOD_SUMMARY',
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 'FAILED',
      provider: 'ARKESEL_WHATSAPP',
      providerStatus: 'NETWORK_ERROR',
      errorMessage: 'Connection refused',
    });
  });

  it('returns FAILED when Arkesel responds with status=error', async () => {
    process.env.ARKESEL_WHATSAPP_TOKEN = 'some-token';
    process.env.ARKESEL_WHATSAPP_TEMPLATE_ID = '12345';
    delete process.env.ARKESEL_WHATSAPP_MOCK;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'error', message: 'Invalid token' }),
      }),
    );

    await expect(
      arkeselWhatsAppProvider.sendMessage({
        recipient: '233241234567',
        text: 'EOD summary',
        messageType: 'EOD_SUMMARY',
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 'FAILED',
      provider: 'ARKESEL_WHATSAPP',
      errorMessage: 'Arkesel WBS: Invalid token',
    });
  });

  it('returns ACCEPTED with campaign id on success', async () => {
    process.env.ARKESEL_WHATSAPP_TOKEN = 'some-token';
    process.env.ARKESEL_WHATSAPP_TEMPLATE_ID = '12345';
    delete process.env.ARKESEL_WHATSAPP_MOCK;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', message: 'campaign-abc-123' }),
      }),
    );

    await expect(
      arkeselWhatsAppProvider.sendMessage({
        recipient: '233241234567',
        text: 'EOD summary',
        messageType: 'EOD_SUMMARY',
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 'ACCEPTED',
      provider: 'ARKESEL_WHATSAPP',
      providerStatus: 'ACCEPTED',
      providerMessageId: 'campaign-abc-123',
    });
  });
});
