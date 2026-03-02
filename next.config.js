/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    // Type errors must be fixed before deploying — do not silence them.
    ignoreBuildErrors: false,
  },
  eslint: {
    // ESLint errors must be fixed before deploying — do not silence them.
    ignoreDuringBuilds: false,
  },
  experimental: {
    // xlsx is used client-side only (file parsing in the browser).
    // Marking it external keeps it out of the server bundle, which prevents
    // Vercel from bundling a 400 kB spreadsheet library into every server chunk.
    serverComponentsExternalPackages: ['better-sqlite3', 'xlsx'],
  },
  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: '/api/icon?size=32',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,  // unsafe-eval dev-only
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "connect-src 'self' https://*.neon.tech wss://*.neon.tech",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
