/**
 * File policy helpers for Slice 2A uploads (size, MIME, keys, entity types).
 */

import { createHash, randomBytes } from 'crypto';
import {
  MIGRATION_MAX_UPLOAD_BYTES,
  sanitizeOriginalFilename,
} from '@/lib/migration/limits';
import {
  isMigrationEntityType,
  type MigrationEntityType,
} from '@/lib/migration/types';
import { MigrationServiceError } from '@/lib/services/migration/errors';

const ALLOWED_CONTENT_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
]);

const ALLOWED_EXTENSIONS = new Set(['.csv', '.txt']);

const ARCHIVE_EXTENSIONS = new Set([
  '.zip',
  '.gz',
  '.gzip',
  '.7z',
  '.rar',
  '.tar',
  '.tgz',
  '.bz2',
  '.xz',
]);

export function assertMigrationEntityType(raw: unknown): MigrationEntityType {
  if (typeof raw !== 'string' || !isMigrationEntityType(raw)) {
    throw new MigrationServiceError(
      'FILE_POLICY',
      'entityType must be SUPPLIERS, PRODUCTS, or OPENING_STOCK.',
    );
  }
  return raw;
}

export function assertUploadByteLimit(byteLength: number): void {
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    throw new MigrationServiceError('FILE_POLICY', 'Uploaded file is empty.');
  }
  if (byteLength > MIGRATION_MAX_UPLOAD_BYTES) {
    throw new MigrationServiceError(
      'FILE_POLICY',
      `Uploaded file must not exceed ${MIGRATION_MAX_UPLOAD_BYTES} bytes.`,
    );
  }
}

function extensionOf(filename: string | null | undefined): string {
  const base = sanitizeOriginalFilename(filename) ?? '';
  const idx = base.lastIndexOf('.');
  if (idx < 0) return '';
  return base.slice(idx).toLowerCase();
}

export function assertUploadContentPolicy(input: {
  originalFilename?: string | null;
  contentType?: string | null;
  bytes: Buffer;
}): { contentType: string; originalFilename: string | null } {
  assertUploadByteLimit(input.bytes.length);

  const ext = extensionOf(input.originalFilename);
  if (ARCHIVE_EXTENSIONS.has(ext)) {
    throw new MigrationServiceError(
      'FILE_POLICY',
      'Compressed or archive uploads are not permitted.',
    );
  }
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    throw new MigrationServiceError(
      'FILE_POLICY',
      'Only .csv or .txt migration files are permitted.',
    );
  }

  // Reject obvious zip/gzip magic even if mislabeled.
  if (
    input.bytes.length >= 2 &&
    ((input.bytes[0] === 0x1f && input.bytes[1] === 0x8b) ||
      (input.bytes[0] === 0x50 && input.bytes[1] === 0x4b))
  ) {
    throw new MigrationServiceError(
      'FILE_POLICY',
      'Compressed or archive uploads are not permitted.',
    );
  }

  const declared = (input.contentType ?? '').split(';')[0]!.trim().toLowerCase();
  const contentType =
    declared && ALLOWED_CONTENT_TYPES.has(declared)
      ? declared
      : ext === '.txt'
        ? 'text/plain'
        : 'text/csv';

  if (declared && !ALLOWED_CONTENT_TYPES.has(declared)) {
    throw new MigrationServiceError(
      'FILE_POLICY',
      'Only CSV or plain-text content types are permitted.',
    );
  }

  return {
    contentType,
    originalFilename: sanitizeOriginalFilename(input.originalFilename),
  };
}

export function sha256HexOfBuffer(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function newMigrationUploadId(): string {
  return `upl_${randomBytes(12).toString('hex')}`;
}

/**
 * Server-owned private object pathname. Never accept client-supplied keys.
 * Format: mig/{businessId}/{packageId}/{uploadId}/{entityType}.csv
 */
export function buildMigrationStoragePathname(input: {
  businessId: string;
  packageId: string;
  uploadId: string;
  entityType: MigrationEntityType;
}): string {
  const safe = (value: string) => {
    if (!value || /[\\/\0]/.test(value) || value.includes('..')) {
      throw new MigrationServiceError('FILE_POLICY', 'Invalid storage path component.');
    }
    return value;
  };
  return [
    'mig',
    safe(input.businessId),
    safe(input.packageId),
    safe(input.uploadId),
    `${safe(input.entityType)}.csv`,
  ].join('/');
}

/**
 * Reject client-supplied pathnames that are not exactly under the server-owned
 * namespace for this business + package + entity.
 */
export function assertServerOwnedMigrationPathname(input: {
  pathname: string;
  businessId: string;
  packageId: string;
  entityType: MigrationEntityType;
}): void {
  const expectedPrefix = `mig/${input.businessId}/${input.packageId}/`;
  const expectedSuffix = `/${input.entityType}.csv`;
  if (
    !input.pathname.startsWith(expectedPrefix) ||
    !input.pathname.endsWith(expectedSuffix) ||
    input.pathname.includes('..') ||
    input.pathname.split('/').length !== 5
  ) {
    throw new MigrationServiceError('FILE_POLICY', 'Invalid migration storage pathname.');
  }
}

/**
 * Base64 is not a supported transport for migration file bytes (Vercel Functions
 * cap request bodies at 4.5 MiB; 25 MiB Base64 would amplify memory further).
 * Reject before any decode/allocation when an oversized or malformed payload appears.
 */
export const MIGRATION_MAX_BASE64_CHARS = Math.ceil((MIGRATION_MAX_UPLOAD_BYTES * 4) / 3) + 8;

export function assertRejectedBase64Transport(raw: unknown): never {
  if (typeof raw !== 'string') {
    throw new MigrationServiceError(
      'FILE_POLICY',
      'Migration file bytes must use the private client-upload transport.',
    );
  }
  if (raw.length > MIGRATION_MAX_BASE64_CHARS) {
    throw new MigrationServiceError(
      'FILE_POLICY',
      'Encoded upload payload exceeds the migration size ceiling before decoding.',
    );
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 !== 0) {
    throw new MigrationServiceError('FILE_POLICY', 'Malformed Base64 encoding.');
  }
  throw new MigrationServiceError(
    'FILE_POLICY',
    'Migration file bytes must use the private client-upload transport.',
  );
}

export const MIGRATION_ALLOWED_UPLOAD_CONTENT_TYPES = [
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
] as const;

/** Stream SHA-256 while enforcing the 25 MiB ceiling (no Base64 path). */
export async function sha256HexOfStreamBounded(
  stream: ReadableStream,
  maxBytes: number = MIGRATION_MAX_UPLOAD_BYTES,
): Promise<{ hex: string; bytes: Buffer; byteLength: number }> {
  const { createHash } = await import('crypto');
  const hash = createHash('sha256');
  const chunks: Buffer[] = [];
  let byteLength = 0;
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      byteLength += chunk.length;
      if (byteLength > maxBytes) {
        throw new MigrationServiceError(
          'FILE_POLICY',
          `Uploaded file must not exceed ${maxBytes} bytes.`,
        );
      }
      hash.update(chunk);
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  if (byteLength <= 0) {
    throw new MigrationServiceError('FILE_POLICY', 'Uploaded file is empty.');
  }
  return {
    hex: hash.digest('hex'),
    bytes: Buffer.concat(chunks, byteLength),
    byteLength,
  };
}
