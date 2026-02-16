import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

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

  const response = new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
          borderRadius: size * 0.21,
        }}
      >
        {/* Cash register body */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: size * 0.015,
          }}
        >
          {/* Display screen */}
          <div
            style={{
              display: 'flex',
              width: size * 0.38,
              height: size * 0.14,
              background: 'rgba(255,255,255,0.95)',
              borderRadius: size * 0.025,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: size * 0.065,
                fontWeight: 700,
                color: '#059669',
              }}
            >
              TillFlow
            </span>
          </div>

          {/* Register body */}
          <div
            style={{
              display: 'flex',
              width: size * 0.44,
              height: size * 0.25,
              background: 'rgba(255,255,255,0.9)',
              borderRadius: size * 0.03,
              padding: size * 0.025,
              gap: size * 0.015,
              flexWrap: 'wrap',
              alignContent: 'flex-start',
            }}
          >
            {/* Keypad 3x2 */}
            <div style={{ display: 'flex', width: size * 0.065, height: size * 0.055, background: '#d1d5db', borderRadius: size * 0.008 }} />
            <div style={{ display: 'flex', width: size * 0.065, height: size * 0.055, background: '#d1d5db', borderRadius: size * 0.008 }} />
            <div style={{ display: 'flex', width: size * 0.065, height: size * 0.055, background: '#d1d5db', borderRadius: size * 0.008 }} />
            <div style={{ display: 'flex', width: size * 0.065, height: size * 0.055, background: '#d1d5db', borderRadius: size * 0.008 }} />
            <div style={{ display: 'flex', width: size * 0.065, height: size * 0.055, background: '#d1d5db', borderRadius: size * 0.008 }} />
            <div style={{ display: 'flex', width: size * 0.065, height: size * 0.055, background: '#d1d5db', borderRadius: size * 0.008 }} />
            {/* Green action button */}
            <div style={{ display: 'flex', width: size * 0.08, height: size * 0.12, background: '#10b981', borderRadius: size * 0.012, marginLeft: 'auto' }} />
          </div>
        </div>

        {/* Flow waves */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: size * 0.04,
            marginLeft: size * 0.04,
          }}
        >
          <div style={{ display: 'flex', width: size * 0.13, height: size * 0.018, background: 'rgba(255,255,255,0.9)', borderRadius: size * 0.01 }} />
          <div style={{ display: 'flex', width: size * 0.16, height: size * 0.018, background: 'rgba(255,255,255,0.65)', borderRadius: size * 0.01 }} />
          <div style={{ display: 'flex', width: size * 0.11, height: size * 0.018, background: 'rgba(255,255,255,0.4)', borderRadius: size * 0.01 }} />
        </div>
      </div>
    ),
    { width: size, height: size }
  );

  response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return response;
}
