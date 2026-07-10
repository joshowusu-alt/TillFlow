import { afterEach, describe, expect, it } from 'vitest';
import {
  assertTillflowWhatsAppConfiguredForProduction,
  getTillflowWhatsAppUrl,
  hasTillflowWhatsApp,
  isTillflowWhatsAppRequired,
  resolveTillflowWhatsApp,
  TILLFLOW_WHATSAPP_ENV_KEY,
} from './whatsapp';

describe('TillFlow WhatsApp configuration', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_TILLFLOW_WHATSAPP;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL;
    delete process.env.VERCEL_URL;
    delete process.env.TILLFLOW_REQUIRE_WHATSAPP;
  });

  it('reports missing configuration when env is absent', () => {
    expect(resolveTillflowWhatsApp()).toEqual({ configured: false, reason: 'missing' });
    expect(getTillflowWhatsAppUrl()).toBeNull();
    expect(hasTillflowWhatsApp()).toBe(false);
  });

  it('reports invalid configuration when env has no digits', () => {
    process.env.NEXT_PUBLIC_TILLFLOW_WHATSAPP = 'whatsapp';
    expect(resolveTillflowWhatsApp()).toEqual({ configured: false, reason: 'invalid' });
    expect(getTillflowWhatsAppUrl()).toBeNull();
  });

  it('builds wa.me link when configured', () => {
    process.env.NEXT_PUBLIC_TILLFLOW_WHATSAPP = '+233 24 000 0000';
    const resolved = resolveTillflowWhatsApp('Hello demo');
    expect(resolved.configured).toBe(true);
    if (!resolved.configured) return;
    expect(resolved.digits).toBe('233240000000');
    expect(resolved.url).toContain('https://wa.me/233240000000');
    expect(resolved.url).toContain(encodeURIComponent('Hello demo'));
    expect(hasTillflowWhatsApp()).toBe(true);
  });

  it('is required on real Vercel production deploys with a deployment URL', () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = 'tillflow.vercel.app';
    expect(isTillflowWhatsAppRequired()).toBe(true);
  });

  it('is not required for local env pulls that set VERCEL=1 with empty VERCEL_URL', () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = '';
    expect(isTillflowWhatsAppRequired()).toBe(false);
  });

  it('is not required when neither Vercel production nor require flag is set', () => {
    expect(isTillflowWhatsAppRequired()).toBe(false);
  });

  it('throws in required production when WhatsApp is missing', () => {
    process.env.TILLFLOW_REQUIRE_WHATSAPP = 'true';
    expect(() => assertTillflowWhatsAppConfiguredForProduction()).toThrow(TILLFLOW_WHATSAPP_ENV_KEY);
  });

  it('passes production assert when WhatsApp is configured', () => {
    process.env.TILLFLOW_REQUIRE_WHATSAPP = 'true';
    process.env.NEXT_PUBLIC_TILLFLOW_WHATSAPP = '233240000000';
    expect(() => assertTillflowWhatsAppConfiguredForProduction()).not.toThrow();
  });

  it('does not throw when WhatsApp is missing outside required production', () => {
    expect(() => assertTillflowWhatsAppConfiguredForProduction()).not.toThrow();
  });
});
