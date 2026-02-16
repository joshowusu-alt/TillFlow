import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Routes that don't require authentication */
const PUBLIC_PATHS = ['/login', '/register', '/offline', '/welcome'];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // --- Auth guard: redirect unauthenticated users to /login ---
    const sessionToken = request.cookies.get('pos_session')?.value;
    const isPublic =
        pathname === '/' || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

    if (!sessionToken && !isPublic) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        return NextResponse.redirect(loginUrl);
    }

    // Redirect logged-in users away from auth pages
    if (sessionToken && (pathname === '/login' || pathname === '/register')) {
        const posUrl = request.nextUrl.clone();
        posUrl.pathname = '/pos';
        return NextResponse.redirect(posUrl);
    }

    // --- Forward pathname header for server components ---
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-pathname', pathname);

    const response = NextResponse.next({
        request: { headers: requestHeaders },
    });

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
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json|icon.svg).*)',
    ],
};
