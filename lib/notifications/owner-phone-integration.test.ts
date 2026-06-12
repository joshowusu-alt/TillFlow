import { describe, expect, it } from 'vitest';

import { buildWhatsAppDeepLink } from '@/lib/notifications/providers';
import { resolveDailySummaryOwnerPhone } from '@/lib/notifications/owner-phone';

describe('Daily Owner Summary phone usage', () => {
  it('builds WhatsApp manual follow-up links with normalised Ghana numbers', () => {
    const phoneResult = resolveDailySummaryOwnerPhone('0244644502');
    expect(phoneResult.ok).toBe(true);
    if (!phoneResult.ok || !phoneResult.phone) return;

    expect(buildWhatsAppDeepLink(phoneResult.phone, 'Hello')).toBe(
      'https://wa.me/233244644502?text=Hello',
    );
  });
});
