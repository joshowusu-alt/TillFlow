import { arkeselWhatsAppProvider } from './arkesel-whatsapp';
import { metaWhatsAppProvider } from './meta-whatsapp';
import type { SendWhatsAppMessageInput, SendWhatsAppMessageResult, WhatsAppProvider } from './types';

const PROVIDERS: Record<string, WhatsAppProvider> = {
  [metaWhatsAppProvider.key]: metaWhatsAppProvider,
  [arkeselWhatsAppProvider.key]: arkeselWhatsAppProvider,
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
  if (arkeselWhatsAppProvider.isConfigured()) {
    return arkeselWhatsAppProvider;
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
        'No WhatsApp provider is configured (Meta or Arkesel), so this summary is queued for manual review via WhatsApp deep link.',
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
      errorMessage: result.errorMessage ?? 'WhatsApp delivery failed; manual review is required.',
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
      errorMessage: error?.message ?? 'WhatsApp delivery failed; manual review is required.',
      attemptedProvider: provider.key,
    };
  }
}
