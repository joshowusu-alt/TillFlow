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
