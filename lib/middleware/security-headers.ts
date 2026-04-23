import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Forward pathname + request ID to server components via request headers,
 * and attach x-request-id + HSTS to the outgoing response.
 *
 * Vercel terminates TLS, but HSTS ensures clients remember HTTPS.
 */
export function buildPassThroughResponse(request: NextRequest, requestId: string) {
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, requestId);
  return response;
}

export function applySecurityHeaders(response: NextResponse, requestId: string) {
  response.headers.set('x-request-id', requestId);
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );
  return response;
}
