import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  assertUploadContentPolicy,
  assertUploadByteLimit,
  assertRejectedBase64Transport,
  assertServerOwnedMigrationPathname,
  buildMigrationStoragePathname,
  MIGRATION_MAX_BASE64_CHARS,
  newMigrationUploadId,
  sha256HexOfBuffer,
  sha256HexOfStreamBounded,
  assertMigrationEntityType,
} from '@/lib/services/migration/file-policy';
import {
  readMigrationBlobToken,
  MIGRATION_BLOB_TOKEN_ENV,
  PUBLIC_BLOB_TOKEN_ENV,
  createMemoryMigrationObjectStorage,
} from '@/lib/services/migration/storage';
import { MigrationServiceError } from '@/lib/services/migration/errors';
import { MIGRATION_MAX_UPLOAD_BYTES } from '@/lib/migration/limits';
import { assertMigrationActor } from '@/lib/services/migration/preapproval';

describe('migration file policy', () => {
  it('accepts csv/text and rejects archives', () => {
    const ok = assertUploadContentPolicy({
      originalFilename: 'suppliers.csv',
      contentType: 'text/csv',
      bytes: Buffer.from('a,b\n1,2\n'),
    });
    expect(ok.contentType).toBe('text/csv');
    expect(ok.originalFilename).toBe('suppliers.csv');

    expect(() =>
      assertUploadContentPolicy({
        originalFilename: 'x.zip',
        contentType: 'application/zip',
        bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
      }),
    ).toThrow(MigrationServiceError);
  });

  it('enforces 25 MiB ceiling', () => {
    expect(() => assertUploadByteLimit(0)).toThrow(MigrationServiceError);
    expect(() => assertUploadByteLimit(MIGRATION_MAX_UPLOAD_BYTES + 1)).toThrow(
      MigrationServiceError,
    );
    expect(() => assertUploadByteLimit(100)).not.toThrow();
  });

  it('builds collision-safe server-owned keys', () => {
    const a = buildMigrationStoragePathname({
      businessId: 'biz1',
      packageId: 'pkg1',
      uploadId: newMigrationUploadId(),
      entityType: 'PRODUCTS',
    });
    const b = buildMigrationStoragePathname({
      businessId: 'biz1',
      packageId: 'pkg1',
      uploadId: newMigrationUploadId(),
      entityType: 'PRODUCTS',
    });
    expect(a.startsWith('mig/biz1/pkg1/')).toBe(true);
    expect(a).not.toBe(b);
    expect(() =>
      buildMigrationStoragePathname({
        businessId: '../x',
        packageId: 'pkg1',
        uploadId: 'u1',
        entityType: 'PRODUCTS',
      }),
    ).toThrow(MigrationServiceError);
  });

  it('checksums exact bytes and validates entity types', () => {
    expect(sha256HexOfBuffer(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(assertMigrationEntityType('SUPPLIERS')).toBe('SUPPLIERS');
    expect(() => assertMigrationEntityType('CUSTOMERS')).toThrow(MigrationServiceError);
  });

  it('assertRejectedBase64Transport rejects oversized string before decode', () => {
    const oversized = 'A'.repeat(MIGRATION_MAX_BASE64_CHARS + 1);
    expect(() => assertRejectedBase64Transport(oversized)).toThrow(MigrationServiceError);
    try {
      assertRejectedBase64Transport(oversized);
    } catch (error) {
      expect((error as MigrationServiceError).code).toBe('FILE_POLICY');
      expect((error as MigrationServiceError).message).toMatch(/size ceiling/i);
    }
  });

  it('assertRejectedBase64Transport rejects malformed base64', () => {
    expect(() => assertRejectedBase64Transport('abc!!!')).toThrow(MigrationServiceError);
    try {
      assertRejectedBase64Transport('abc!!!');
    } catch (error) {
      expect((error as MigrationServiceError).code).toBe('FILE_POLICY');
      expect((error as MigrationServiceError).message).toMatch(/Malformed Base64/i);
    }
  });

  it('assertRejectedBase64Transport rejects valid-looking base64 (transport retired)', () => {
    const validBase64 = Buffer.from('hello').toString('base64');
    expect(() => assertRejectedBase64Transport(validBase64)).toThrow(MigrationServiceError);
    try {
      assertRejectedBase64Transport(validBase64);
    } catch (error) {
      expect((error as MigrationServiceError).code).toBe('FILE_POLICY');
      expect((error as MigrationServiceError).message).toMatch(/client-upload transport/i);
    }
  });

  it('assertServerOwnedMigrationPathname accepts valid path and rejects traversal/wrong business', () => {
    const valid = buildMigrationStoragePathname({
      businessId: 'biz1',
      packageId: 'pkg1',
      uploadId: newMigrationUploadId(),
      entityType: 'PRODUCTS',
    });
    expect(() =>
      assertServerOwnedMigrationPathname({
        pathname: valid,
        businessId: 'biz1',
        packageId: 'pkg1',
        entityType: 'PRODUCTS',
      }),
    ).not.toThrow();

    expect(() =>
      assertServerOwnedMigrationPathname({
        pathname: 'mig/other-biz/pkg1/upl1/PRODUCTS.csv',
        businessId: 'biz1',
        packageId: 'pkg1',
        entityType: 'PRODUCTS',
      }),
    ).toThrow(MigrationServiceError);

    expect(() =>
      assertServerOwnedMigrationPathname({
        pathname: 'mig/biz1/../evil/upl1/PRODUCTS.csv',
        businessId: 'biz1',
        packageId: 'pkg1',
        entityType: 'PRODUCTS',
      }),
    ).toThrow(MigrationServiceError);
  });

  it('sha256HexOfStreamBounded rejects empty and oversized streams', async () => {
    const empty = new ReadableStream({
      start(c) {
        c.close();
      },
    });
    await expect(sha256HexOfStreamBounded(empty)).rejects.toMatchObject({ code: 'FILE_POLICY' });

    const oversized = new ReadableStream({
      start(c) {
        c.enqueue(Buffer.alloc(MIGRATION_MAX_UPLOAD_BYTES + 1));
        c.close();
      },
    });
    await expect(sha256HexOfStreamBounded(oversized)).rejects.toMatchObject({
      code: 'FILE_POLICY',
    });
  });
});

describe('migration storage token selection', () => {
  it('requires MIGRATION_BLOB_READ_WRITE_TOKEN and rejects public-token equality', () => {
    expect(() => readMigrationBlobToken({})).toThrow(/not configured/i);
    expect(() =>
      readMigrationBlobToken({
        [MIGRATION_BLOB_TOKEN_ENV]: 'same',
        [PUBLIC_BLOB_TOKEN_ENV]: 'same',
      }),
    ).toThrow(/must not use the public/i);
    expect(
      readMigrationBlobToken({
        [MIGRATION_BLOB_TOKEN_ENV]: 'mig-token',
        [PUBLIC_BLOB_TOKEN_ENV]: 'pub-token',
      }),
    ).toBe('mig-token');
  });

  it('memory adapter put/head/get/delete round-trips', async () => {
    const storage = createMemoryMigrationObjectStorage();
    const meta = await storage.put({
      pathname: 'mig/b/p/u/PRODUCTS.csv',
      body: Buffer.from('hello'),
      contentType: 'text/csv',
    });
    expect(meta.size).toBe(5);
    const head = await storage.head(meta.url);
    expect(head.pathname).toBe('mig/b/p/u/PRODUCTS.csv');
    const got = await storage.getStream(meta.pathname);
    const buf = Buffer.from(await new Response(got.stream).arrayBuffer());
    expect(buf.toString()).toBe('hello');
    await storage.delete(meta.url);
    await expect(storage.head(meta.pathname)).rejects.toBeInstanceOf(MigrationServiceError);
  });
});

describe('migration actor gate', () => {
  it('allows Owner/Manager and denies Cashier/missing auth', () => {
    expect(
      assertMigrationActor({
        userId: 'u1',
        userRole: 'OWNER',
        businessId: 'b1',
      }).userRole,
    ).toBe('OWNER');
    expect(
      assertMigrationActor({
        userId: 'u1',
        userRole: 'MANAGER',
        businessId: 'b1',
      }).userRole,
    ).toBe('MANAGER');
    expect(() =>
      assertMigrationActor({ userId: 'u1', userRole: 'CASHIER', businessId: 'b1' }),
    ).toThrow(/denied/i);
    expect(() =>
      assertMigrationActor({ userId: null, userRole: 'OWNER', businessId: 'b1' }),
    ).toThrow(/Authentication/i);
  });
});
