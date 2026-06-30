import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('RefreshIndicator', () => {
  it('keeps interval refresh and adds visibility/focus recovery hook', () => {
    const src = readFileSync(join(process.cwd(), 'components/RefreshIndicator.tsx'), 'utf8');

    expect(src).toContain('useRouterRefreshOnVisibility(router)');
    expect(src).toContain('setInterval(() => router.refresh(), autoRefreshMs)');
    expect(src).toContain('router.refresh()');
    expect(src).toContain('Updated {time}');
  });
});
