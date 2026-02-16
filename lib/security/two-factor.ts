import { generateSecret, generateURI, verifySync } from 'otplib';

export function generateTwoFactorSecret() {
  return generateSecret({ length: 20 });
}

export function buildTwoFactorOtpAuthUrl(secret: string, email: string, issuer = 'TillFlow') {
  return generateURI({
    strategy: 'totp',
    secret,
    label: email,
    issuer,
    period: 30,
    digits: 6
  });
}

export function verifyTwoFactorCode(secret: string, code: string) {
  const normalizedCode = code.replace(/\s+/g, '');
  if (!normalizedCode) return false;
  const result = verifySync({
    strategy: 'totp',
    secret,
    token: normalizedCode,
    epochTolerance: 1
  });
  return !!result.valid;
}
