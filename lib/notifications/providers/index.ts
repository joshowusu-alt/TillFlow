import { metaWhatsAppProvider } from './meta-whatsapp';
import type { SendWhatsAppMessageInput, SendWhatsAppMessageResult, WhatsAppProvider } from './types';

const PROVIDERS: Record<string, WhatsAppProvider> = {
  [metaWhatsAppProvider.key]: metaWhatsAppProvider,
};

export function buildWhatsAppDeepLink(recipient: string, text: string) {
  const phone = recipient.replace(/\D/g, '');
  return phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function getWhatsAppProvider(providerKey: string): WhatsAppProvider {
  const provider = PROVIDERS[providerKey];
  if (!provider) {
    throw new Error(`Unsupported WhatsApp provider: ${providerKey}`);
  }
  return provider;
}

export function resolveWhatsAppProvider(): WhatsAppProvider | null {
  if (metaWhatsAppProvider.isConfigured()) {
    return metaWhatsAppProvider;
  }
  return null;
}

export async function sendWhatsAppMessage(
  input: SendWhatsAppMessageInput,
): Promise<SendWhatsAppMessageResult> {
  const deepLink = buildWhatsAppDeepLink(input.recipient, input.text);
  const provider = resolveWhatsAppProvider();

  if (!provider) {
    return {
      ok: false,
      status: 'REVIEW_REQUIRED',
      provider: 'WHATSAPP_DEEPLINK',
      providerStatus: 'MANUAL_REVIEW_REQUIRED',
      deepLink,
      errorMessage:
        'Meta WhatsApp delivery is not configured yet, so this summary is queued for manual review via WhatsApp deep link.',
    };
  }

  try {
    const result = await provider.sendMessage(input);
    if (result.ok) {
      return { ...result, deepLink };
    }

    return {
      ok: false,
      status: 'REVIEW_REQUIRED',
      provider: 'WHATSAPP_DEEPLINK',
      providerStatus: 'FALLBACK_MANUAL_REVIEW',
      deepLink,
      errorMessage: result.errorMessage ?? 'Meta WhatsApp delivery failed; manual review is required.',
      attemptedProvider: provider.key,
      rawPayload: result.rawPayload,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 'REVIEW_REQUIRED',
      provider: 'WHATSAPP_DEEPLINK',
      providerStatus: 'FALLBACK_MANUAL_REVIEW',
      deepLink,
      errorMessage: error?.message ?? 'Meta WhatsApp delivery failed; manual review is required.',
      attemptedProvider: provider.key,
    };
  }
}
