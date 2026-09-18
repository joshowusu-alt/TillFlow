import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('default unit runner does not execute live Postgres tests', () => {
  it('excludes *.pg.test.ts from vitest.config.ts', () => {
    const config = readFileSync(join(process.cwd(), 'vitest.config.ts'), 'utf8');
    expect(config).toContain("'**/*.pg.test.ts'");
    expect(config).toContain('inventory-increase-concurrency.test.ts');
    expect(config).toContain("TILLFLOW_REQUIRE_ISOLATED_PREVIEW === '1'");
  });
});
