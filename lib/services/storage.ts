import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export type AttachmentResult = { error: string } | string | null;

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

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

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
