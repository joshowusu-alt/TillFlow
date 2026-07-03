export type LoginErrorCode =
  | 'missing'
  | 'locked'
  | 'invalid'
  | 'otp_required'
  | 'otp_invalid'
  | 'deactivated'
  | 'server';

export type LoginFormState = {
  error: LoginErrorCode;
} | null;

export function getLoginErrorMessage(error: LoginErrorCode | string | undefined): string | null {
  switch (error) {
    case 'missing':
      return 'Please enter your email and password.';
    case 'locked':
      return 'Too many failed attempts. Please wait and try again.';
    case 'otp_required':
      return 'This account requires a 2FA code from your authenticator app.';
    case 'otp_invalid':
      return 'Invalid 2FA code. Please try again.';
    case 'deactivated':
      return 'This business account has been deactivated. Contact your account manager.';
    case 'server':
      return 'Unable to connect. Please try again in a moment.';
    case 'invalid':
      return 'Invalid email or password.';
    default:
      return null;
  }
}

export function parseLoginErrorParam(value: string | undefined): LoginErrorCode | undefined {
  if (!value) return undefined;
  const allowed: LoginErrorCode[] = [
    'missing',
    'locked',
    'invalid',
    'otp_required',
    'otp_invalid',
    'deactivated',
    'server',
  ];
  return allowed.includes(value as LoginErrorCode) ? (value as LoginErrorCode) : undefined;
}
