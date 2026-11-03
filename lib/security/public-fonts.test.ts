import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('bundled login font access', () => {
  it.each([
    'plus-jakarta-sans-latin-wght-normal', 'plus-jakarta-sans-latin-ext-wght-normal',
    'dm-sans-latin-wght-normal', 'dm-sans-latin-ext-wght-normal',
  ])('serves %s without a login redirect', name => {
    const result = middleware(new NextRequest(`https://example.com/fonts/${name}.woff2`));
    expect(result.headers.get('location')).toBeNull();
    expect(result.headers.get('x-middleware-next')).toBe('1');
  });
  it.each(['/fonts/private', '/fonts/dm-sans-latin-wght-normal.woff2/private', '/api/private'])('keeps %s authenticated', pathname => {
    const result = middleware(new NextRequest(`https://example.com${pathname}`));
    expect(result.status === 401 || result.headers.get('location')?.includes('/login')).toBe(true);
  });
});
