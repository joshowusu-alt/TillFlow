import { NextResponse } from 'next/server';
import { stat, readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

/**
 * Serve files written under public/uploads at runtime.
 *
 * Why this exists:
 *   Next.js's static handler serves public/ at build time. Files written
 *   to public/ AFTER the build (e.g. dev-mode uploads) are usually still
 *   served via the dev fs handler, but Vercel deployments do NOT serve
 *   runtime-written public/ files at all (the deployment fs is read-only
 *   for static content). Routing all /uploads/* requests through this
 *   route gives a consistent serving path in dev, and for any non-Vercel
 *   self-hosted deployment that does write to disk.
 *
 *   On Vercel deployments where Vercel Blob is configured, uploads
 *   bypass this route entirely (URLs go to *.public.blob.vercel-storage.com).
 */
export async function GET(
  _request: Request,
  { params }: { params: { path: string[] } },
) {
  const segments = params.path ?? [];
  if (segments.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Reject path-traversal attempts.
  if (segments.some((seg) => seg === '..' || seg === '.' || seg.includes('\0'))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const uploadsRoot = path.join(process.cwd(), 'public', 'uploads');
  const fullPath = path.join(uploadsRoot, ...segments);

  // Ensure the resolved path stays inside the uploads root after path normalisation.
  if (!path.resolve(fullPath).startsWith(path.resolve(uploadsRoot))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let info;
  try {
    info = await stat(fullPath);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!info.isFile()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';

  const buffer = await readFile(fullPath);
  // Type assertion: the Buffer is a Uint8Array subclass; Web Response
  // accepts it as a body but the TS dom typing for BodyInit is narrower.
  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(info.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
