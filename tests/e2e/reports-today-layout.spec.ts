import { test, expect, type Page } from '@playwright/test';

for (const width of [320, 390] as const) {
  test(`More reports accessible name at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/reviews/reports-today-layout?fixture=medium');
    const more = page.getByRole('link', { name: 'More reports' });
    await expect(more).toBeVisible();
    const accessible = await more.evaluate((element) => {
      const node = element as HTMLElement;
      return {
        name: node.getAttribute('aria-label'),
        visible: node.innerText.replace(/\s+/g, ' ').trim(),
      };
    });
    expect(accessible.name).toBe('More reports');
    expect(accessible.visible).toBe('More');
  });
}

test('More reports is the visible desktop label', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/reviews/reports-today-layout?fixture=medium');
  const more = page.getByRole('link', { name: 'More reports' });
  await expect(more).toBeVisible();
  await expect(more).toHaveText('More reports', { useInnerText: true });
});

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

const BANNER_MODES = ['none', 'setup', 'trial', 'both'] as const;

async function box(page: Page, name: string) {
  const locator = page.getByRole('link', { name, exact: name === 'Open Sell' || name === 'Add stock' || name === 'Begin setup' || name === 'View billing' });
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
    };
  });
}

function overlaps(a: { top: number; bottom: number; left: number; right: number }, b: { top: number; bottom: number; left: number; right: number }) {
  return a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
}

for (const width of [320, 390] as const) {
  for (const banner of BANNER_MODES) {
    test(`empty Today composition ${banner} @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/reviews/reports-today-layout?state=empty&banner=${banner}`);
      await expect(page.getByRole('heading', { name: 'No sales yet today' })).toBeVisible();

      const sell = await box(page, 'Open Sell');
      const heading = page.getByRole('heading', { name: 'Other ways to get started' });
      const headingBox = await heading.boundingBox();
      const stock = await box(page, 'Add stock');
      const note = await page.getByText('Nothing is wrong', { exact: false }).boundingBox();
      const card = await page.locator('[data-today-state="empty"] > section[role="status"]').boundingBox();
      expect(headingBox).not.toBeNull();
      expect(note).not.toBeNull();
      expect(card).not.toBeNull();
      expect(note!.y - sell.bottom).toBeLessThanOrEqual(64);
      expect(note!.y - sell.bottom).toBeGreaterThanOrEqual(0);
      expect(headingBox!.y - (card!.y + card!.height)).toBeLessThanOrEqual(64);
      expect(headingBox!.y - (card!.y + card!.height)).toBeGreaterThanOrEqual(0);
      expect(stock.top - (headingBox!.y + headingBox!.height)).toBeLessThanOrEqual(64);
      expect(stock.width).toBeGreaterThanOrEqual(44);
      expect(stock.height).toBeGreaterThanOrEqual(44);
      expect(sell.width).toBeGreaterThanOrEqual(44);
      expect(sell.height).toBeGreaterThanOrEqual(44);

      const names = [
        banner === 'setup' || banner === 'both' ? 'Begin setup' : null,
        banner === 'trial' || banner === 'both' ? 'View billing' : null,
      ].filter((name): name is string => name != null);
      const targets = [];
      for (const name of names) {
        const target = await box(page, name);
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
        targets.push(target);
        for (let i = 0; i < 15; i += 1) {
          const focusedNow = await page.evaluate((label) => {
            const element = document.activeElement;
            return element?.tagName === 'A' && (element.textContent || '').replace(/\s+/g, ' ').trim() === label;
          }, name);
          if (focusedNow) break;
          await page.keyboard.press('Tab');
        }
        const focused = await page.evaluate((label) => {
          const element = document.activeElement as HTMLElement | null;
          if (!element || element.tagName !== 'A' || (element.textContent || '').replace(/\s+/g, ' ').trim() !== label) return null;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            width: rect.width,
            height: rect.height,
            outlineWidth: style.outlineWidth,
            outlineStyle: style.outlineStyle,
          };
        }, name);
        expect(focused).not.toBeNull();
        expect(focused!.width).toBeGreaterThanOrEqual(44);
        expect(focused!.height).toBeGreaterThanOrEqual(44);
        expect(focused!.outlineStyle).not.toBe('none');
        expect(parseFloat(focused!.outlineWidth)).toBeGreaterThan(0);
      }
      if (targets.length === 2) expect(overlaps(targets[0], targets[1])).toBe(false);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(250);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const last = await box(page, 'Stock movements');
      const tab = await page.getByRole('navigation', { name: 'Primary mobile navigation' }).boundingBox();
      expect(tab).not.toBeNull();
      expect(last.bottom).toBeLessThanOrEqual(tab!.y - 16);
      expect(last.top).toBeGreaterThanOrEqual(0);
    });
  }
}
