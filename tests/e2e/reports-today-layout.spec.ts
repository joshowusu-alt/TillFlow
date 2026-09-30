import { test, expect } from '@playwright/test';

const FIXTURES = ['zero', 'medium', 'large', 'negative-large'] as const;
const WIDTHS = [320, 390, 1180, 1440] as const;

for (const width of WIDTHS) {
  test.describe(`Today money composition @ ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const fixture of FIXTURES) {
      test(`fixture ${fixture} stays on one line inside the sales card`, async ({ page }) => {
        await page.goto(`/reviews/reports-today-layout?fixture=${fixture}`);
        const card = page.locator('[data-today-sales-card]');
        await expect(card).toBeVisible();
        const money = page.locator('[data-today-money] [data-financial-amount]');
        await expect(money).toBeVisible();
        const measure = await money.evaluate((element) => {
          const node = element as HTMLElement;
          const style = getComputedStyle(node);
          const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
          return {
            text: node.textContent ?? '',
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
            height: node.getBoundingClientRect().height,
            lineHeight,
            whiteSpace: style.whiteSpace,
            pageScroll: document.documentElement.scrollWidth,
            pageClient: document.documentElement.clientWidth,
          };
        });
        expect(measure.whiteSpace).toBe('nowrap');
        expect(measure.text.length).toBeGreaterThan(0);
        expect(measure.text).not.toMatch(/\n/);
        expect(measure.scrollWidth).toBeLessThanOrEqual(measure.clientWidth + 1);
        expect(measure.height).toBeLessThanOrEqual(measure.lineHeight * 1.35);
        expect(measure.pageScroll).toBeLessThanOrEqual(measure.pageClient + 1);
        if (width >= 1180) {
          const cardBox = await card.boundingBox();
          expect(cardBox?.width ?? 0).toBeGreaterThan(480);
        }
      });
    }
  });
}
