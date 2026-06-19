import { ImageResponse } from 'next/og';

export const runtime = 'edge';

const WIDTH = 1200;
const HEIGHT = 630;

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const response = new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #1a368c 0%, #0e1f6a 52%, #080e44 100%)',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '80px',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '32px',
          }}
        >
          <img
            src={`${origin}/brand/tillflow-app-icon.png`}
            alt="TillFlow"
            width={160}
            height={160}
            style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 36 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: 96,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                display: 'flex',
              }}
            >
              <span style={{ color: '#7ab4ff' }}>Till</span>
              <span style={{ color: '#f3f4f6' }}>Flow</span>
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 28,
                fontWeight: 500,
                color: '#cbd5f5',
                letterSpacing: '0.04em',
              }}
            >
              Open for orders online
            </div>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 56,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 22,
            fontWeight: 500,
            color: '#94a3b8',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          Sales made simple · tillflow.com
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );

  response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return response;
}
