import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { renderTillFlowAppIcon } from '@/lib/branding/app-icon';

export const runtime = 'edge';

/**
 * Dynamic PNG icon generator for PWA manifest & favicons.
 * Usage: /api/icon?size=192  (any size from 16–1024)
 */
export async function GET(request: NextRequest) {
  const ALLOWED_SIZES = [16, 32, 48, 64, 128, 180, 192, 512];
  const sizeStr = request.nextUrl.searchParams.get('size') ?? '512';
  const parsed = parseInt(sizeStr, 10);
  if (!Number.isFinite(parsed) || !ALLOWED_SIZES.includes(parsed)) {
    return new Response('Invalid size. Allowed: ' + ALLOWED_SIZES.join(', '), { status: 400 });
  }
  const size = parsed;

  const response = new ImageResponse(renderTillFlowAppIcon(size), { width: size, height: size });

  response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return response;
}
