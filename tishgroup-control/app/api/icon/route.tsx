import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

function renderControlAppIcon(size: number) {
  const borderRadius = Math.round(size * 0.22);
  const monogramSize = Math.round(size * 0.34);
  const badgeSize = Math.round(size * 0.18);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderRadius,
        background: 'linear-gradient(145deg, #122126 0%, #1f8a82 52%, #e2a83d 100%)',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: size * 0.08,
          borderRadius: borderRadius * 0.8,
          border: `${Math.max(2, Math.round(size * 0.018))}px solid rgba(255,255,255,0.14)`,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: Math.round(size * 0.62),
          height: Math.round(size * 0.62),
          borderRadius: Math.round(size * 0.18),
          background: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(8px)',
          fontSize: monogramSize,
          fontWeight: 800,
          letterSpacing: `-${Math.max(1, Math.round(size * 0.012))}px`,
        }}
      >
        TG
      </div>
      <div
        style={{
          position: 'absolute',
          right: Math.round(size * 0.12),
          bottom: Math.round(size * 0.12),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: badgeSize,
          height: badgeSize,
          borderRadius: 999,
          background: '#f7f4ef',
          color: '#122126',
          fontSize: Math.round(size * 0.075),
          fontWeight: 700,
        }}
      >
        C
      </div>
    </div>
  );
}

export async function GET(request: NextRequest) {
  const allowedSizes = [64, 128, 180, 192, 512];
  const sizeParam = request.nextUrl.searchParams.get('size') ?? '512';
  const parsed = parseInt(sizeParam, 10);

  if (!Number.isFinite(parsed) || !allowedSizes.includes(parsed)) {
    return new Response(`Invalid size. Allowed: ${allowedSizes.join(', ')}`, { status: 400 });
  }

  const response = new ImageResponse(renderControlAppIcon(parsed), {
    width: parsed,
    height: parsed,
  });

  response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return response;
}