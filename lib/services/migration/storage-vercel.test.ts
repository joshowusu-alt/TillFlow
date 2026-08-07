import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createVercelMigrationObjectStorage,
  MIGRATION_BLOB_TOKEN_ENV,
  PUBLIC_BLOB_TOKEN_ENV,
  readMigrationBlobToken,
} from '@/lib/services/migration/storage';

const put = vi.fn();
const head = vi.fn();
const get = vi.fn();
const del = vi.fn();

vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => put(...args),
  head: (...args: unknown[]) => head(...args),
  get: (...args: unknown[]) => get(...args),
  del: (...args: unknown[]) => del(...args),
}));

describe('vercel migration storage adapter', () => {
  beforeEach(() => {
    put.mockReset();
    head.mockReset();
    get.mockReset();
    del.mockReset();
  });

  it('fails closed without migration token and never reads public token as fallback', () => {
    expect(() => readMigrationBlobToken({ [PUBLIC_BLOB_TOKEN_ENV]: 'public-only' })).toThrow(
      /not configured/i,
    );
  });

  it('passes explicit migration token and access private on every SDK call', async () => {
    const env = {
      [MIGRATION_BLOB_TOKEN_ENV]: 'mig-secret',
      [PUBLIC_BLOB_TOKEN_ENV]: 'public-secret',
    };
    const storage = createVercelMigrationObjectStorage(env);

    put.mockResolvedValue({
      url: 'https://blob.example/mig/a.csv',
      pathname: 'mig/a.csv',
    });
    head.mockResolvedValue({
      url: 'https://blob.example/mig/a.csv',
      pathname: 'mig/a.csv',
      size: 5,
      contentType: 'text/csv',
      uploadedAt: new Date().toISOString(),
      etag: '"1"',
    });
    get.mockResolvedValue({
      stream: new ReadableStream({
        start(c) {
          c.enqueue(Buffer.from('hello'));
          c.close();
        },
      }),
    });
    del.mockResolvedValue(undefined);

    await storage.put({
      pathname: 'mig/a.csv',
      body: Buffer.from('hello'),
      contentType: 'text/csv',
    });
    expect(put).toHaveBeenCalledWith(
      'mig/a.csv',
      expect.any(Buffer),
      expect.objectContaining({
        access: 'private',
        token: 'mig-secret',
        allowOverwrite: false,
      }),
    );
    expect(head).toHaveBeenCalledWith('https://blob.example/mig/a.csv', {
      token: 'mig-secret',
    });

    await storage.head('mig/a.csv');
    expect(head).toHaveBeenCalledWith('mig/a.csv', { token: 'mig-secret' });

    await storage.getStream('mig/a.csv');
    expect(get).toHaveBeenCalledWith('mig/a.csv', {
      access: 'private',
      token: 'mig-secret',
    });

    await storage.delete('mig/a.csv');
    expect(del).toHaveBeenCalledWith('mig/a.csv', { token: 'mig-secret' });

    // Public token must never appear in SDK calls.
    for (const call of [...put.mock.calls, ...head.mock.calls, ...get.mock.calls, ...del.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain('public-secret');
    }
  });
});
