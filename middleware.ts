import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Routes that don't require authentication */
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/offline',
  '/welcome',
  '/demo',
  '/api/health',
  '/api/payments/momo/webhook/mtn',
];

/** Paths protected by CRON_SECRET instead of session cookie */
const CRON_SECRET_PATHS = [
  '/api/cron/',
  '/api/seed-once',
];
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function forbiddenResponse(request: NextRequest, reason: string) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'forbidden', reason }, { status: 403 });
    }
    return new NextResponse('Forbidden', { status: 403 });
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const requestOrigin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

    // --- CSRF protection for all mutating requests ---
    if (MUTATING_METHODS.has(request.method)) {
        const origin = request.headers.get('origin');
        const secFetchSite = request.headers.get('sec-fetch-site');

        // Compare host only (ignore protocol) because Next.js production mode
        // may report https: for request.nextUrl.protocol even when the actual
        // server is running on plain HTTP (e.g. CI perf monitor).
        if (origin) {
            try {
                const originHost = new URL(origin).host;
                if (originHost !== request.nextUrl.host) {
                    return forbiddenResponse(request, 'origin_mismatch');
                }
            } catch {
                return forbiddenResponse(request, 'origin_mismatch');
            }
        }

        if (secFetchSite && !['same-origin', 'same-site'].includes(secFetchSite)) {
            return forbiddenResponse(request, 'cross_site_request');
        }
    }

    // --- Auth guard: redirect unauthenticated users to /login ---
    const sessionToken = request.cookies.get('pos_session')?.value;
    const isPublic =
        pathname === '/' || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

    if (!sessionToken && !isPublic) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        return NextResponse.redirect(loginUrl);
    }

    // Note: We intentionally do NOT redirect /login → /pos based on cookie existence.
    // The cookie may reference a stale/invalid session. The login page itself
    // validates the session via getUser() and redirects if truly authenticated.

    // CRON_SECRET_PATHS require Authorization: Bearer <CRON_SECRET> instead of a session.
    if (CRON_SECRET_PATHS.some((p) => pathname.startsWith(p))) {
      const cronSecret = process.env.CRON_SECRET;
      const authHeader = request.headers.get('authorization');
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'forbidden', reason: 'invalid_cron_secret' }, { status: 401 });
      }
      // Authorised cron call — skip the normal session check below.
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-pathname', pathname);
      requestHeaders.set('x-request-id', requestId);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // --- Forward pathname header for server components ---
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-pathname', pathname);
    requestHeaders.set('x-request-id', requestId);

    const response = NextResponse.next({
        request: { headers: requestHeaders },
    });
    response.headers.set('x-request-id', requestId);

    // --- HSTS header (Vercel terminates TLS, but this ensures clients remember HTTPS) ---
    response.headers.set(
        'Strict-Transport-Security',
        'max-age=63072000; includeSubDomains; preload'
    );

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icon.svg).*)',
    ],
};
