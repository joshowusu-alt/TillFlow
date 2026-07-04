import { test } from '@playwright/test';
import { expectNoHorizontalOverflow, focusFirstSearchInput } from './helpers/mobile-overflow';

const ownerRoutes = [
  ['/suppliers', 'Suppliers'],
  ['/customers', 'Customers'],
  ['/inventory', 'Inventory'],
  ['/products', 'Products'],
  ['/purchases', 'Purchases'],
  ['/sales', 'Sales'],
  ['/expenses', 'Expenses'],
  ['/reports/cash-drawer', 'Cash drawer'],
  ['/payments/supplier-payments', 'Supplier payments'],
  ['/payments/customer-receipts', 'Customer payments'],
  ['/shifts', 'Shifts'],
  ['/account', 'Account'],
] as const;

test.describe('Mobile overflow authenticated QA @owner @mobile-overflow', () => {
  for (const [path, label] of ownerRoutes) {
    test(`${label} has no horizontal overflow at 375px`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      await expectNoHorizontalOverflow(page);

      if (path === '/suppliers' || path === '/customers' || path === '/products') {
        await focusFirstSearchInput(page);
        await expectNoHorizontalOverflow(page);
      }
    });
  }
});
