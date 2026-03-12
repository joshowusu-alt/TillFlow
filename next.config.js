/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';
const localDevPorts = [6200, 6201, 6202, 6203, 6204];

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
    serverComponentsExternalPackages: ['better-sqlite3'],
    // Large imports (1000+ products) produce ~2-3 MB in the server-action request body.
    // Next.js 14.1+ supports bodySizeLimit via the nested serverActions object.
    serverActions: {
      // Local browser automation and mixed localhost/127.0.0.1 dev sessions can
      // otherwise trip Next.js origin checks and surface as 403s on legitimate
      // form submissions.
      allowedOrigins: localDevPorts.flatMap((port) => [`localhost:${port}`, `127.0.0.1:${port}`]),
      bodySizeLimit: '4mb',
    },
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
