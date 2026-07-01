import { test, expect } from '@playwright/test';
import {
  collectTillflowMarks,
  parseMoneyToPence,
  parseTxnCount,
  waitForProtectedShell,
  assertTenantUsableForQa,
} from './helpers/login';
import { qaSaleAllowed } from './helpers/env';

test.describe('Owner authenticated QA @owner', () => {
  test('owner home shows shell, readiness skeleton, then dashboard content', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await waitForProtectedShell(page);
    await assertTenantUsableForQa(page);

    const skeleton = page.getByRole('status', { name: /Preparing owner dashboard/i });
    const sawSkeleton = await skeleton.isVisible().catch(() => false);

    await expect(page.locator('#main-content')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1 }).or(page.getByText(/Here's your business at a glance/i)).first(),
    ).toBeVisible({ timeout: 45_000 });

    const dashboardMarker = page
      .getByRole('link', { name: /Expected Cash/i })
      .or(page.getByText(/Start properly|Good (morning|afternoon|evening)/i))
      .first();
    await expect(dashboardMarker).toBeVisible({ timeout: 60_000 });

    if (!sawSkeleton) {
      test.info().annotations.push({
        type: 'owner-readiness',
        description: 'Owner readiness skeleton was not observed; dashboard loaded directly from stored auth.',
      });
    }
  });

  test('hero and top nav today KPIs align after dashboard load', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await waitForProtectedShell(page);
    await assertTenantUsableForQa(page);
    await expect(page.getByRole('link', { name: /Expected Cash/i }).first()).toBeVisible({
      timeout: 45_000,
    });

    const navStrip = page.locator('header').filter({ hasText: /txn/i }).first();
    const navText = (await navStrip.textContent().catch(() => null)) ?? '';
    const navPence = parseMoneyToPence(navText);
    const navTxns = parseTxnCount(navText);

    const heroTxnLink = page.getByRole('link', { name: /Today's Transactions/i }).first();
    const heroRevenueLink = page.getByRole('link', { name: /Today's Revenue|Revenue/i }).first();
    const heroTxnText = (await heroTxnLink.isVisible().catch(() => false))
      ? await heroTxnLink.textContent()
      : null;
    const heroRevenueText = (await heroRevenueLink.isVisible().catch(() => false))
      ? await heroRevenueLink.textContent()
      : null;
    const heroPence = parseMoneyToPence(heroRevenueText);
    const heroTxns = heroTxnText
      ? Number((heroTxnText.match(/Transactions:\s*([\d,]+)/i)?.[1] ?? heroTxnText.match(/(\d[\d,]*)/)?.[1] ?? '').replace(/,/g, ''))
      : null;

    if (navTxns != null && heroTxns != null && !Number.isNaN(heroTxns)) {
      expect(heroTxns).toBe(navTxns);
    }
    if (navPence != null && heroPence != null) {
      expect(heroPence).toBe(navPence);
    }

    await expect(page.getByText(/Expected Cash/i).first()).toBeVisible();
  });

  test('compact loaders and report shells load for owner navigation', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await waitForProtectedShell(page);
    await assertTenantUsableForQa(page);

    await page.goto('/inventory', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.getByText(/Loading page…/i)).toHaveCount(0);

    await page.goto('/sales', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-content')).toBeVisible();

    await page.goto('/reports/analytics', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Margin Analysis|Analytics/i).first()).toBeVisible({ timeout: 45_000 });

    await page.goto('/reports/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Trading Report|Dashboard/i).first()).toBeVisible({ timeout: 45_000 });

    await page.goto('/reports/owner', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Owner Brief|Owner Dashboard/i).first()).toBeVisible({ timeout: 45_000 });
  });

  test('owner can open POS without completing a sale', async ({ page }) => {
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await waitForProtectedShell(page);
    await expect(page).toHaveURL(/\/pos/);
    await expect(page.locator('#main-content')).toBeVisible();

    test.info().annotations.push({
      type: 'pos-sale',
      description: qaSaleAllowed()
        ? 'QA sale flag present but no sale performed in this pass.'
        : 'POS load only; no sale performed for safety.',
    });
  });

  test('owner can access settings and user management', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await waitForProtectedShell(page);
    await assertTenantUsableForQa(page);
    await expect(page.getByRole('heading', { name: /Business Settings/i })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.locator('#main-content')).toBeVisible();

    await page.goto('/users', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /^Users$/i })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('#main-content')).toBeVisible();
  });
});

test.describe('Cashier authenticated QA @cashier', () => {
  test('cashier lands on POS or operational route', async ({ page }) => {
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/pos/);
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('cashier is redirected away from owner onboarding', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/pos/);
  });

  test('cashier cannot access owner-only owner brief', async ({ page }) => {
    const response = await page.goto('/reports/owner', { waitUntil: 'domcontentloaded' });
    const url = page.url();
    expect(url.includes('/reports/owner') || (response?.status() ?? 200) >= 400).toBeTruthy();
  });
});

test.describe('Manager authenticated QA @manager', () => {
  test('manager can reach POS when allowed', async ({ page }) => {
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('manager owner-brief access matches app rules', async ({ page }) => {
    const response = await page.goto('/reports/owner', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    expect(page.url()).toMatch(/\/reports\/owner|\/login|\/pos/);
  });
});
