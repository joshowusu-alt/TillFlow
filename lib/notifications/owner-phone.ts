import {
  GHANA_PHONE_VALIDATION_MESSAGE,
  isValidGhanaPhone,
  normaliseGhanaPhone,
} from '@/lib/phone/ghana-phone';

export { GHANA_PHONE_VALIDATION_MESSAGE, isValidGhanaPhone, maskGhanaPhone, normaliseGhanaPhone } from '@/lib/phone/ghana-phone';

export function resolveDailySummaryOwnerPhone(raw?: string | null) {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    return { ok: true as const, phone: null };
  }

  if (!isValidGhanaPhone(trimmed)) {
    return { ok: false as const, error: GHANA_PHONE_VALIDATION_MESSAGE };
  }

  return { ok: true as const, phone: normaliseGhanaPhone(trimmed)! };
}

export function resolveDailySummaryOwnerPhoneFromStored(stored?: string | null) {
  if (!stored?.trim()) return null;
  return normaliseGhanaPhone(stored);
}
