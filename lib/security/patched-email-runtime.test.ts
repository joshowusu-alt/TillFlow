// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Resend } from 'resend';

afterEach(() => vi.unstubAllGlobals());

describe('patched email SDK transport compatibility (simulated provider)', () => {
  it('serializes a password-reset email and accepts the provider result', async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'fictional-email-1' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', transport);
    const result = await new Resend('re_fictional_test_key').emails.send({
      from: 'TillFlow <noreply@example.test>', to: 'owner@example.test',
      subject: 'Reset your TillFlow password', html: '<p>Fictional reset link</p>',
    });
    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('fictional-email-1');
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(init.body)).toMatchObject({ to: 'owner@example.test' });
  });

  it('preserves provider failure as an error instead of false delivery success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: 'validation_error', message: 'Simulated provider rejection',
    }), { status: 422, headers: { 'content-type': 'application/json' } })));
    const result = await new Resend('re_fictional_test_key').emails.send({
      from: 'noreply@example.test', to: 'owner@example.test', subject: 'Fictional OTP', text: '123456',
    });
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Simulated provider rejection');
  });
});
