import { describe, expect, it } from 'vitest';

import { getCronSecretsFromHeaders, hasValidCronSecret } from './cron-auth';

describe('getCronSecretsFromHeaders', () => {
  it('extracts a bearer secret case-insensitively', () => {
    const headers = new Headers({ authorization: 'bearer   super-secret ' });

    expect(getCronSecretsFromHeaders(headers)).toEqual({
      bearerSecret: 'super-secret',
      headerSecret: '',
    });
  });

  it('extracts the x-cron-secret header for manual testing', () => {
    const headers = new Headers({ 'x-cron-secret': 'manual-secret' });

    expect(getCronSecretsFromHeaders(headers)).toEqual({
      bearerSecret: '',
      headerSecret: 'manual-secret',
    });
  });
});

describe('hasValidCronSecret', () => {
  const expectedSecret = 'expected-secret';

  it('authorizes a valid bearer token', () => {
    const request = new Request('https://example.com/api/cron/eod-summary', {
      headers: { authorization: `Bearer ${expectedSecret}` },
    });

    expect(hasValidCronSecret(request, expectedSecret)).toBe(true);
  });

  it('authorizes a valid x-cron-secret header', () => {
    const request = new Request('https://example.com/api/cron/eod-summary', {
      headers: { 'x-cron-secret': expectedSecret },
    });

    expect(hasValidCronSecret(request, expectedSecret)).toBe(true);
  });

  it('rejects requests with a missing secret', () => {
    const request = new Request('https://example.com/api/cron/eod-summary');

    expect(hasValidCronSecret(request, expectedSecret)).toBe(false);
  });

  it('rejects requests with the wrong secret', () => {
    const request = new Request('https://example.com/api/cron/eod-summary', {
      headers: { authorization: 'Bearer definitely-wrong' },
    });

    expect(hasValidCronSecret(request, expectedSecret)).toBe(false);
  });

  it('rejects query-param secrets even when they match the configured value', () => {
    const request = new Request(
      `https://example.com/api/cron/eod-summary?secret=${expectedSecret}`,
    );

    expect(hasValidCronSecret(request, expectedSecret)).toBe(false);
  });

  it('treats either supported header as sufficient', () => {
    const request = new Request('https://example.com/api/cron/eod-summary', {
      headers: {
        authorization: 'Bearer wrong-secret',
        'x-cron-secret': expectedSecret,
      },
    });

    expect(hasValidCronSecret(request, expectedSecret)).toBe(true);
  });
});
