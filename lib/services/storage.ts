import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BUSINESS_LOGO_SIZE = 2 * 1024 * 1024; // 2 MB — logos are small artwork
// SVG is intentionally excluded: SVG can carry <script> and event handlers.
const ALLOWED_BUSINESS_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type AttachmentResult = { error: string } | string | null;
export type ProductImageResult = { error: string } | string | null;
export type BusinessLogoResult = { error: string } | string | null;
export type BusinessBrandImageResult = { error: string } | string | null;
export type BusinessBrandImageKind = 'primary' | 'compact' | 'square';
export type ImageDimensions = { width: number; height: number } | null;

function isVercelRuntime(env: NodeJS.ProcessEnv = process.env) {
  return env.VERCEL === '1' || env.VERCEL === 'true';
}

function getMissingStorageError(kind: 'attachment' | 'product-image' | 'business-logo') {
  switch (kind) {
    case 'product-image':
      return 'Image uploads are not configured for this deployment yet. Paste a direct image URL instead.';
    case 'business-logo':
      return 'Logo uploads are not configured for this deployment yet. Enable Blob storage before uploading files here.';
    case 'attachment':
    default:
      return 'File uploads are not configured for this deployment yet. Enable Blob storage before uploading attachments.';
  }
}

async function saveFileLocally(file: File, folderParts: string[], safeName: string) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', ...folderParts);
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, safeName), buffer);
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extensionForImageType(type: string) {
  switch (type) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'img';
  }
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return value !== null && typeof value !== 'string' && value.size > 0;
}

/**
 * Extract pixel dimensions from a JPEG, PNG or WebP file buffer.
 * Reads only the minimum header bytes — no native dependency required.
 * Returns null if the format is unrecognised or the header is too short.
 */
export function readImageDimensions(buffer: Uint8Array): ImageDimensions {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const len = buffer.byteLength;

  // PNG: signature 8 bytes, then IHDR chunk (4 len + 4 "IHDR" + 4 width + 4 height)
  if (
    len >= 24 &&
    view.getUint8(0) === 0x89 &&
    view.getUint8(1) === 0x50 && // P
    view.getUint8(2) === 0x4e && // N
    view.getUint8(3) === 0x47    // G
  ) {
    const width  = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    if (width > 0 && height > 0) return { width, height };
  }

  // JPEG: scan for SOF0 / SOF1 / SOF2 markers to find width and height
  if (len >= 4 && view.getUint8(0) === 0xff && view.getUint8(1) === 0xd8) {
    let offset = 2;
    while (offset + 8 < len) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      const segLen = view.getUint16(offset + 2, false);
      // SOF0 = 0xc0, SOF1 = 0xc1, SOF2 = 0xc2
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        if (offset + 9 < len) {
          const height = view.getUint16(offset + 5, false);
          const width  = view.getUint16(offset + 7, false);
          if (width > 0 && height > 0) return { width, height };
        }
        break;
      }
      offset += 2 + segLen;
    }
  }

  // WebP: RIFF ... WEBP VP8  (lossy) or VP8L (lossless) or VP8X (extended)
  if (
    len >= 30 &&
    view.getUint8(0) === 0x52 && // R
    view.getUint8(1) === 0x49 && // I
    view.getUint8(2) === 0x46 && // F
    view.getUint8(3) === 0x46 && // F
    view.getUint8(8)  === 0x57 && // W
    view.getUint8(9)  === 0x45 && // E
    view.getUint8(10) === 0x42 && // B
    view.getUint8(11) === 0x50    // P
  ) {
    const chunk = String.fromCharCode(
      view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15),
    );
    if (chunk === 'VP8 ' && len >= 30) {
      // Lossy: bitstream header at byte 26; 14-bit width/height stored little-endian
      const rawW = view.getUint16(26, true);
      const rawH = view.getUint16(28, true);
      const width  = (rawW & 0x3fff) + 1;
      const height = (rawH & 0x3fff) + 1;
      if (width > 0 && height > 0) return { width, height };
    }
    if (chunk === 'VP8L' && len >= 25) {
      // Lossless: 4 bytes at offset 21 encode width-1 (14 bits) and height-1 (14 bits)
      const b0 = view.getUint8(21);
      const b1 = view.getUint8(22);
      const b2 = view.getUint8(23);
      const b3 = view.getUint8(24);
      const bits = (b3 << 24) | (b2 << 16) | (b1 << 8) | b0;
      const width  = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      if (width > 0 && height > 0) return { width, height };
    }
    if (chunk === 'VP8X' && len >= 24) {
      // Extended: 3-byte little-endian (canvas width - 1) at byte 24, height at 27
      const width  = ((view.getUint8(26) << 16) | (view.getUint8(25) << 8) | view.getUint8(24)) + 1;
      const height = ((view.getUint8(29) << 16) | (view.getUint8(28) << 8) | view.getUint8(27)) + 1;
      if (width > 0 && height > 0) return { width, height };
    }
  }

  return null;
}

/** Save an uploaded file and return its public URL, an error object, or null. */
export async function saveExpenseAttachment(formData: FormData): Promise<AttachmentResult> {
  const file = formData.get('attachment');
  if (!file || typeof file === 'string' || file.size === 0) return null;

  if (file.size > MAX_ATTACHMENT_SIZE) {
    return { error: 'Attachment must not exceed 5 MB.' };
  }

  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return { error: 'Only JPEG, PNG, WebP and PDF attachments are allowed.' };
  }

  const safeName = `${Date.now()}-${sanitizeFilename(file.name)}`;

  // On Vercel (or any env with BLOB_READ_WRITE_TOKEN) use Vercel Blob for durable storage.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`expenses/${safeName}`, file, { access: 'public' });
    return blob.url;
  }

  if (isVercelRuntime()) {
    return { error: getMissingStorageError('attachment') };
  }

  // Local dev fallback — write to public/uploads/expenses/ (served by Next.js static handler).
  await saveFileLocally(file, ['expenses'], safeName);
  return `/uploads/expenses/${safeName}`;
}

export async function saveProductImageFile(file: FormDataEntryValue | null): Promise<ProductImageResult> {
  if (!isFileLike(file)) return null;

  if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
    return { error: 'Product image must not exceed 5 MB.' };
  }

  if (!ALLOWED_PRODUCT_IMAGE_TYPES.includes(file.type)) {
    return { error: 'Only JPEG, PNG and WebP product images are allowed.' };
  }

  const originalName = sanitizeFilename(file.name || `product-image.${extensionForImageType(file.type)}`);
  const safeName = `${Date.now()}-${originalName}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`products/${safeName}`, file, { access: 'public' });
    return blob.url;
  }

  if (isVercelRuntime()) {
    return { error: getMissingStorageError('product-image') };
  }

  await saveFileLocally(file, ['products'], safeName);
  return `/uploads/products/${safeName}`;
}

export type BusinessBrandImageUploadResult =
  | { error: string }
  | { url: string; dimensions: ImageDimensions }
  | null;

export async function saveBusinessLogoFile(file: FormDataEntryValue | null): Promise<BusinessBrandImageResult> {
  const result = await saveBusinessBrandImageFile(file, 'primary');
  if (result && typeof result === 'object' && 'url' in result) return result.url;
  if (result && typeof result === 'object' && 'error' in result) return result;
  return null;
}

export async function saveBusinessBrandImageFile(
  file: FormDataEntryValue | null,
  kind: BusinessBrandImageKind = 'primary',
): Promise<BusinessBrandImageUploadResult> {
  if (!isFileLike(file)) return null;

  if (file.size > MAX_BUSINESS_LOGO_SIZE) {
    return { error: 'Logo must not exceed 2 MB.' };
  }

  if (!ALLOWED_BUSINESS_LOGO_TYPES.includes(file.type)) {
    return { error: 'Only JPEG, PNG and WebP logos are allowed.' };
  }

  // Read buffer once — used for both dimension extraction and storage.
  const buffer = new Uint8Array(await file.arrayBuffer());
  const dimensions = readImageDimensions(buffer);

  const originalName = sanitizeFilename(file.name || `logo.${extensionForImageType(file.type)}`);
  const safeName = `${Date.now()}-${kind}-${originalName}`;
  const folder = kind === 'compact' ? 'business-branding/compact' : kind === 'square' ? 'business-branding/square' : 'business-logos';
  const localFolder = kind === 'compact' ? ['business-branding', 'compact'] : kind === 'square' ? ['business-branding', 'square'] : ['business-logos'];

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`${folder}/${safeName}`, new Blob([buffer], { type: file.type }), { access: 'public' });
    return { url: blob.url, dimensions };
  }

  if (isVercelRuntime()) {
    return { error: getMissingStorageError('business-logo') };
  }

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', ...localFolder);
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, safeName), Buffer.from(buffer));
  const url = `/${['uploads', ...localFolder, safeName].join('/')}`;
  return { url, dimensions };
}

export async function validateExternalProductImageUrl(rawUrl: string | null | undefined): Promise<ProductImageResult> {
  const value = rawUrl?.trim();
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: 'Product image URL must be a valid web address.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: 'Product image URL must start with http:// or https://.' };
  }

  const isImageResponse = (contentType: string | null) =>
    Boolean(contentType && ALLOWED_PRODUCT_IMAGE_TYPES.some((type) => contentType.toLowerCase().startsWith(type)));

  try {
    let response = await fetch(parsed.toString(), { method: 'HEAD', redirect: 'follow' });
    if (!response.ok || !isImageResponse(response.headers.get('content-type'))) {
      response = await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        headers: { Range: 'bytes=0-1023' },
      });
    }

    if (!response.ok) {
      return { error: 'Product image URL could not be loaded. Try uploading the image instead.' };
    }

    if (!isImageResponse(response.headers.get('content-type'))) {
      return { error: 'Product image URL must point directly to a JPEG, PNG or WebP image file.' };
    }
  } catch {
    return { error: 'Product image URL could not be checked. Try uploading the image instead.' };
  }

  return parsed.toString();
}
