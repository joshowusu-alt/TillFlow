/**
 * Phase 9 locators: exactly one visible actionable target.
 * Hidden responsive copies (lg:hidden cards vs md/lg tables) must fail in
 * seconds, never inherit test.setTimeout(480_000) via timeout: 0 / .first().
 */
import { expect, type Locator, type Page } from '@playwright/test';

export const RELIABILITY_ACTION_TIMEOUT_MS = 8_000;
export const RELIABILITY_NAVIGATION_TIMEOUT_MS = 15_000;

export function visibleOnly(locator: Locator): Locator {
  return locator.locator('visible=true');
}

export async function requireExactlyOneVisible(
  locator: Locator,
  step: string,
  timeout = RELIABILITY_ACTION_TIMEOUT_MS,
): Promise<Locator> {
  const visible = visibleOnly(locator);
  const deadline = Date.now() + timeout;
  let visibleCount = 0;
  let totalCount = 0;
  while (Date.now() < deadline) {
    totalCount = await locator.count();
    visibleCount = await visible.count();
    if (visibleCount === 1) return visible;
    if (visibleCount > 1) {
      throw new Error(
        `Phase 9 blocked at ${step}: ${visibleCount} visible targets (total=${totalCount}). Genuine duplicates — do not pick .first().`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Phase 9 blocked at ${step}: expected exactly one visible target, found visible=${visibleCount} total=${totalCount}. Hidden responsive copies are not actionable.`,
  );
}

export async function clickUniqueVisible(locator: Locator, step: string) {
  const target = await requireExactlyOneVisible(locator, step);
  await target.click({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  return target;
}

export async function fillUniqueVisible(locator: Locator, value: string, step: string) {
  const target = await requireExactlyOneVisible(locator, step);
  await target.fill(value, { timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  return target;
}

export async function selectUniqueVisible(
  locator: Locator,
  value: string | { label: string } | { value: string },
  step: string,
) {
  const target = await requireExactlyOneVisible(locator, step);
  await target.selectOption(value, { timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  return target;
}

/** Product/unit combobox that contains an exact option, ignoring hidden copies. */
export function comboboxWithOption(page: Page, optionName: string) {
  return page.getByRole('combobox').filter({
    has: page.getByRole('option', { name: optionName, exact: true }),
  });
}

export function till3OpenSelect(page: Page) {
  return page.locator('select').filter({
    has: page.locator('option', { hasText: /^Till 3$/ }),
  });
}

export function classifyResponsiveHit(input: {
  hiddenCopy: boolean;
  visibleCopy: boolean;
  usedFirst: boolean;
}): 'hidden-first-hang' | 'unique-visible' | 'duplicate-visible' {
  if (input.hiddenCopy && input.visibleCopy && input.usedFirst) return 'hidden-first-hang';
  if (input.hiddenCopy && input.visibleCopy && !input.usedFirst) return 'unique-visible';
  if (!input.hiddenCopy && input.visibleCopy && !input.usedFirst) return 'unique-visible';
  return 'duplicate-visible';
}
