import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  path.join(process.cwd(), 'app/(protected)/dev/owner-home-preview/page.tsx'),
  'utf8'
);
const middleware = readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf8');

describe('owner home preview production safety', () => {
  it('returns notFound outside development instead of redirecting into the app', () => {
    expect(page).toContain("process.env.NODE_ENV === 'development'");
    expect(page).toContain('ALLOW_OWNER_HOME_PREVIEW');
    expect(page).toContain('notFound()');
    expect(page).toContain("import('./fixtures')");
    expect(page).not.toMatch(/if \(!isOwnerHomePreviewAllowed\(\)\)[\s\S]{0,40}redirect\(/);
  });

  it('keeps the preview owner-gated when allowed', () => {
    expect(page).toContain('requireUser()');
    expect(page).toContain("user.role !== 'OWNER'");
    expect(page).toContain("redirect('/pos')");
  });

  it('blocks /dev harness routes in middleware before auth redirects', () => {
    expect(middleware).toContain("pathname.startsWith('/dev/')");
    expect(middleware).toContain('isDevHarnessAllowed');
    expect(middleware).toContain('ALLOW_OWNER_HOME_PREVIEW');
    expect(middleware).toContain('status: 404');
    expect(middleware).toContain("new NextResponse('Not Found'");
  });
});
