/**
 * Route-level contract: Trading Report / Money received / Cash Drawer fail closed
 * on invalid store scope (never broaden to ALL via getBusinessStores coalescing).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('reporting store-scope fail-closed routes', () => {
  it('Trading Report resolves raw searchParams.storeId and notFounds on store errors', () => {
    const page = read('app/(protected)/reports/dashboard/page.tsx');
    expect(page).toContain('resolveReportingScope(');
    expect(page).toContain('storeId: searchParams?.storeId');
    expect(page).not.toContain('rawStoreId ?? searchParams?.storeId ?? \'ALL\'');
    expect(page).toContain('isReportingScopeStoreError');
    expect(page).toContain('notFound()');
    expect(page).toContain("requireBusiness(['MANAGER', 'OWNER'])");
  });

  it('Money received list uses the same fail-closed scope as summaries', () => {
    const page = read('app/(protected)/reports/receipts/page.tsx');
    expect(page).toContain('resolveReportingScope(');
    expect(page).toContain('listMoneyReceivedPayments');
    expect(page).toContain('storeId: searchParams?.storeId');
    expect(page).not.toContain('rawStoreId ?? searchParams?.storeId ?? \'ALL\'');
    expect(page).toContain('isReportingScopeStoreError');
    expect(page).toContain('notFound()');
    expect(page).toContain("requireBusiness(['MANAGER', 'OWNER'])");
    expect(page).toContain('Math.min(50');
  });

  it('Cash Drawer uses resolveAuthorisedStoreId fail-closed (not ALL fallback)', () => {
    const page = read('app/(protected)/reports/cash-drawer/page.tsx');
    expect(page).toContain('resolveAuthorisedStoreId');
    expect(page).toContain('isReportingScopeStoreError');
    expect(page).toContain('notFound()');
    expect(page).not.toContain("resolveStoreSelection(stores, searchParams?.storeId, 'ALL')");
  });
});
