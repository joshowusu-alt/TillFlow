import { test, expect } from '@playwright/test';

const FIXTURES = ['zero', 'medium', 'large', 'negative-large'] as const;
const WIDTHS = [320, 390] as const;

for (const width of WIDTHS) {
  test.describe(`Reports money layout @ ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const fixture of FIXTURES) {
      test(`fixture ${fixture} fits without horizontal overflow`, async ({ page }) => {
        await page.goto('/reviews/reports-money-layout');
        const frame = page.locator(`[data-money-fixture="${fixture}"]`);
        await expect(frame).toBeVisible();
        const overflow = await frame.evaluate((element) => {
          const amount = element.querySelector('[data-financial-amount]') as HTMLElement | null;
          if (!amount) return { ok: false, reason: 'missing amount' };
          return {
            ok: amount.scrollWidth <= element.clientWidth + 1,
            amountSw: amount.scrollWidth,
            frameCw: element.clientWidth,
            text: amount.textContent,
          };
        });
        expect(overflow.ok, JSON.stringify(overflow)).toBe(true);
        expect(overflow.text?.length ?? 0).toBeGreaterThan(0);
      });
    }
  });
}
