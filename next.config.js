/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    // Type-checked locally via `tsc --noEmit`; skip during Vercel build to avoid
    // platform-specific Prisma client generation differences.
    ignoreBuildErrors: true,
  },
  eslint: {
    // ESLint runs locally via `next lint`; skip the redundant Vercel pass.
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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
