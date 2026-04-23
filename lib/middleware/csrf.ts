import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasSameHostReferer, hostsMatch } from './hosts';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function forbiddenResponse(request: NextRequest, reason: string) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'forbidden', reason }, { status: 403 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * Returns a 403 response if the mutating request fails CSRF checks,
 * or null if the request passes (or isn't a mutating method).
 */
export function enforceCsrf(request: NextRequest): NextResponse | null {
  if (!MUTATING_METHODS.has(request.method)) return null;

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

  return null;
}
