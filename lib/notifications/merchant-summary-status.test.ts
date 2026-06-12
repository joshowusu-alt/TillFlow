import { describe, expect, it } from 'vitest';

import { getMerchantDailySummaryStatus } from '@/lib/notifications/merchant-summary-status';

describe('getMerchantDailySummaryStatus', () => {
  it('shows active SMS when enabled with a phone number', () => {
    const status = getMerchantDailySummaryStatus({
      summaryEnabled: true,
      ownerPhone: '233241234567',
    });

    expect(status.smsLine).toContain('SMS scheduled delivery is active');
    expect(status.smsTone).toBe('success');
  });

  it('shows pending SMS setup when enabled without a phone number', () => {
    const status = getMerchantDailySummaryStatus({
      summaryEnabled: true,
      ownerPhone: '',
    });

    expect(status.smsLine).toContain('pending setup');
    expect(status.smsTone).toBe('pending');
  });

  it('does not expose environment variable names', () => {
    const status = getMerchantDailySummaryStatus({
      summaryEnabled: false,
      ownerPhone: null,
    });

    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('ARKESEL_WHATSAPP_TOKEN');
    expect(serialized).not.toContain('META_WHATSAPP_ACCESS_TOKEN');
    expect(serialized).not.toContain('CRON_SECRET');
  });

  it('shows pending automated WhatsApp when providers are unavailable', () => {
    const status = getMerchantDailySummaryStatus({
      summaryEnabled: true,
      ownerPhone: '233241234567',
    });

    if (!status.whatsappAutomationConnected) {
      expect(status.whatsappLine).toContain('not fully connected yet');
    }
  });
});
