import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('POS-safety authorised branch journey', () => {
  it('selects the last visible switcher as a real user and never injects Store A', () => {
    const helper = read('tests/e2e/helpers/select-authorised-branch.ts');
    const spec = read('tests/e2e/ui-programme-shell.spec.ts');
    expect(helper).toContain("locator('#operational-store-switcher').last()");
    expect(helper).toContain('expectPosSearchReady');
    expect(helper).not.toMatch(/storeA|STORE_A|cmu75fydk/);
    expect(spec).toContain('expectPosSearchReady(page)');
    expect(spec).toContain("page.goto('/pos'");
  });
});
