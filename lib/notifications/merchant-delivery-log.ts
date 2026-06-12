export type MerchantDeliveryChannel = 'SMS' | 'WhatsApp' | 'Manual follow-up';

export type MerchantDeliveryBadgeTone = 'success' | 'warn' | 'danger' | 'pending' | 'neutral';

export function maskOwnerPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return phone;
  if (digits.length <= 4) return `+${digits}`;
  return `+${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function resolveMerchantDeliveryChannel(input: {
  channel?: string | null;
  provider?: string | null;
  deepLink?: string | null;
}): MerchantDeliveryChannel {
  if (input.channel === 'SMS') return 'SMS';
  if (input.provider === 'WHATSAPP_DEEPLINK' || input.deepLink) {
    return 'Manual follow-up';
  }
  return 'WhatsApp';
}

export function resolveMerchantFriendlyStatus(input: {
  status: string;
  providerStatus?: string | null;
  channel?: string | null;
  deepLink?: string | null;
}): { label: string; tone: MerchantDeliveryBadgeTone } {
  const status = input.status.toUpperCase();
  const providerStatus = input.providerStatus?.toUpperCase() ?? '';

  if (status === 'DELIVERED' || status === 'READ' || status === 'SENT') {
    return { label: 'Sent', tone: 'success' };
  }

  if (status === 'REVIEW_REQUIRED' || providerStatus.includes('REVIEW')) {
    return { label: 'Needs follow-up', tone: 'warn' };
  }

  if (status === 'FAILED') {
    return { label: 'Failed — our team may need to check this', tone: 'danger' };
  }

  if (status === 'PENDING' || status === 'ACCEPTED') {
    return { label: 'Pending', tone: 'pending' };
  }

  if (status === 'CANCELLED') {
    return { label: 'Cancelled', tone: 'neutral' };
  }

  if (input.deepLink && resolveMerchantDeliveryChannel(input) === 'Manual follow-up') {
    return { label: 'Needs follow-up', tone: 'warn' };
  }

  return { label: 'Pending', tone: 'pending' };
}

export function isMerchantFollowUpEntry(input: {
  status: string;
  provider?: string | null;
  providerStatus?: string | null;
  deepLink?: string | null;
}) {
  const status = input.status.toUpperCase();
  const providerStatus = input.providerStatus?.toUpperCase() ?? '';
  return (
    status === 'FAILED' ||
    status === 'REVIEW_REQUIRED' ||
    input.provider === 'WHATSAPP_DEEPLINK' ||
    providerStatus.includes('REVIEW') ||
    Boolean(input.deepLink)
  );
}
