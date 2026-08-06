/**
 * Exact-byte SHA-256 helpers for migration file identity.
 *
 * Provenance: adapted from historic lib/migration/checksum.ts (0f6a917).
 * Parsing normalisation is intentionally separate from file identity.
 */

import { createHash } from 'node:crypto';

/** SHA-256 hex digest of the exact uploaded bytes (or UTF-8 string content). */
export function sha256Hex(content: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/** True when value looks like a lowercase hex SHA-256 digest. */
export function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
