import axe from 'axe-core';
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
          const blocks = await page.locator('[data-metric-block]').evaluateAll((nodes) => nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return { top: rect.top, width: rect.width };
          }));
          expect(blocks).toHaveLength(3);
          expect(Math.abs(blocks[0].top - blocks[1].top)).toBeLessThan(2);
          expect(Math.abs(blocks[1].top - blocks[2].top)).toBeLessThan(2);
          expect(blocks[0].width).toBeGreaterThan(240);
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

type FocusBox = {
  name: string;
  tag: string;
  top: number;
  bottom: number;
  barTop: number | null;
  inBar: boolean;
  outline: string;
  scrollMarginBottom: string;
};

async function focusedBox(page: Page): Promise<FocusBox | null> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body) return null;
    const rect = element.getBoundingClientRect();
    const bar = document.querySelector('nav[aria-label="Primary mobile navigation"]');
    const barRect = bar?.getBoundingClientRect() ?? null;
    const style = getComputedStyle(element);
    return {
      name: (element.getAttribute('aria-label') || element.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      tag: element.tagName,
      top: rect.top,
      bottom: rect.bottom,
      barTop: barRect ? barRect.top : null,
      inBar: Boolean(element.closest('nav[aria-label="Primary mobile navigation"]')),
      outline: style.outlineStyle,
      scrollMarginBottom: style.scrollMarginBottom,
    };
  });
}

async function assertCustomerFocusClearsBar(page: Page, path: string, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto(path);
  const seen: string[] = [];
  for (let step = 0; step < 28; step += 1) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(350);
    const box = await focusedBox(page);
    if (!box || box.inBar) continue;
    seen.push(box.name);
    expect(box.barTop, box.name).not.toBeNull();
    expect(box.bottom, `${box.name} bottom ${box.bottom} bar ${box.barTop}`).toBeLessThanOrEqual((box.barTop ?? 0) - 16);
    expect(box.top, box.name).toBeGreaterThanOrEqual(0);
    expect(box.outline, box.name).not.toBe('none');
  }
  expect(seen.length).toBeGreaterThan(0);
  return seen;
}

const FOCUS_CASES = [
  { state: 'attention', expectName: /cash|momo|customer|supplier/i },
  { state: 'activity', expectName: /^Trading/ },
  { state: 'more', expectName: /^Income statement/ },
  { state: 'failed', expectName: /^Retry$/ },
  { state: 'empty&banner=none', expectName: /^Open Sell$|^How Today is calculated$/ },
  { state: 'return&destination=trading', expectName: /Back to Activity/ },
  { state: 'return&destination=income', expectName: /Back to More reports/ },
] as const;

for (const width of [320, 390] as const) {
  for (const focusCase of FOCUS_CASES) {
    test(`native tab keeps ${focusCase.state} above the mobile bar at ${width}px`, async ({ page }) => {
      const seen = await assertCustomerFocusClearsBar(
        page,
        `/reviews/reports-today-layout?state=${focusCase.state}`,
        width,
      );
      expect(seen.some((name) => focusCase.expectName.test(name))).toBe(true);
    });
  }
}

test('desktop reports focus does not add mobile scroll margin or another bar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/reviews/reports-today-layout?state=attention');
  let box: FocusBox | null = null;
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab');
    box = await focusedBox(page);
    if (box && !box.inBar) break;
  }
  expect(box).not.toBeNull();
  expect(box?.scrollMarginBottom === '0px' || box?.scrollMarginBottom === 'auto').toBe(true);
  const visibleFixed = await page.evaluate(() => (
    [...document.querySelectorAll('nav.fixed')].filter((element) => getComputedStyle(element).display !== 'none').length
  ));
  expect(visibleFixed).toBe(0);
});

test('calculation disclosure opens and closes from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reviews/reports-today-layout?state=empty&banner=none');
  const help = page.getByRole('button', { name: 'How Today is calculated' });
  for (let step = 0; step < 12; step += 1) {
    if (await help.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(help).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await expect(help).toBeFocused();
  await expect(page.getByText('Dates are the business local date')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(help).toBeFocused();
  await page.keyboard.press(' ');
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await expect(help).toBeFocused();
});

test('pointer click on the calculation disclosure does not jump the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reviews/reports-today-layout?state=empty&banner=none');
  await page.evaluate(() => window.scrollTo(0, 0));
  const before = await page.evaluate(() => window.scrollY);
  const help = page.getByRole('button', { name: 'How Today is calculated' });
  await help.click();
  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await help.click();
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(help).toBeFocused();
});

test('Choose a branch focuses the visible working-location control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reviews/reports-today-layout?state=no-branch');
  await expect(page.getByRole('link', { name: 'Back to Today' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose a branch' }).click();
  const focused = await page.evaluate(() => {
    const element = document.activeElement;
    return {
      tag: element?.tagName ?? null,
      label: element instanceof HTMLElement ? element.getAttribute('aria-label') : null,
    };
  });
  expect(focused).toEqual({ tag: 'SELECT', label: 'Working location' });
});

test('setup banner leaves the three Today metrics 16px above the bar at 320x640', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/reviews/reports-today-layout?state=clearance&banner=setup');
  const bar = await page.getByRole('navigation', { name: 'Primary mobile navigation' }).boundingBox();
  expect(bar).not.toBeNull();
  const metrics = await page.locator('[data-metric-block]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { name: node.getAttribute('data-metric-block'), top: rect.top, bottom: rect.bottom };
  }));
  expect(metrics.map((metric) => metric.name)).toEqual(['sales', 'money', 'cash']);
  for (const metric of metrics) {
    expect(metric.bottom, metric.name ?? 'metric').toBeLessThanOrEqual((bar?.y ?? 0) - 16);
  }
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

for (const width of [390, 1440] as const) {
  test(`reports section contrast at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/reviews/reports-today-layout?fixture=medium');
    const more = page.getByRole('link', { name: 'More reports' });
    if (width < 640) await expect(more).toHaveText('More', { useInnerText: true });
    else await expect(more).toHaveText('More reports', { useInnerText: true });
    await expect(more).toHaveAttribute('aria-label', 'More reports');
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const root = document.querySelector('[aria-label="Reports sections"]') ?? document.body;
      const axeRunner = (window as unknown as { axe: { run: (node: Element, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }> } }).axe;
      const results = await axeRunner.run(root, { runOnly: { type: 'rule', values: ['color-contrast'] } });
      return results.violations;
    });
    expect(violations).toEqual([]);
  });
}
