import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mkdirMock, writeFileMock, putMock } = vi.hoisted(() => ({
  mkdirMock: vi.fn(),
  writeFileMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  mkdir: mkdirMock,
  writeFile: writeFileMock,
  default: {
    mkdir: mkdirMock,
    writeFile: writeFileMock,
  },
}));

vi.mock('@vercel/blob', () => ({
  put: putMock,
}));

import { saveProductImageFile, validateExternalProductImageUrl } from './storage';

function makeFile(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  return {
    name: overrides.name ?? 'milk.png',
    type: overrides.type ?? 'image/png',
    size: overrides.size ?? 1024,
    arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
  } as unknown as File;
}

describe('product image storage helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('stores accepted product images locally when blob storage is not configured', async () => {
    const result = await saveProductImageFile(makeFile({ name: 'fresh milk.png', type: 'image/png' }));

    expect(result).toMatch(/^\/uploads\/products\/\d+-fresh_milk\.png$/);
    expect(mkdirMock).toHaveBeenCalledWith(expect.stringMatching(/public[\\/]uploads[\\/]products$/), {
      recursive: true,
    });
    expect(writeFileMock).toHaveBeenCalledWith(expect.stringContaining('fresh_milk.png'), expect.any(Buffer));
  });

  it('stores accepted product images in Vercel Blob when configured', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'token';
    putMock.mockResolvedValue({ url: 'https://blob.example/products/milk.webp' });

    const result = await saveProductImageFile(makeFile({ name: 'milk.webp', type: 'image/webp' }));

    expect(result).toBe('https://blob.example/products/milk.webp');
    expect(putMock).toHaveBeenCalledWith(expect.stringMatching(/^products\/\d+-milk\.webp$/), expect.anything(), {
      access: 'public',
    });
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('rejects oversized and non-image product uploads', async () => {
    await expect(saveProductImageFile(makeFile({ size: 6 * 1024 * 1024 }))).resolves.toEqual({
      error: 'Product image must not exceed 5 MB.',
    });
    await expect(saveProductImageFile(makeFile({ type: 'application/pdf' }))).resolves.toEqual({
      error: 'Only JPEG, PNG and WebP product images are allowed.',
    });
  });

  it('accepts external URLs that directly return an image content type', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
    } as Response);

    await expect(validateExternalProductImageUrl('https://example.com/milk.jpg')).resolves.toBe(
      'https://example.com/milk.jpg',
    );
  });

  it('rejects normal webpages used as product image URLs', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    } as Response);

    await expect(validateExternalProductImageUrl('https://example.com/product-page')).resolves.toEqual({
      error: 'Product image URL must point directly to a JPEG, PNG or WebP image file.',
    });
  });
});
