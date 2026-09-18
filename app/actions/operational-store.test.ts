import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_BRANCHES_NOT_OPERATIONAL_MSG,
  FOREIGN_OPERATIONAL_STORE_MSG,
  MULTI_TAB_OPERATIONAL_STORE_CONTRACT,
} from '@/lib/reliability/operational-store';

describe('switchOperationalStoreAction contract', () => {
  const source = readFileSync(join(process.cwd(), 'app/actions/operational-store.ts'), 'utf8');

  it('only owners and managers may switch, and ALL is rejected', () => {
    expect(source).toContain("user.role !== 'OWNER' && user.role !== 'MANAGER'");
    expect(source).toContain('ALL_BRANCHES_NOT_OPERATIONAL_MSG');
    expect(source).toContain('FOREIGN_OPERATIONAL_STORE_MSG');
    expect(source).toContain('OPERATIONAL_STORE_COOKIE');
    expect(ALL_BRANCHES_NOT_OPERATIONAL_MSG).toMatch(/All branches/i);
    expect(FOREIGN_OPERATIONAL_STORE_MSG).toMatch(/not available/i);
  });

  it('persists the cookie and revalidates the shell', () => {
    expect(source).toContain("cookies().set(OPERATIONAL_STORE_COOKIE");
    expect(source).toContain("revalidatePath('/', 'layout')");
    expect(MULTI_TAB_OPERATIONAL_STORE_CONTRACT).toContain('last-write-wins');
  });
});
