const { withSentryConfig } = require('@sentry/nextjs');

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
    // Camera is needed for the POS / purchases barcode scanner (html5-qrcode).
    // Blocking it outright (camera=()) would silently break the in-app scanner
    // on production, so we allow self and deny everywhere else.
    const permissionsPolicy = 'camera=(self), microphone=(), geolocation=()';

    // unsafe-inline on script-src is a known weakness kept because Next.js 14
    // still ships un-nonced inline scripts for hydration. Moving to a nonce
    // pipeline requires middleware changes and is tracked separately.
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // Receipt logos and expense attachments can point at arbitrary HTTPS
      // hosts (including Vercel Blob's *.public.blob.vercel-storage.com).
      // Images cannot execute code, so allowing https: is a deliberate
      // usability trade-off.
      "img-src 'self' data: blob: https:",
      // Sentry ingest + replay. Neon is kept for environments that may drive
      // the browser-side driver. Localhost websockets allow Next dev HMR.
      "connect-src 'self' https://*.neon.tech wss://*.neon.tech " +
        "https://*.ingest.sentry.io https://*.ingest.us.sentry.io " +
        "ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*",
      // Service worker (offline POS) + Sentry replay use blob: workers.
      "worker-src 'self' blob:",
      // Defense in depth — no Flash/PDF plugin content.
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // X-Frame-Options is redundant with frame-ancestors for CSP3
          // browsers but still useful for older browsers that ignore CSP.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: permissionsPolicy },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
  hideSourceMaps: true,
  automaticVercelMonitors: true,
};

module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig;
