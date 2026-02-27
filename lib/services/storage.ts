import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export type AttachmentResult = { error: string } | string | null;

/** Save an uploaded file and return its public path, an error object, or null. */
export async function saveExpenseAttachment(formData: FormData): Promise<AttachmentResult> {
  const file = formData.get('attachment');
  if (!file || typeof file === 'string' || file.size === 0) return null;

  // Vercel serverless has a read-only / ephemeral filesystem — uploads would be silently lost.
  if (process.env.VERCEL) {
    return { error: 'File attachments require object storage configuration. Please contact your administrator.' };
  }

  if (file.size > MAX_ATTACHMENT_SIZE) {
    return { error: 'Attachment must not exceed 5 MB.' };
  }

  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return { error: 'Only JPEG, PNG, WebP and PDF attachments are allowed.' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'expenses');
  await mkdir(uploadsDir, { recursive: true });
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  await writeFile(path.join(uploadsDir, safeName), buffer);
  return `/uploads/expenses/${safeName}`;
}
