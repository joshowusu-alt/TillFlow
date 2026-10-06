import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';
import path from 'node:path';

async function open(page: Page, screen: string, fixture = 'normal') {
  await page.bringToFront();
  await page.goto(`/reviews/reports-today-layout?state=stage3b-${screen}&fixture=${fixture}`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-stage3b-review]')).toBeVisible();
}

for (const width of [320,390,768,1440]) {
  test(`customer credits do not cancel another account's debt at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, 'trading', 'credit');
    await expect(page.locator('[data-stage3b-metric]').filter({ hasText: 'What customers owe overall' })).toContainText('GH₵7,500.00');
    await expect(page.locator('[data-stage3b-metric]').filter({ hasText: 'Customer credit balances' })).toContainText('GH₵9,000.00');
    await expect(page.getByText('−GH₵1,500.00', { exact: true })).toBeVisible();
    await expect(page.getByText('Excess confirmed payments on unlinked sales', { exact: true })).toBeVisible();
    const amounts = await page.locator('[data-stage3b-review] [data-financial-amount]:visible').evaluateAll(nodes => nodes.map(el => ({ font: parseFloat(getComputedStyle(el).fontSize), right: el.getBoundingClientRect().right, parentRight: el.closest('.financial-fit')!.getBoundingClientRect().right })));
    for (const amount of amounts) { expect(amount.font).toBeGreaterThanOrEqual(16); expect(amount.right).toBeLessThanOrEqual(amount.parentRight + 1); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test(`customer debt is separate from unlinked sales at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, 'trading', 'debt');
    const headline = page.locator('[data-stage3b-metric]').filter({ hasText: 'What customers owe overall' });
    await expect(headline).toContainText('GH₵648.50');
    await expect(headline).not.toContainText('GH₵19,417.50');
    const unlinked = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Sale balances without a customer account' }) });
    await expect(unlinked).toContainText('GH₵18,769.00');
    await expect(unlinked).toContainText('excluded from customer debt and ageing');
    await unlinked.scrollIntoViewIfNeeded();
    const figures = await unlinked.locator('[data-financial-amount]').evaluateAll(nodes => nodes.map(el => ({ font: parseFloat(getComputedStyle(el).fontSize), right: el.getBoundingClientRect().right, parentRight: el.closest('.financial-fit')!.getBoundingClientRect().right })));
    for (const figure of figures) { expect(figure.font).toBeGreaterThanOrEqual(16); expect(figure.right).toBeLessThanOrEqual(figure.parentRight + 1); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (process.env.REPORTS_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.REPORTS_SCREENSHOT_DIR, `customer-debt-${width}.png`), fullPage: true });
  });
}

for (const width of [320,390,768,1024,1440,1920,2560]) {
  for (const screen of ['trading','analytics','movement']) {
    for (const fixture of ['normal','large']) {
      test(`${screen} ${fixture}: complete readable figures and compact header at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
        await open(page, screen, fixture);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.getByRole('navigation', { name: 'Reports location' })).toHaveCount(1);
        const geometry = await page.locator('[data-report-header-actions]').evaluate(el => {
          const box = el.getBoundingClientRect(); return { height: box.height, width: box.width };
        });
        expect(geometry.height).toBeLessThanOrEqual(48);
        await expect(page.locator('[data-stage3b-hero] [data-financial-amount]')).toHaveCSS('color', 'rgb(255, 255, 255)');
        const money = await page.locator('[data-stage3b-review] [data-financial-amount]:visible').evaluateAll(nodes => nodes.map(el => {
          const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
          const parent = el.closest('.financial-fit') ?? el.parentElement!;
          const inner = parent.getBoundingClientRect();
          return { text: el.textContent, font: parseFloat(style.fontSize), height: rect.height, lineHeight: parseFloat(style.lineHeight), left: rect.left, right: rect.right, parentLeft: inner.left, parentRight: inner.right, whiteSpace: style.whiteSpace };
        }));
        expect(money.length).toBeGreaterThan(1);
        for (const amount of money) {
          expect(amount.font, amount.text ?? '').toBeGreaterThanOrEqual(16);
          expect(amount.whiteSpace).toBe('nowrap');
          expect(amount.left).toBeGreaterThanOrEqual(amount.parentLeft - 1);
          expect(amount.right, amount.text ?? '').toBeLessThanOrEqual(amount.parentRight + 1);
          expect(amount.height).toBeLessThanOrEqual(amount.lineHeight * 1.2);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        if (fixture === 'normal' && [390,768,1440].includes(width) && process.env.REPORTS_SCREENSHOT_DIR) {
          await page.screenshot({ path: path.join(process.env.REPORTS_SCREENSHOT_DIR, `${screen}-${width}.png`) });
          await page.screenshot({ path: path.join(process.env.REPORTS_SCREENSHOT_DIR, `${screen}-${width}-full.png`), fullPage: true });
        }
      });
    }
  }
}

for (const width of [320,390]) for (const screen of ['trading','analytics']) {
  test(`${screen} negative figures remain complete at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await open(page,screen,'negative');
    await expect(page.getByText('−GH₵12,345,678.90', { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const amount = page.getByText('−GH₵12,345,678.90', { exact: true }).first();
    expect(await amount.evaluate(el => el.getBoundingClientRect().right <= el.closest('.financial-fit')!.getBoundingClientRect().right + 1)).toBe(true);
  });
}

for (const width of [320,390,768,1440]) for (const screen of ['trading','analytics','movement']) {
  test(`${screen} meets automated WCAG checks and has reachable focus at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 }); await open(page,screen);
    await page.addScriptTag({ content: axe.source });
    const results = await page.evaluate(async () => (window as unknown as { axe: typeof axe }).axe.run('[data-stage3b-review]', { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
    expect(results.violations).toEqual([]);
    let checked = 0;
    const names = new Set<string>();
    for (let index = 0; index < 32; index++) {
      await page.keyboard.press('Tab');
      await expect.poll(async () => page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        if (!el?.closest('[data-stage3b-review]')) return { clear: true };
        const rect = el.getBoundingClientRect();
        const bar = document.querySelector('.mobile-bottom-tab-bar')?.getBoundingClientRect();
        return { clear: rect.top >= 0 && rect.bottom <= (bar?.height ? bar.top - 16 : innerHeight), name: el.innerText, top: rect.top, bottom: rect.bottom };
      }), { timeout: 5000, message: 'Native keyboard focus should settle fully above the fixed bar' }).toEqual(expect.objectContaining({ clear: true }));
      const focus = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        if (!el?.closest('[data-stage3b-review]')) return null;
        const rect = el.getBoundingClientRect();
        const bar = document.querySelector('.mobile-bottom-tab-bar')?.getBoundingClientRect();
        return { name: el.innerText, top: rect.top, bottom: rect.bottom, bar: bar?.height ? bar.top : innerHeight, outline: getComputedStyle(el).outlineStyle };
      });
      if (focus) { checked++; names.add(focus.name); expect(focus.top).toBeGreaterThanOrEqual(0); expect(focus.bottom).toBeLessThanOrEqual(focus.bar - (width < 1024 ? 16 : 0)); expect(focus.outline).toBe('solid'); }
    }
    expect(checked).toBeGreaterThan(3);
    if (screen === 'trading') expect(names.has('Receipt origins')).toBe(true);
    if (screen === 'movement') expect([...names].some(name => name.includes('All product figures'))).toBe(true);
  });
}

for (const width of [390,1440]) {
  test(`Trading pointer disclosure does not trigger keyboard correction at ${width}`, async ({page}) => {
    await page.setViewportSize({width,height:844}); await open(page,'trading');
    const summary=page.getByText('Receipt origins',{exact:true});
    await summary.scrollIntoViewIfNeeded();
    const before=await page.evaluate(()=>scrollY);
    await summary.click();
    await expect(summary.locator('..')).toHaveAttribute('open','');
    expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Space');
    await expect(summary.locator('..')).not.toHaveAttribute('open','');
    await expect(summary).toBeFocused();
  });
}

for (const width of [390,1440]) {
  test(`Movement actions and exact filters remain keyboard usable at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await open(page,'movement');
    const summary = page.locator('[data-stage3b-actions] > summary');
    await summary.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: 'Open money received' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open money received' })).toHaveAttribute('href', /from=2026-09-01&to=2026-09-30&storeId=sample-branch/);
    await page.route('**/exports/business-movement**', route => route.fulfill({ contentType: 'text/csv', headers: { 'content-disposition': 'attachment; filename="movement.csv"' }, body: 'fixture\n' }));
    const exportRequest = page.waitForRequest(request => request.url().includes('/exports/business-movement'));
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    expect((await exportRequest).url()).toContain('preset=last_full_calendar_month&storeId=sample-branch');
    await summary.focus();
    await page.keyboard.press('Enter');
    const filter = page.getByText('Change period or branch', { exact: true });
    await filter.focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('Period', { exact: true })).toBeVisible();
    await expect(page.getByLabel('From', { exact: true })).toHaveValue('2026-09-01');
    await expect(page.getByLabel('Branch', { exact: true })).toHaveValue('sample-branch');
    const all = page.locator('summary').filter({ hasText: 'All product figures' }); await all.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: 'Sample rice 5kg', exact: true }).last()).toBeVisible();
  });

  test(`Analytics exact bars and sale-count selectors work at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await open(page,'analytics');
    const bar = page.getByRole('button', { name: 'Mon 28: GH₵1,200.00', exact: true });
    await bar.focus(); await page.keyboard.press('Enter'); await expect(bar).toHaveAttribute('aria-pressed','true');
    await page.getByLabel('Day', { exact: true }).selectOption('Sat'); await page.getByLabel('Hour', { exact: true }).selectOption('10');
    await expect(page.getByText('Sat 10:00–11:00 · 20 sales')).toBeVisible();
    await page.getByText('Sales by hour and day — view figures', { exact: true }).click();
    await expect(page.getByRole('columnheader', { name: 'Sales count', exact: true })).toBeVisible();
  });

  test(`Empty and incomplete Analytics do not invent growth or profit at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await open(page,'analytics','empty');
    await expect(page.getByText('No comparison base', { exact: true })).toBeVisible();
    await expect(page.getByText('+0.0%', { exact: true })).toHaveCount(0);
    await open(page,'analytics','incomplete');
    await expect(page.getByText('Costs incomplete', { exact: true })).toHaveCount(2);
  });

  test(`Movement failed payment layer withholds metrics at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await open(page,'movement','failed');
    await expect(page.locator('[data-stage3b-review]').getByRole('alert')).toContainText('Payment figures could not be loaded');
    await expect(page.locator('[data-stage3b-metric] [data-financial-amount]')).toHaveCount(0);
  });
}
