import { describe, expect, it } from 'vitest';
import { getLoginErrorMessage, parseLoginErrorParam } from './login-form-state';

describe('login form error state', () => {
  it('maps invalid credentials to a generic message', () => {
    expect(getLoginErrorMessage('invalid')).toBe('Invalid email or password.');
  });

  it('maps locked state to a safe rate-limit message', () => {
    expect(getLoginErrorMessage('locked')).toContain('Too many failed attempts');
  });

  it('maps otp and server errors without exposing account existence', () => {
    expect(getLoginErrorMessage('otp_required')).toContain('2FA');
    expect(getLoginErrorMessage('server')).toContain('Unable to connect');
  });

  it('parses supported login error search params', () => {
    expect(parseLoginErrorParam('invalid')).toBe('invalid');
    expect(parseLoginErrorParam('locked')).toBe('locked');
    expect(parseLoginErrorParam('unknown')).toBeUndefined();
  });
});
