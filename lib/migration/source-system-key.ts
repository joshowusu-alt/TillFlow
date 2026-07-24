import { UserError } from '@/lib/action-utils';

/**
 * Stable source namespace for migration entity maps.
 *
 * Format: lowercase ASCII; starts with alphanumeric; then [a-z0-9_-]; length 2–63.
 * Case is not significant — values are normalised to lowercase before storage.
 * The key is immutable after MigrationBatch create (cannot change after validation/approval).
 * Absent key is rejected — there is no default namespace.
 *
 * Examples (documentation only — not schema enums): "legacy-pos-a", "workbook-2026-09", "accounting-export".
 */

export const SOURCE_SYSTEM_KEY_MAX_LENGTH = 63;
export const SOURCE_SYSTEM_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}$/;

export function normaliseSourceSystemKey(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new UserError('sourceSystemKey is required (stable source namespace, e.g. legacy-pos-cutover).');
  }
  const key = raw.trim().toLowerCase();
  if (key.length > SOURCE_SYSTEM_KEY_MAX_LENGTH) {
    throw new UserError(`sourceSystemKey must be at most ${SOURCE_SYSTEM_KEY_MAX_LENGTH} characters.`);
  }
  if (!SOURCE_SYSTEM_KEY_PATTERN.test(key)) {
    throw new UserError(
      'sourceSystemKey must be 2–63 chars: start with a letter or digit, then letters, digits, _ or -.',
    );
  }
  return key;
}
