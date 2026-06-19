import { readFile } from 'fs/promises';
import { join } from 'path';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

/**
 * Static PNG icon compatibility route.
 * Usage: /api/icon?size=192  (allowed sizes from uploaded TillFlow app-logo derivatives)
 */
export async function GET(request: NextRequest) {
  const allowedSizes = [16, 32, 48, 64, 96, 128, 180, 192, 512];
  const sizeStr = request.nextUrl.searchParams.get('size') ?? '512';
  const size = parseInt(sizeStr, 10);
  if (!Number.isFinite(size) || !allowedSizes.includes(size)) {
    return new Response('Invalid size. Allowed: ' + allowedSizes.join(', '), { status: 400 });
  }

  const file = await readFile(join(process.cwd(), 'public', 'icons', `tillflow-icon-${size}.png`));
  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
