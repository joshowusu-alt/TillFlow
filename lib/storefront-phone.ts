/**
 * Canonicalize a Ghana mobile number to E.164 form (+233XXXXXXXXX).
 *
 * Accepts the common shapes shoppers actually type:
 *   0244123456, 233244123456, +233244123456, 244 123 456, etc.
 *
 * Returns null if the result doesn't look like a 13-character +233 MSISDN.
 * This is the value we store in StorefrontCustomer.phone — keeping a single
 * canonical form is what makes the (businessId, phone) unique constraint
 * actually work as "one account per real phone number."
 */
export function normalizeGhanaPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;

  let national: string | null = null;
  if (digits.startsWith('00233') && digits.length === 14) {
    national = digits.slice(5);
  } else if (digits.startsWith('233') && digits.length === 12) {
    national = digits.slice(3);
  } else if (digits.startsWith('0') && digits.length === 10) {
    national = digits.slice(1);
  } else if (digits.length === 9) {
    national = digits;
  }

  if (!national || national.length !== 9) return null;
  // Mobile prefixes start 2/5/3 in the 9-digit national form. We don't lock
  // it down further — the SMS provider is the source of truth on routability.
  return `+233${national}`;
}

export function isValidGhanaPhone(input: string | null | undefined): boolean {
  return normalizeGhanaPhone(input) !== null;
}
