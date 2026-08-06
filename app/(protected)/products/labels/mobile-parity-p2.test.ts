import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('P2 product labels mobile workflow', () => {
  const client = read('app/(protected)/products/labels/LabelPrintClient.tsx');
  const page = read('app/(protected)/products/labels/page.tsx');

  it('adapts the selection queue for mobile with sticky primary actions', () => {
    expect(client).toContain('data-label-print-mobile-queue');
    expect(client).toContain('data-label-print-sticky-actions');
    expect(client).toContain('lg:hidden');
    expect(client).toContain('hidden overflow-x-auto lg:block');
    expect(client).toContain('--mobile-bottom-nav-height');
    expect(client).toContain('inputMode="numeric"');
    expect(client).toContain('Select all on this page');
  });

  it('preserves desktop table selection and print generation behaviour', () => {
    expect(client).toContain('<table');
    expect(client).toContain('generateLabelsHtmlAction');
    expect(client).toContain('PrintLabelsButton');
    expect(client).toContain('clampQuantity');
    expect(client).toContain('PAGE_SIZE');
  });

  it('does not expand Cashier into mobile navigation while route auth stays unchanged', () => {
    expect(page).toContain("requireBusiness(['CASHIER', 'MANAGER', 'OWNER'])");
    const mobileNav = read('lib/navigation/mobile-menu-config.ts');
    expect(mobileNav).toContain("href: '/products/labels'");
    expect(mobileNav).not.toMatch(/href: '\/products\/labels'[\s\S]{0,120}roles: \[[^\]]*CASHIER/);
    const cashierBlock = mobileNav.slice(
      mobileNav.indexOf('CASHIER_MENU_ITEMS'),
      mobileNav.indexOf('MOBILE_TAB_NAV_HREFS_BY_ROLE'),
    );
    expect(cashierBlock).not.toContain('/products/labels');
  });
});
