import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('E2E loading harness production safety', () => {
  it('cannot activate on Vercel Production and requires an explicit CI/local flag', () => {
    const src = read('lib/loading/e2e-loading-harness.ts');
    const page = read('app/(protected)/dev/loading-harness/page.tsx');
    const middleware = read('middleware.ts');
    expect(src).toContain("process.env.VERCEL_ENV === 'production'");
    expect(src).toContain('tillflow.app');
    expect(src).toContain("process.env.E2E_LOADING_HARNESS === '1'");
    expect(page).toContain('isE2eLoadingHarnessEnabled');
    expect(page).toContain('notFound()');
    expect(middleware).toContain("process.env.E2E_LOADING_HARNESS === '1'");
    expect(middleware).toContain("process.env.VERCEL_ENV === 'production'");
  });
});
