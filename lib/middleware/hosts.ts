import type { NextRequest } from 'next/server';

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

export function hasSameHostReferer(request: NextRequest) {
  const referer = request.headers.get('referer');
  if (!referer) return false;

  try {
    return hostsMatch(new URL(referer).host, request.nextUrl.host);
  } catch {
    return false;
  }
}
