/**
 * Stable source namespace for migration packages and future entity maps.
 *
 * Provenance: adapted from historic lib/migration/source-system-key.ts (0f6a917).
 */

import { MigrationContractError } from '@/lib/migration/errors';

export const SOURCE_SYSTEM_KEY_MAX_LENGTH = 63;
export const SOURCE_SYSTEM_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}$/;

export const SOURCE_BUSINESS_KEY_MAX_LENGTH = 128;

/**
 * Format: lowercase ASCII; starts with alphanumeric; then [a-z0-9_-]; length 2–63.
 * Absent key is rejected — there is no default namespace.
 */
export function normaliseSourceSystemKey(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new MigrationContractError(
      'sourceSystemKey is required (stable source namespace, e.g. legacy-pos-cutover).',
    );
  }
  const key = raw.trim().toLowerCase();
  if (key.length > SOURCE_SYSTEM_KEY_MAX_LENGTH) {
    throw new MigrationContractError(
      `sourceSystemKey must be at most ${SOURCE_SYSTEM_KEY_MAX_LENGTH} characters.`,
    );
  }
  if (!SOURCE_SYSTEM_KEY_PATTERN.test(key)) {
    throw new MigrationContractError(
      'sourceSystemKey must be 2–63 chars: start with a letter or digit, then letters, digits, _ or -.',
    );
  }
  return key;
}

/** Source business identity within the source system (not a TillFlow business id). */
export function normaliseSourceBusinessKey(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new MigrationContractError('sourceBusinessKey is required.');
  }
  const key = raw.trim().normalize('NFC');
  if (key.length > SOURCE_BUSINESS_KEY_MAX_LENGTH) {
    throw new MigrationContractError(
      `sourceBusinessKey must be at most ${SOURCE_BUSINESS_KEY_MAX_LENGTH} characters.`,
    );
  }
  if (/[\u0000-\u001f]/.test(key)) {
    throw new MigrationContractError('sourceBusinessKey must not contain control characters.');
  }
  return key;
}

export function normaliseSourceKey(raw: unknown, fieldLabel: string, maxLength = 128): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new MigrationContractError(`${fieldLabel} is required.`);
  }
  const key = raw.trim().normalize('NFC');
  if (key.length > maxLength) {
    throw new MigrationContractError(`${fieldLabel} must be at most ${maxLength} characters.`);
  }
  if (/[\u0000-\u001f]/.test(key)) {
    throw new MigrationContractError(`${fieldLabel} must not contain control characters.`);
  }
  return key;
}
