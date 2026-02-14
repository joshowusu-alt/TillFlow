/**
 * Shared form-data parsing helpers.
 *
 * Every server-action file previously had its own copy of toPence / toInt.
 * Centralise them here so there is exactly one definition (DRY).
 */

/** Parse a currency string (e.g. "1,234.56") → integer pence. */
export function toPence(value: FormDataEntryValue | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const trimmed = String(value).replace(/,/g, '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

/** Parse any value to an integer (defaults to 0). */
export function toInt(value: FormDataEntryValue | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Extract a trimmed string from FormData, falling back to `''`. */
export function formString(formData: FormData, key: string): string {
  return String(formData.get(key) || '').trim();
}

/** Extract a trimmed string — or null when the field is blank. */
export function formOptionalString(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) || '').trim();
  return v || null;
}

/** Extract an integer from FormData. */
export function formInt(formData: FormData, key: string): number {
  return toInt(formData.get(key));
}

/** Extract a pence value from FormData. */
export function formPence(formData: FormData, key: string): number {
  return toPence(formData.get(key));
}

/** Parse a date string from FormData, or null. */
export function formDate(formData: FormData, key: string): Date | null {
  const raw = formData.get(key);
  if (!raw) return null;
  const s = String(raw).trim();
  return s ? new Date(s) : null;
}
