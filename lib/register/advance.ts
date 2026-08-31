/** Client-side register wizard enablement. Keep in sync with RegisterForm. */

export function canAdvanceRegisterStep1(businessName: string, ownerName: string) {
  return businessName.trim().length > 0 && ownerName.trim().length > 0;
}

export function canAdvanceRegisterStep2(email: string, password: string) {
  return email.trim().length > 0 && password.length >= 6;
}

export type RegisterAdvanceDiagnosisInput = {
  step: 1 | 2;
  nextDisabled: boolean;
  businessName: string;
  ownerName: string;
  email?: string;
  passwordLength?: number;
  visibleErrors?: string[];
};

/**
 * Explains why a register Next button stayed disabled.
 * Never include email or password values — only field names and emptiness.
 */
export function diagnoseDisabledRegisterAdvance(input: RegisterAdvanceDiagnosisInput) {
  if (!input.nextDisabled) return '';

  const errors = (input.visibleErrors ?? []).filter((text) => text.trim().length > 0);
  const errorSuffix = errors.length ? ` Visible validation: ${errors.join(' | ')}.` : '';

  if (input.step === 1) {
    const missing: string[] = [];
    if (!input.businessName.trim()) missing.push('Business Name');
    if (!input.ownerName.trim()) missing.push('Your Name');
    if (missing.length) {
      return `Next — Account Details stayed disabled. Missing: ${missing.join(', ')}.${errorSuffix}`;
    }
    return (
      'Next — Account Details stayed disabled after Business Name and Your Name were filled. ' +
      'React state did not accept the values (controlled-input fill).' +
      errorSuffix
    );
  }

  const missing: string[] = [];
  if (!input.email?.trim()) missing.push('Email');
  if (!input.passwordLength) missing.push('Password');
  else if (input.passwordLength < 6) missing.push('Password (min 6 characters)');
  if (missing.length) {
    return `Next — Choose Plan stayed disabled. Invalid or missing: ${missing.join(', ')}.${errorSuffix}`;
  }
  return (
    'Next — Choose Plan stayed disabled after Email and Password were filled. ' +
    'React state did not accept the values (controlled-input fill).' +
    errorSuffix
  );
}
