import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasValidCronSecret } from '@/lib/cron-auth';

/** Routes that don't require authentication */
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/offline',
  '/welcome',
  '/demo',
  '/api/health',
  '/api/payments/momo/webhook/mtn',
    '/api/notifications/webhook/meta',
];

/** Paths protected by CRON_SECRET instead of session cookie */
const CRON_SECRET_PATHS = [
  '/api/cron/',
  '/api/seed-once',
];
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function normalizeComparableHost(host: string) {
    const trimmed = host.trim().toLowerCase();
    if (!trimmed) return trimmed;

    const isBracketedIpv6 = trimmed.startsWith('[');
    const portSeparator = trimmed.lastIndexOf(':');
    const hasPort = portSeparator > -1 && (!isBracketedIpv6 || trimmed.includes(']:'));
    const hostname = hasPort ? trimmed.slice(0, portSeparator) : trimmed;
    const port = hasPort ? trimmed.slice(portSeparator + 1) : '';

    if (LOOPBACK_HOSTS.has(hostname)) {
        return `loopback${port ? `:${port}` : ''}`;
    }

    return trimmed;
}

export function hostsMatch(leftHost: string, rightHost: string) {
    return normalizeComparableHost(leftHost) === normalizeComparableHost(rightHost);
}

function forbiddenResponse(request: NextRequest, reason: string) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'forbidden', reason }, { status: 403 });
    }
    return new NextResponse('Forbidden', { status: 403 });
}

function hasSameHostReferer(request: NextRequest) {
    const referer = request.headers.get('referer');
    if (!referer) return false;

    try {
        return hostsMatch(new URL(referer).host, request.nextUrl.host);
    } catch {
        return false;
    }
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const requestOrigin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

    // --- CSRF protection for all mutating requests ---
    if (MUTATING_METHODS.has(request.method)) {
        const origin = request.headers.get('origin');
        const secFetchSite = request.headers.get('sec-fetch-site');
        const sameHostReferer = hasSameHostReferer(request);

        // Compare host only (ignore protocol) because Next.js production mode
        // may report https: for request.nextUrl.protocol even when the actual
        // server is running on plain HTTP (e.g. CI perf monitor).
        if (origin && origin !== 'null') {
            try {
                const originHost = new URL(origin).host;
                if (!hostsMatch(originHost, request.nextUrl.host)) {
                    return forbiddenResponse(request, 'origin_mismatch');
                }
            } catch {
                if (!sameHostReferer) {
                    return forbiddenResponse(request, 'origin_mismatch');
                }
            }
        } else if (origin === 'null' && !sameHostReferer) {
            return forbiddenResponse(request, 'null_origin');
        }

        // Some legitimate browser contexts (including top-level form submits,
        // installed/PWA launches, and browser automation) can send
        // `sec-fetch-site: none`. Once the Origin host matches, that request is
        // still same-origin enough for our CSRF model.
        if (secFetchSite && !['same-origin', 'same-site', 'none'].includes(secFetchSite) && !sameHostReferer) {
            return forbiddenResponse(request, 'cross_site_request');
        }
    }

    // --- Auth guard: redirect unauthenticated users to /login ---
    // Cookie is business-scoped (pos_session_<businessId>) — scan for any match.
    const sessionToken = request.cookies.getAll().find(c => c.name.startsWith('pos_session_'))?.value;

    // Root route should never appear as an empty shell in the browser.
    // Redirect immediately to the correct landing page and let downstream
    // auth checks validate any stale session cookie on /pos.
    if (pathname === '/') {
        const rootUrl = request.nextUrl.clone();
        rootUrl.pathname = sessionToken ? '/onboarding' : '/welcome';
        return NextResponse.redirect(rootUrl);
    }

    if (CRON_SECRET_PATHS.some((p) => pathname.startsWith(p))) {
        if (!hasValidCronSecret(request)) {
            return NextResponse.json({ error: 'forbidden', reason: 'invalid_cron_secret' }, { status: 401 });
        }

        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-pathname', pathname);
        requestHeaders.set('x-request-id', requestId);

        const response = NextResponse.next({ request: { headers: requestHeaders } });
        response.headers.set('x-request-id', requestId);
        response.headers.set(
            'Strict-Transport-Security',
            'max-age=63072000; includeSubDomains; preload'
        );
        return response;
    }

    const isPublic =
        PUBLIC_PATHS.some((p) => pathname.startsWith(p));

    if (!sessionToken && !isPublic) {
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        return NextResponse.redirect(loginUrl);
    }

    // Note: We intentionally do NOT redirect /login → /pos based on cookie existence.
    // The cookie may reference a stale/invalid session. The login page itself
    // validates the session via getUser() and redirects if truly authenticated.

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
