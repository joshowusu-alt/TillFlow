import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('E2E loading harness compile-out', () => {
  it('does not ship a deployable /dev/loading-harness route', () => {
    expect(existsSync(join(process.cwd(), 'app/(protected)/dev/loading-harness/page.tsx'))).toBe(false);
    expect(existsSync(join(process.cwd(), 'lib/loading/e2e-loading-harness.ts'))).toBe(false);

    const middleware = read('middleware.ts');
    expect(middleware).toContain("pathname.startsWith('/dev/loading-harness')");
    expect(middleware).toContain("new NextResponse('Not Found'");
    expect(middleware).not.toContain('E2E_LOADING_HARNESS');
    expect(middleware).not.toMatch(/isE2eLoadingHarnessEnabled/);
  });
});
