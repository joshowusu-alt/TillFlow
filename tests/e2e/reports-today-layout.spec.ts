import axe from 'axe-core';
import { test, expect, type Page } from '@playwright/test';

// Measurements must follow hydration, font loading and the initial resume refresh.
async function reviewPage(page: Page, path: string) {
  await page.bringToFront();
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await document.fonts.ready; });
}

for (const width of [320, 390] as const) {
  test(`More reports accessible name at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await reviewPage(page, '/reviews/reports-today-layout?fixture=medium');
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
  await reviewPage(page, '/reviews/reports-today-layout?fixture=medium');
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
        await reviewPage(page, `/reviews/reports-today-layout?fixture=${fixture}`);
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
        const metricAmounts = await page.locator('[data-metric-block] [data-financial-amount]').evaluateAll(nodes => nodes.map(node => ({
          font: parseFloat(getComputedStyle(node).fontSize), width: node.clientWidth, scroll: node.scrollWidth,
        })));
        for (const amount of metricAmounts) {
          expect(amount.font).toBeGreaterThanOrEqual(16);
          expect(amount.scroll).toBeLessThanOrEqual(amount.width + 1);
        }
        await page.getByText('View daily sales figures', { exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

        if (width >= 1180) {
          const blocks = await page.locator('[data-metric-block]').evaluateAll((nodes) => nodes.map((node) => {
            const rect = node.getBoundingClientRect();
            return { top: rect.top, width: rect.width };
          }));
          expect(blocks).toHaveLength(3);
          expect(blocks[1].top).toBeGreaterThan(blocks[0].top);
          expect(Math.abs(blocks[1].top - blocks[2].top)).toBeLessThan(2);
          expect(blocks[0].width).toBeGreaterThan(480);
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
      await reviewPage(page, `/reviews/reports-today-layout?state=empty&banner=${banner}`);
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
  await reviewPage(page, path);
  const seen: string[] = [];
  for (let step = 0; step < 28; step += 1) {
    await page.keyboard.press('Tab');
    await expect.poll(async () => {
      const current = await focusedBox(page);
      return !current || current.inBar || (current.top >= 0 && current.bottom <= (current.barTop ?? 0) - 16);
    }, { timeout: 5000, message: 'Native focus scroll must settle above the bar' }).toBe(true);
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
  await reviewPage(page, '/reviews/reports-today-layout?state=attention');
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
  await reviewPage(page, '/reviews/reports-today-layout?state=empty&banner=none');
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
  await reviewPage(page, '/reviews/reports-today-layout?state=empty&banner=none');
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
  await reviewPage(page, '/reviews/reports-today-layout?state=no-branch');
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

test('short phone shows the sales hero and can scroll to supporting metrics', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await reviewPage(page, '/reviews/reports-today-layout?state=clearance&banner=setup');
  const action = page.locator('[data-today-primary-action]');
  await expect(action).toBeVisible();
  await action.focus();
  const bar = await page.getByRole('navigation', { name: 'Primary mobile navigation' }).boundingBox();
  await expect.poll(async () => {
    const actionBox = await action.boundingBox();
    return actionBox!.y + actionBox!.height;
  }).toBeLessThanOrEqual(bar!.y - 16);
  for (const name of ['money', 'cash']) {
    const metric = page.locator(`[data-metric-block="${name}"]`);
    await metric.scrollIntoViewIfNeeded();
    await expect(metric).toBeVisible();
    const amount = metric.locator('[data-financial-amount]');
    const size = await amount.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, font: parseFloat(getComputedStyle(el).fontSize) }));
    expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
    expect(size.font).toBeGreaterThanOrEqual(16);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

for (const width of [390, 1440] as const) {
  test(`reports section contrast at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await reviewPage(page, '/reviews/reports-today-layout?fixture=medium');
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

// Live-review regressions: use actual Analytics and Business Movement amount components.
for (const width of [320, 390, 768, 1024, 1440] as const) {
  for (const state of ['analytics-values', 'movement-values']) {
    test(`${state} readable complete amounts @ ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await reviewPage(page, `/reviews/reports-today-layout?state=${state}`);
      const amounts = page.locator('[data-financial-amount]');
      await expect(amounts.first()).toBeVisible();
      const measures = await amounts.evaluateAll(nodes => nodes.map(element => {
        const node = element as HTMLElement;
        const style = getComputedStyle(node);
        return { font: parseFloat(style.fontSize), width: node.clientWidth, scroll: node.scrollWidth, whiteSpace: style.whiteSpace };
      }));
      for (const measure of measures) {
        expect(measure.font).toBeGreaterThanOrEqual(16);
        expect(measure.whiteSpace).toBe('nowrap');
        expect(measure.scroll).toBeLessThanOrEqual(measure.width + 1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (width === 320 || width === 1440) {
        const screenshot = testInfo.outputPath('report.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        await testInfo.attach(`${state}-${width}`, { path: screenshot, contentType: 'image/png' });
      }
      if (state === 'analytics-values') {
        await page.getByText('Sales by hour and day — view figures', { exact: true }).click();
        await expect(page.getByRole('table', { name: 'Sales by hour and day' })).toContainText('Sales count');
        await expect(page.getByRole('table', { name: 'Sales by hour and day' })).toContainText('4');
      }
    });
  }
  test(`Trading closed filter is visible and keyboard opens @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await reviewPage(page, '/reviews/reports-today-layout?state=trading-filters');
    const summary = page.locator('.reports-filter-disclosure > summary');
    await expect(summary).toHaveAccessibleName('Adjust date range / branch');
    await expect(summary).toBeVisible();
    await expect(page.getByLabel('From', { exact: true })).toBeHidden();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('From', { exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('From', { exact: true })).toBeHidden();
  });
}

for (const width of [320, 390, 768, 1024, 1440, 1920, 2560]) {
  test(`Option 2 hierarchy, chart and financial states @ ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await reviewPage(page, '/reviews/reports-today-layout?fixture=medium');
    const active = page.getByRole('link', { name: 'Today', exact: true });
    await expect(active).toHaveAttribute('aria-current', 'page');
    expect(await active.evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    for (const name of ['Refresh', 'How Today is calculated']) {
      const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    const hero = page.locator('[data-today-sales-card]');
    expect(await hero.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
    const heroAmount = hero.locator('[data-financial-amount]').first();
    expect(await heroAmount.evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    await expect(page.getByText('sales so far today', { exact: false }).first()).toBeVisible();
    await expect(page.locator('[data-week-chart]')).toBeVisible();
    await page.getByText('View daily sales figures', { exact: true }).click();
    const table = page.getByRole('table', { name: 'Daily sales over the last seven days' });
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(7);
    await expect(table).toContainText('GH₵8,854.50');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByText('View daily sales figures', { exact: true }).click();
    if (width >= 1024) {
      const heroBox = await hero.boundingBox();
      const attention = await page.locator('[data-today-attention]').boundingBox();
      expect(attention!.x).toBeGreaterThan(heroBox!.x + heroBox!.width);
      expect(Math.abs(heroBox!.y - attention!.y)).toBeLessThan(2);
    }
    await page.screenshot({ path: testInfo.outputPath(`today-option2-${width}.png`), fullPage: true });
    await reviewPage(page, '/reviews/reports-today-layout?state=partial');
    await expect(page.getByText('No confirmed payments today', { exact: true })).toBeVisible();
    await expect(page.getByText('No till closed today', { exact: true })).toBeVisible();
    await expect(page.locator('[data-profit-state="incomplete"]')).toBeVisible();
    await expect(page.locator('[data-payment-mix-bar]')).toHaveCount(0);
    await reviewPage(page, '/reviews/reports-today-layout?state=failed');
    await expect(page.locator('.reports-today-surface').getByRole('alert')).toContainText('Today could not be loaded');
    await expect(page.locator('[data-financial-amount]')).toHaveCount(0);
    await reviewPage(page, '/reviews/reports-today-layout?state=restricted');
    await expect(page.locator('.reports-today-surface').getByRole('status')).toContainText('Read-only');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

for (const width of [320, 390, 1440]) {
  test(`Option 2 full content accessibility @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const state of ['attention', 'empty', 'partial', 'failed', 'no-branch']) {
      await reviewPage(page, `/reviews/reports-today-layout?state=${state}`);
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(async () => {
        const runner = (window as unknown as { axe: { run: (node: Element, options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
        return (await runner.run(document.querySelector('.reports-today-surface')!, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations;
      });
      expect(violations, state).toEqual([]);
      if (state === 'attention') await expect(page.locator('[data-today-attention] li')).toHaveCount(5);
    }
  });
}

for (const width of [320, 390, 768, 1024, 1440, 1920, 2560]) {
  for (const screen of ['cash', 'movement'] as const) {
    test(`Owner correction ${screen}: readable header and complete amounts @ ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await reviewPage(page, `/reviews/reports-today-layout?state=owner-${screen}&fixture=large`);
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText(screen === 'cash' ? 'Cash drawer' : 'Business movement');
      const headerMeasure = await heading.evaluate(element => {
        const title = element.getBoundingClientRect();
        const actions = element.closest('header')!.querySelector('[data-report-header-actions]')!.getBoundingClientRect();
        return { overlapX: Math.min(title.right, actions.right) - Math.max(title.left, actions.left), overlapY: Math.min(title.bottom, actions.bottom) - Math.max(title.top, actions.top) };
      });
      expect(headerMeasure.overlapX <= 1 || headerMeasure.overlapY <= 1).toBe(true);
      const amounts = await page.locator('[data-financial-amount]:visible').evaluateAll(elements => elements.map(element => {
        const node = element as HTMLElement;
        return { font: parseFloat(getComputedStyle(node).fontSize), scroll: node.scrollWidth, client: node.clientWidth, text: node.innerText };
      }));
      expect(amounts.length).toBeGreaterThan(1);
      for (const amount of amounts) {
        expect(amount.font).toBeGreaterThanOrEqual(16);
        expect(amount.scroll).toBeLessThanOrEqual(amount.client + 1);
        expect(amount.text).not.toContain('…');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
}

test('Business movement supporting evidence is disclosed with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await reviewPage(page, '/reviews/reports-today-layout?state=owner-movement');
  const disclosure = page.locator('[data-movement-insight] summary').first();
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure.locator('..')).toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(disclosure.locator('..')).not.toHaveAttribute('open', '');
  await expect(page.getByText('Strong signal', { exact: false })).toHaveCount(0);
  await expect(page.getByText('not an error', { exact: false })).toHaveCount(0);
});

test('Activity does not reserve a desktop column for one queue', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await reviewPage(page, '/reviews/reports-today-layout?state=activity');
  const reports = await page.locator('a[href^="/reports/dashboard"]').boundingBox();
  const queue = await page.locator('a[href^="/reports/momo-confirmation"]').boundingBox();
  const ledger = await page.locator('a[href^="/reports/cash-drawer"]').boundingBox();
  expect(reports && queue && ledger).toBeTruthy();
  expect(Math.abs(reports!.x - queue!.x)).toBeLessThan(2);
  expect(ledger!.x).toBeGreaterThan(reports!.x + reports!.width);
});

for (const width of [390, 1440]) {
  test(`Owner movement accessibility @ ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await reviewPage(page, '/reviews/reports-today-layout?state=owner-movement');
    await page.evaluate(axe.source);
    const results = await page.evaluate(async () => (window as any).axe.run('[data-owner-correction-review]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    expect(results.violations).toEqual([]);
  });
}
