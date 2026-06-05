import { afterEach, describe, expect, it } from 'vitest';
import { getTillflowWhatsAppUrl, hasTillflowWhatsApp } from './whatsapp';

describe('getTillflowWhatsAppUrl', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_TILLFLOW_WHATSAPP;
  });

  it('returns null when env is missing', () => {
    expect(getTillflowWhatsAppUrl()).toBeNull();
    expect(hasTillflowWhatsApp()).toBe(false);
  });

  it('builds wa.me link with digits only', () => {
    process.env.NEXT_PUBLIC_TILLFLOW_WHATSAPP = '+233 24 000 0000';
    const url = getTillflowWhatsAppUrl('Hello demo');
    expect(url).toContain('https://wa.me/233240000000');
    expect(url).toContain(encodeURIComponent('Hello demo'));
    expect(hasTillflowWhatsApp()).toBe(true);
  });
});
