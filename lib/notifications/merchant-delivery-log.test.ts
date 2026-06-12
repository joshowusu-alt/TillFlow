import { describe, expect, it } from 'vitest';

import {
  maskOwnerPhone,
  resolveMerchantDeliveryChannel,
  resolveMerchantFriendlyStatus,
} from '@/lib/notifications/merchant-delivery-log';

describe('merchant delivery log helpers', () => {
  it('masks owner phone numbers for merchant display', () => {
    expect(maskOwnerPhone('233241234567')).toBe('+233****4567');
  });

  it('maps SMS channel entries to friendly statuses', () => {
    expect(
      resolveMerchantFriendlyStatus({
        status: 'SENT',
        channel: 'SMS',
      }),
    ).toEqual({ label: 'Sent', tone: 'success' });
  });

  it('maps manual follow-up entries without provider jargon', () => {
    expect(
      resolveMerchantDeliveryChannel({
        channel: 'WHATSAPP',
        provider: 'WHATSAPP_DEEPLINK',
        deepLink: 'https://wa.me/233241234567',
      }),
    ).toBe('Manual follow-up');

    expect(
      resolveMerchantFriendlyStatus({
        status: 'REVIEW_REQUIRED',
        deepLink: 'https://wa.me/233241234567',
      }),
    ).toEqual({ label: 'Needs follow-up', tone: 'warn' });
  });

  it('uses merchant-safe failed wording', () => {
    expect(
      resolveMerchantFriendlyStatus({
        status: 'FAILED',
      }).label,
    ).toContain('our team may need to check this');
  });
});
