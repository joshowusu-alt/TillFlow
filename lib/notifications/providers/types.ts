export type WhatsAppDeliveryStatus =
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'REVIEW_REQUIRED';

export type WhatsAppProviderKey = 'META_WHATSAPP' | 'WHATSAPP_DEEPLINK';

export type SendWhatsAppMessageInput = {
  recipient: string;
  text: string;
  messageType: string;
};

export type SendWhatsAppMessageResult = {
  ok: boolean;
  status: WhatsAppDeliveryStatus;
  provider: WhatsAppProviderKey;
  providerStatus: string;
  providerMessageId?: string | null;
  deepLink?: string | null;
  errorMessage?: string | null;
  attemptedProvider?: WhatsAppProviderKey | null;
  rawPayload?: unknown;
};

export interface WhatsAppProvider {
  readonly key: WhatsAppProviderKey;
  isConfigured(): boolean;
  sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult>;
}
