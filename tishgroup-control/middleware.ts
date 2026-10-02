import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isSafeInternalReturnPath } from './lib/safe-return-path';

const PUBLIC_PREFIXES = [
  '/login',
  '/logout',
  '/offline',
  '/manifest.webmanifest',
  '/api/icon',
  '/api/health',
  '/api/digest',
  '/api/cron',
];

const SESSION_COOKIE = 'tishgroup_control_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    const candidate = pathname + request.nextUrl.search;
    if (pathname !== '/' && isSafeInternalReturnPath(candidate)) {
      loginUrl.searchParams.set('next', candidate);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};
