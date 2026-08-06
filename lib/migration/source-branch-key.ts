/**
 * Canonical source-branch-key identity for migration packages.
 *
 * Used by manifest checksums, duplicate detection, and tenant mapping policy so
 * approval identity cannot drift from mapping uniqueness.
 *
 * Canonical rule (locked):
 * 1. value must be a string
 * 2. trim surrounding whitespace
 * 3. Unicode NFC normalisation
 * 4. locale-independent lowercase (`String.prototype.toLowerCase`)
 * 5. reject empty result
 * 6. enforce max length after trim/NFC (before case fold is equivalent for ASCII;
 *    length is checked on the NFC-trimmed form before lowercasing so combining
 *    characters are measured in their composed form)
 *
 * Target TillFlow `storeId` values are NOT canonicalised by this helper.
 */

import { MigrationContractError } from '@/lib/migration/errors';

/** Matches Phase 1 opening-stock `sourceBranchKey` field max length. */
export const SOURCE_BRANCH_KEY_MAX_LENGTH = 128;

export function canonicaliseSourceBranchKey(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new MigrationContractError('sourceBranchKey must be a string.');
  }
  const trimmed = raw.trim().normalize('NFC');
  if (!trimmed) {
    throw new MigrationContractError('sourceBranchKey is required.');
  }
  if (trimmed.length > SOURCE_BRANCH_KEY_MAX_LENGTH) {
    throw new MigrationContractError(
      `sourceBranchKey must be at most ${SOURCE_BRANCH_KEY_MAX_LENGTH} characters.`,
    );
  }
  return trimmed.toLowerCase();
}
