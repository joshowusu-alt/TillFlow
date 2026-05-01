import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type AttachmentResult = { error: string } | string | null;
export type ProductImageResult = { error: string } | string | null;

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

  // Local dev fallback — write to public/uploads/expenses/ (served by Next.js static handler).
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'expenses');
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, safeName), buffer);
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'products');
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, safeName), buffer);
  return `/uploads/products/${safeName}`;
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
