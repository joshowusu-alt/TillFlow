import { expect, type Page } from '@playwright/test';

type OverflowOffender = {
  tag: string;
  className: string;
  left: number;
  right: number;
  width: number;
};

export async function expectNoHorizontalOverflow(page: Page, tolerance = 2) {
  const metrics = await page.evaluate((tol) => {
    const width = window.innerWidth;
    const offenders: OverflowOffender[] = [];
    const nodes = document.body.querySelectorAll<HTMLElement>('*');
    for (const el of nodes) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.right <= width + tol && rect.left >= -tol) continue;
      let parent = el.parentElement;
      let insideFittingScrollport = false;
      while (parent) {
        const parentStyle = getComputedStyle(parent);
        const overflowX = parentStyle.overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') {
          const parentRect = parent.getBoundingClientRect();
          if (parentRect.left >= -tol && parentRect.right <= width + tol) {
            insideFittingScrollport = true;
            break;
          }
        }
        parent = parent.parentElement;
      }
      if (insideFittingScrollport) continue;
      offenders.push({
        tag: el.tagName,
        className: String(el.className || '').slice(0, 180),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      });
      if (offenders.length >= 8) break;
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: width,
      bodyScrollWidth: document.body.scrollWidth,
      offenders,
    };
  }, tolerance);

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + tolerance);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth + tolerance);
  expect(metrics.offenders, `elements wider than the viewport: ${JSON.stringify(metrics.offenders)}`).toEqual([]);
}

export async function focusFirstSearchInput(page: Page) {
  const search = page.locator('input[type="search"]').first();
  if ((await search.count()) === 0) return false;
  await search.click();
  await search.fill('a');
  await page.waitForTimeout(300);
  return true;
}
