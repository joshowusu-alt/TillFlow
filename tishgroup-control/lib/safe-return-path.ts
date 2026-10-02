const BLOCKED_PREFIXES = ['/login', '/logout'];

export function isSafeInternalReturnPath(value: string | null | undefined): boolean {
  if (!value) return false;
  const path = value.trim();
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//') || path.startsWith('/\\')) return false;
  if (path.includes('\\') || path.includes('@')) return false;
  if (path.includes('://')) return false;
  if (BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))) {
    return false;
  }
  if (/%2f/i.test(path) || /%5c/i.test(path)) return false;
  return true;
}

export function safeReturnPath(value: string | null | undefined, fallback: string): string {
  return isSafeInternalReturnPath(value) ? String(value).trim() : fallback;
}

export function withRedirectParam(path: string, key: string, value: string) {
  const safePath = isSafeInternalReturnPath(path) ? path : '/';
  const [pathname, query = ''] = safePath.split('?');
  const params = new URLSearchParams(query);
  params.set(key, value);
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}
