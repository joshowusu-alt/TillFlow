import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { enforceCsrf } from '@/lib/middleware/csrf';
import { isCronSecretPath, isValidCronRequest } from '@/lib/middleware/cron-gate';
import { buildPassThroughResponse } from '@/lib/middleware/security-headers';

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

  const csrfRejection = enforceCsrf(request);
  if (csrfRejection) return csrfRejection;

  // Root route should never appear as an empty shell in the browser.
  // Redirect immediately to the correct landing page and let downstream
  // auth checks validate any stale session cookie on /pos.
  const sessionToken = request.cookies
    .getAll()
    .find((c) => c.name.startsWith('pos_session_'))?.value;

  if (pathname === '/') {
    const rootUrl = request.nextUrl.clone();
    rootUrl.pathname = sessionToken ? '/onboarding' : '/welcome';
    return NextResponse.redirect(rootUrl);
  }

  if (isCronSecretPath(pathname)) {
    if (!isValidCronRequest(request)) {
      return NextResponse.json(
        { error: 'forbidden', reason: 'invalid_cron_secret' },
        { status: 401 }
      );
    }
    return buildPassThroughResponse(request, requestId);
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
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

  return buildPassThroughResponse(request, requestId);
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
