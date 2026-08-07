/**
 * Narrow migration-private object storage port.
 * Production/Preview: Vercel Blob with explicit MIGRATION_BLOB_READ_WRITE_TOKEN.
 * Tests: in-memory fake. Never falls back to BLOB_READ_WRITE_TOKEN.
 */

import { MigrationServiceError } from '@/lib/services/migration/errors';

export type MigrationStoredObjectMeta = {
  pathname: string;
  /** Private blob URL — server-only; never expose to unauthorised clients. */
  url: string;
  size: number;
  contentType: string | null;
  uploadedAt: Date | null;
  etag: string | null;
};

export type MigrationPutObjectInput = {
  pathname: string;
  body: Buffer;
  contentType: string;
};

export interface MigrationObjectStorage {
  put(input: MigrationPutObjectInput): Promise<MigrationStoredObjectMeta>;
  head(pathnameOrUrl: string): Promise<MigrationStoredObjectMeta>;
  getStream(pathnameOrUrl: string): Promise<{
    stream: ReadableStream;
    meta: MigrationStoredObjectMeta;
  }>;
  delete(pathnameOrUrl: string): Promise<void>;
}

export const MIGRATION_BLOB_TOKEN_ENV = 'MIGRATION_BLOB_READ_WRITE_TOKEN';

/** Public asset token — must never be used for migration objects. */
export const PUBLIC_BLOB_TOKEN_ENV = 'BLOB_READ_WRITE_TOKEN';

export function readMigrationBlobToken(
  env: Record<string, string | undefined> = process.env,
): string {
  const token = env[MIGRATION_BLOB_TOKEN_ENV]?.trim();
  if (!token) {
    throw new MigrationServiceError(
      'STORAGE_NOT_CONFIGURED',
      'Migration private storage is not configured for this environment.',
      503,
    );
  }
  if (env[PUBLIC_BLOB_TOKEN_ENV] && token === env[PUBLIC_BLOB_TOKEN_ENV].trim()) {
    throw new MigrationServiceError(
      'STORAGE_NOT_CONFIGURED',
      'Migration storage must not use the public asset Blob credential.',
      503,
    );
  }
  return token;
}

export function createVercelMigrationObjectStorage(
  env: Record<string, string | undefined> = process.env,
): MigrationObjectStorage {
  const token = readMigrationBlobToken(env);

  return {
    async put(input) {
      const { put, head } = await import('@vercel/blob');
      try {
        const uploaded = await put(input.pathname, input.body, {
          access: 'private',
          token,
          contentType: input.contentType,
          addRandomSuffix: false,
          allowOverwrite: false,
        });
        const meta = await head(uploaded.url, { token });
        return {
          pathname: meta.pathname || uploaded.pathname,
          url: uploaded.url,
          size: meta.size,
          contentType: meta.contentType ?? input.contentType,
          uploadedAt: meta.uploadedAt ? new Date(meta.uploadedAt) : null,
          etag: meta.etag ?? null,
        };
      } catch (error) {
        throw new MigrationServiceError(
          'STORAGE_FAILURE',
          'Private migration object upload failed.',
          502,
        );
      }
    },

    async head(pathnameOrUrl) {
      const { head } = await import('@vercel/blob');
      try {
        const meta = await head(pathnameOrUrl, { token });
        return {
          pathname: meta.pathname,
          url: meta.url,
          size: meta.size,
          contentType: meta.contentType ?? null,
          uploadedAt: meta.uploadedAt ? new Date(meta.uploadedAt) : null,
          etag: meta.etag ?? null,
        };
      } catch {
        throw new MigrationServiceError(
          'STORAGE_FAILURE',
          'Private migration object metadata lookup failed.',
          502,
        );
      }
    },

    async getStream(pathnameOrUrl) {
      const { get, head } = await import('@vercel/blob');
      try {
        const result = await get(pathnameOrUrl, { access: 'private', token });
        if (!result || !result.stream) {
          throw new Error('empty');
        }
        const meta = await head(pathnameOrUrl, { token });
        return {
          stream: result.stream as ReadableStream,
          meta: {
            pathname: meta.pathname,
            url: meta.url,
            size: meta.size,
            contentType: meta.contentType ?? null,
            uploadedAt: meta.uploadedAt ? new Date(meta.uploadedAt) : null,
            etag: meta.etag ?? null,
          },
        };
      } catch {
        throw new MigrationServiceError(
          'STORAGE_FAILURE',
          'Private migration object download failed.',
          502,
        );
      }
    },

    async delete(pathnameOrUrl) {
      const { del } = await import('@vercel/blob');
      try {
        await del(pathnameOrUrl, { token });
      } catch {
        throw new MigrationServiceError(
          'STORAGE_FAILURE',
          'Private migration object deletion failed.',
          502,
        );
      }
    },
  };
}

/** Deterministic in-memory adapter for unit/integration tests (no real Blob). */
export function createMemoryMigrationObjectStorage(): MigrationObjectStorage & {
  objects: Map<string, { body: Buffer; contentType: string; url: string }>;
} {
  const objects = new Map<string, { body: Buffer; contentType: string; url: string }>();

  const toMeta = (
    pathname: string,
    entry: { body: Buffer; contentType: string; url: string },
  ): MigrationStoredObjectMeta => ({
    pathname,
    url: entry.url,
    size: entry.body.length,
    contentType: entry.contentType,
    uploadedAt: new Date('2026-08-07T00:00:00.000Z'),
    etag: `"${entry.body.length}"`,
  });

  const resolve = (pathnameOrUrl: string) => {
    if (objects.has(pathnameOrUrl)) return pathnameOrUrl;
    for (const [pathname, entry] of objects) {
      if (entry.url === pathnameOrUrl) return pathname;
    }
    return null;
  };

  return {
    objects,
    async put(input) {
      if (objects.has(input.pathname)) {
        throw new MigrationServiceError('STORAGE_FAILURE', 'Object key already exists.', 409);
      }
      const url = `https://memory.private.blob.test/${input.pathname}`;
      objects.set(input.pathname, {
        body: Buffer.from(input.body),
        contentType: input.contentType,
        url,
      });
      return toMeta(input.pathname, objects.get(input.pathname)!);
    },
    async head(pathnameOrUrl) {
      const key = resolve(pathnameOrUrl);
      if (!key) {
        throw new MigrationServiceError('STORAGE_FAILURE', 'Object not found.', 404);
      }
      return toMeta(key, objects.get(key)!);
    },
    async getStream(pathnameOrUrl) {
      const key = resolve(pathnameOrUrl);
      if (!key) {
        throw new MigrationServiceError('STORAGE_FAILURE', 'Object not found.', 404);
      }
      const entry = objects.get(key)!;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(entry.body);
          controller.close();
        },
      });
      return { stream, meta: toMeta(key, entry) };
    },
    async delete(pathnameOrUrl) {
      const key = resolve(pathnameOrUrl);
      if (!key) return;
      objects.delete(key);
    },
  };
}

let defaultStorage: MigrationObjectStorage | null = null;

export function getMigrationObjectStorage(): MigrationObjectStorage {
  if (!defaultStorage) {
    defaultStorage = createVercelMigrationObjectStorage();
  }
  return defaultStorage;
}

/** Test-only override. */
export function setMigrationObjectStorageForTests(
  storage: MigrationObjectStorage | null,
): void {
  defaultStorage = storage;
}
