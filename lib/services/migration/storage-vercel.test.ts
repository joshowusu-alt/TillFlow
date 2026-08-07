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

const generateClientTokenFromReadWriteToken = vi.fn();



vi.mock('@vercel/blob', () => ({

  put: (...args: unknown[]) => put(...args),

  head: (...args: unknown[]) => head(...args),

  get: (...args: unknown[]) => get(...args),

  del: (...args: unknown[]) => del(...args),

}));



vi.mock('@vercel/blob/client', () => ({

  generateClientTokenFromReadWriteToken: (...args: unknown[]) =>

    generateClientTokenFromReadWriteToken(...args),

  getPayloadFromClientToken: (token: string) => {

    if (token === 'expired-token') {
      return { pathname: 'mig/a.csv', validUntil: Date.now() - 1000 };
    }
    if (token === 'short-lived-client-token') {
      return { pathname: 'mig/a.csv', validUntil: Date.now() + 60_000 };
    }
    if (token === 'wrong-path-token') {
      return { pathname: 'mig/other.csv', validUntil: Date.now() + 60_000 };
    }
    throw new Error('invalid token');
  },

}));



describe('vercel migration storage adapter', () => {

  beforeEach(() => {

    put.mockReset();

    head.mockReset();

    get.mockReset();

    del.mockReset();

    generateClientTokenFromReadWriteToken.mockReset();

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



  it('createClientUploadToken passes explicit migration token and never public token', async () => {

    const env = {

      [MIGRATION_BLOB_TOKEN_ENV]: 'mig-secret-rw',

      [PUBLIC_BLOB_TOKEN_ENV]: 'public-secret',

    };

    const storage = createVercelMigrationObjectStorage(env);

    generateClientTokenFromReadWriteToken.mockResolvedValue('short-lived-client-token');



    const token = await storage.createClientUploadToken({

      pathname: 'mig/biz/pkg/upl/PRODUCTS.csv',

      maximumSizeInBytes: 26_214_400,

      allowedContentTypes: ['text/csv'],

      validUntilMs: Date.now() + 60_000,

    });



    expect(generateClientTokenFromReadWriteToken).toHaveBeenCalledWith(

      expect.objectContaining({

        token: 'mig-secret-rw',

        pathname: 'mig/biz/pkg/upl/PRODUCTS.csv',

        maximumSizeInBytes: 26_214_400,

      }),

    );

    expect(token).toBe('short-lived-client-token');

    expect(token).not.toBe('mig-secret-rw');

    expect(token).not.toBe('public-secret');



    const callJson = JSON.stringify(generateClientTokenFromReadWriteToken.mock.calls);

    expect(callJson).not.toContain('public-secret');

  });

  it('verifyClientUploadToken binds token to pathname and rejects expired/mismatched tokens', async () => {
    const env = {
      [MIGRATION_BLOB_TOKEN_ENV]: 'mig-secret-rw',
    };
    const storage = createVercelMigrationObjectStorage(env);

    expect(
      await storage.verifyClientUploadToken({
        clientToken: 'short-lived-client-token',
        pathname: 'mig/a.csv',
      }),
    ).toBe(true);
    expect(
      await storage.verifyClientUploadToken({
        clientToken: 'wrong-path-token',
        pathname: 'mig/a.csv',
      }),
    ).toBe(false);
    expect(
      await storage.verifyClientUploadToken({
        clientToken: 'expired-token',
        pathname: 'mig/a.csv',
      }),
    ).toBe(false);
    expect(
      await storage.verifyClientUploadToken({
        clientToken: 'garbage',
        pathname: 'mig/a.csv',
      }),
    ).toBe(false);
  });

});


