export const GHANA_PHONE_VALIDATION_MESSAGE =
  'Please enter a valid Ghana phone number, for example 0244123456 or 233244123456.';

const ALLOWED_INPUT_PATTERN = /^\+?[\d\s\-()]+$/;

function extractNationalDigits(digits: string): string | null {
  if (digits.startsWith('00233') && digits.length === 14) {
    return digits.slice(5);
  }

  if (digits.startsWith('233') && digits.length === 12) {
    return digits.slice(3);
  }

  if (digits.startsWith('0') && digits.length === 10) {
    return digits.slice(1);
  }

  if (digits.length === 9) {
    return digits;
  }

  return null;
}

function isGhanaMobileNational(national: string) {
  return national.length === 9 && /^[2345]/.test(national);
}

export function normaliseGhanaPhone(input: string | null | undefined): string | null {
  if (input == null) return null;

  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (!ALLOWED_INPUT_PATTERN.test(trimmed)) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  const national = extractNationalDigits(digits);
  if (!national || !isGhanaMobileNational(national)) {
    return null;
  }

  return `233${national}`;
}

export function isValidGhanaPhone(input: string | null | undefined): boolean {
  return normaliseGhanaPhone(input) !== null;
}

export function maskGhanaPhone(input: string | null | undefined): string {
  const normalised = normaliseGhanaPhone(input);
  if (!normalised) return '';
  return `+233****${normalised.slice(-4)}`;
}
