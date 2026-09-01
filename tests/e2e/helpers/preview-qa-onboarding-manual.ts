import { expect, type Page } from '@playwright/test';
import {
  ONBOARDING_ADD_PRODUCT_MANUALLY_NAME,
  ONBOARDING_ADD_PRODUCT_MANUALLY_TESTID,
  PRODUCT_CREATE_FAULTY_DETAIL_PATH,
  PRODUCT_CREATE_HREF,
  PRODUCT_CREATE_PATHNAME,
  PRODUCT_NOT_FOUND_COPY,
  isExactProductCreateDestination,
  isFaultyProductCreateDetailPath,
  parseAppUrl,
} from '../../../lib/products/product-create-href';
import { PreviewQaOwnerBlockedError } from './preview-qa-owner';
import { clickUniqueVisible, RELIABILITY_NAVIGATION_TIMEOUT_MS } from './preview-qa-locators';
import { proveProductCreateHashOpenedForm } from './preview-qa-manual-entry';

function blocked(detail: string): never {
  throw new Error(`Onboarding manual gate blocked: ${detail}`);
}

export function assertExactProductCreateUrl(url: string) {
  if (isFaultyProductCreateDetailPath(url)) {
    blocked(
      `landed on ${PRODUCT_CREATE_FAULTY_DETAIL_PATH} (product-detail id lookup). Expected ${PRODUCT_CREATE_HREF}.`,
    );
  }
  if (!isExactProductCreateDestination(url)) {
    const parsed = parseAppUrl(url);
    blocked(
      `pathname=${parsed.pathname} hash=${parsed.hash || '(none)'}. Expected pathname ${PRODUCT_CREATE_PATHNAME} and hash #product-create.`,
    );
  }
}

export async function requireOnboardingAddProductManually(page: Page) {
  await page.goto('/onboarding', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  const control = page.getByTestId(ONBOARDING_ADD_PRODUCT_MANUALLY_TESTID);
  const named = page.getByRole('link', { name: ONBOARDING_ADD_PRODUCT_MANUALLY_NAME, exact: true });
  const visibleNamed = await named.locator('visible=true').count();
  const visibleTestId = await control.locator('visible=true').count();
  if (visibleNamed !== 1 || visibleTestId !== 1) {
    throw new PreviewQaOwnerBlockedError(
      'Blocked at onboarding: “Add a product manually” is not uniquely visible. Step 2 is not current. Direct /products#product-create is not valid evidence.',
      { stage: 'identity' },
    );
  }
  const href = (await control.getAttribute('href')) ?? '';
  assertExactProductCreateUrl(href);
  return control;
}

export async function clickOnboardingAddProductManually(page: Page) {
  const control = await requireOnboardingAddProductManually(page);
  await clickUniqueVisible(control, 'onboarding Add a product manually');
  await expect(page).toHaveURL((url) => isExactProductCreateDestination(url.href), {
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  assertExactProductCreateUrl(page.url());
  await expectNoProductNotFound(page);
  await proveProductCreateHashOpenedForm(page);
  await expectNoProductNotFound(page);
}

export async function expectNoProductNotFound(page: Page) {
  await expect(page.getByText(PRODUCT_NOT_FOUND_COPY, { exact: true })).toHaveCount(0);
}

export async function proveDirectProductCreateHashSeparately(page: Page) {
  await page.goto(PRODUCT_CREATE_HREF, {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  assertExactProductCreateUrl(page.url());
  await proveProductCreateHashOpenedForm(page);
  await expectNoProductNotFound(page);
}

export async function proveEstablishedBusinessAddProduct(page: Page) {
  await page.goto(PRODUCT_CREATE_PATHNAME, {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  const addProduct = page.getByRole('link', { name: 'Add product', exact: true });
  await clickUniqueVisible(addProduct, 'established-business Add product');
  await expect(page).toHaveURL((url) => isExactProductCreateDestination(url.href), {
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  assertExactProductCreateUrl(page.url());
  await proveProductCreateHashOpenedForm(page);
  await expectNoProductNotFound(page);
}

export async function emulateStandaloneDisplayMode(page: Page) {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      if (query.includes('display-mode: standalone')) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
        } as MediaQueryList;
      }
      return original(query);
    }) as typeof window.matchMedia;
  });
}
