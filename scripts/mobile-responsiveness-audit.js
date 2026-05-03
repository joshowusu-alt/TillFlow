const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const { randomBytes } = require('crypto');

const RAW_BASE_URL = process.env.BASE_URL || 'http://localhost:6200';
const BASE_URL = (() => {
  try {
    const url = new URL(RAW_BASE_URL);
    if (url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0') {
      url.hostname = 'localhost';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return RAW_BASE_URL.replace(/\/$/, '');
  }
})();

const ACTIVE_BUSINESS_COOKIE = 'pos_active_business';
const SESSION_COOKIE_PREFIX = 'pos_session_';
const SESSION_TTL_MS = 1000 * 60 * 60 * 6;
const prisma = new PrismaClient();

const viewports = [
  { width: 390, height: 844, label: 'iPhone 12/13' },
  { width: 375, height: 667, label: 'iPhone SE' },
  { width: 430, height: 932, label: 'large phone' },
];

const protectedRoutes = [
  ['/onboarding', 'onboarding'],
  ['/pos', 'POS'],
  ['/shifts', 'shifts'],
  ['/sales', 'sales'],
  ['/products', 'products'],
  ['/purchases', 'purchases'],
  ['/inventory', 'inventory'],
  ['/customers', 'customers'],
  ['/suppliers', 'suppliers'],
  ['/settings', 'settings'],
  ['/settings/online-store', 'online-store settings'],
  ['/online-orders', 'online orders'],
  ['/reports/dashboard', 'reports dashboard'],
];

function normalizeOrigin(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

async function establishSession(context) {
  const page = await context.newPage();
  const userAgent = await page.evaluate(() => navigator.userAgent);
  await page.close();

  const user = await prisma.user.findFirst({
    where: { active: true, role: { in: ['OWNER', 'MANAGER'] } },
    select: { id: true, businessId: true, role: true, email: true },
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
  });

  if (!user) {
    throw new Error('No active owner/manager user found for authenticated mobile audit.');
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      ipAddress: '127.0.0.1',
      userAgent,
      expiresAt,
    },
  });

  await context.addCookies([
    {
      name: `${SESSION_COOKIE_PREFIX}${user.businessId}`,
      value: token,
      url: normalizeOrigin(BASE_URL),
      expires: Math.floor(expiresAt.getTime() / 1000),
      sameSite: 'Lax',
    },
    {
      name: ACTIVE_BUSINESS_COOKIE,
      value: user.businessId,
      url: normalizeOrigin(BASE_URL),
      expires: Math.floor(expiresAt.getTime() / 1000),
      sameSite: 'Lax',
    },
  ]);

  return { businessId: user.businessId, token, label: `${user.role} ${user.email}` };
}

async function getStorefrontPath() {
  const business = await prisma.business.findFirst({
    where: { storefrontEnabled: true, storefrontSlug: { not: null } },
    select: { storefrontSlug: true },
    orderBy: { updatedAt: 'desc' },
  });

  return business?.storefrontSlug ? `/shop/${business.storefrontSlug}` : null;
}

async function assertNoAppError(page, label) {
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (/Application error|server-side exception|Unhandled Runtime Error|This page could not be found/i.test(bodyText)) {
    throw new Error(`${label}: app error visible on page`);
  }
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const width = window.innerWidth;
    return {
      width,
      docScroll: doc.scrollWidth,
      bodyScroll: body.scrollWidth,
      offenders: Array.from(document.body.querySelectorAll('*'))
        .map((node) => {
          const el = node;
          const rect = el.getBoundingClientRect();
          return { tag: el.tagName, className: String(el.className || ''), left: rect.left, right: rect.right, width: rect.width };
        })
        .filter((item) => item.width > 0 && (item.right > width + 2 || item.left < -2))
        .slice(0, 8),
    };
  });

  if (overflow.docScroll > overflow.width + 2 || overflow.bodyScroll > overflow.width + 2) {
    throw new Error(`${label}: horizontal overflow ${JSON.stringify(overflow)}`);
  }
}

async function assertFixedFootersVisible(page, label) {
  const clipped = await page.evaluate(() => {
    const selectors = [
      '.keyboard-safe-fixed-bottom',
      '.safe-floating-bottom',
      'nav[aria-label="Primary mobile navigation"]',
      '[data-mobile-fixed-footer]',
    ];
    return selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
        .filter((el) => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.position === 'fixed';
        })
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { selector, top: rect.top, bottom: rect.bottom, height: rect.height };
        })
        .filter((rect) => rect.bottom > window.innerHeight + 4 || rect.top < -4)
    );
  });

  if (clipped.length > 0) {
    throw new Error(`${label}: clipped fixed footer ${JSON.stringify(clipped.slice(0, 4))}`);
  }
}

async function assertTapTargets(page, label) {
  const smallTargets = await page.evaluate(() => {
    const selector = [
      'button:not([disabled])',
      'a.btn-primary',
      'a.btn-secondary',
      'a.btn-ghost',
      '[role="button"]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '.tap-target',
    ].join(',');

    return Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)) {
          return false;
        }
        if (el instanceof HTMLInputElement && el.type === 'search' && el.closest('.rounded-2xl')) {
          return false;
        }
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 60),
          className: String(el.className || '').slice(0, 120),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((item) => item.height < 40 || item.width < 32)
      .slice(0, 12);
  });

  if (smallTargets.length > 0) {
    throw new Error(`${label}: small tap targets ${JSON.stringify(smallTargets)}`);
  }
}

async function assertFocusedInputVisible(page, label) {
  const input = page.locator([
    'input:not([type])',
    'input[type="text"]',
    'input[type="search"]',
    'input[type="tel"]',
    'input[type="email"]',
    'input[type="number"]',
    'input[type="password"]',
    'textarea',
  ].map((selector) => `${selector}:not([disabled])`).join(',')).first();
  if ((await input.count()) === 0) return;

  await input.scrollIntoViewIfNeeded();
  await input.focus();
  await page.waitForTimeout(150);

  const visibility = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active || !(active instanceof HTMLElement)) return { ok: true };
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
      document.documentElement.setAttribute('data-text-entry-active', '');
    }
    active.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = active.getBoundingClientRect();
    const footer = Array.from(document.querySelectorAll('.keyboard-safe-fixed-bottom, .safe-floating-bottom, nav[aria-label="Primary mobile navigation"]'))
      .filter((el) => {
        const textEntryActive = document.documentElement.hasAttribute('data-text-entry-active');
        if (textEntryActive && el.classList.contains('hide-when-keyboard-open')) return false;
        return window.getComputedStyle(el).display !== 'none';
      })
      .map((el) => el.getBoundingClientRect())
      .find((rect) => rect.top > window.innerHeight / 2);
    const coveredBottom = footer ? Math.min(window.innerHeight, footer.top) : window.innerHeight;
    return {
      ok: rect.top >= -2 && rect.bottom <= coveredBottom - 2,
      rect: { top: rect.top, bottom: rect.bottom },
      coveredBottom,
    };
  });

  if (!visibility.ok) {
    throw new Error(`${label}: focused input is not comfortably visible ${JSON.stringify(visibility)}`);
  }
}

async function auditRoute(page, path, label) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      try {
        await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (error) {
        if (!String(error?.message ?? error).includes('ERR_ABORTED')) {
          throw error;
        }
        await page.waitForTimeout(500);
        await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await assertNoAppError(page, label);
      await assertNoHorizontalOverflow(page, label);
      await assertFixedFootersVisible(page, label);
      await assertTapTargets(page, label);
      await assertFocusedInputVisible(page, label);
      return;
    } catch (error) {
      const message = String(error?.message ?? error);
      if (attempt < 2 && /Execution context was destroyed|ERR_ABORTED/i.test(message)) {
        await page.waitForTimeout(500);
        continue;
      }
      throw error;
    }
  }
}

async function auditStorefrontCheckout(page, storefrontPath) {
  await page.goto(`${BASE_URL}${storefrontPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await assertNoAppError(page, 'storefront');
  await assertNoHorizontalOverflow(page, 'storefront');

  const addButton = page.getByRole('button', { name: /add|add to cart/i }).first();
  if ((await addButton.count()) === 0) return;

  await addButton.click();
  const cartButton = page.getByRole('button', { name: /view cart/i }).first();
  if ((await cartButton.count()) > 0) await cartButton.click();
  const checkoutButton = page.getByRole('button', { name: /checkout|proceed/i }).first();
  if ((await checkoutButton.count()) > 0) await checkoutButton.click();
  await page.waitForTimeout(250);

  await assertNoAppError(page, 'storefront checkout');
  await assertNoHorizontalOverflow(page, 'storefront checkout');
  await assertFixedFootersVisible(page, 'storefront checkout');
  await assertTapTargets(page, 'storefront checkout');
  await assertFocusedInputVisible(page, 'storefront checkout');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const storefrontPath = await getStorefrontPath();
  const failures = [];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });

      const session = await establishSession(context);
      const page = await context.newPage();
      page.setDefaultTimeout(8000);

      for (const [path, label] of protectedRoutes) {
        const fullLabel = `${viewport.label} ${label}`;
        try {
          await auditRoute(page, path, fullLabel);
          console.log(`PASS ${fullLabel}`);
        } catch (error) {
          failures.push(error);
          console.error(`FAIL ${fullLabel}: ${error.message}`);
        }
      }

      if (storefrontPath) {
        const publicContext = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 2,
        });
        const publicPage = await publicContext.newPage();
        publicPage.setDefaultTimeout(8000);
        try {
          await auditStorefrontCheckout(publicPage, storefrontPath);
          console.log(`PASS ${viewport.label} storefront checkout`);
        } catch (error) {
          failures.push(error);
          console.error(`FAIL ${viewport.label} storefront checkout: ${error.message}`);
        } finally {
          await publicContext.close();
        }
      } else {
        console.log(`SKIP ${viewport.label} storefront checkout: no enabled storefront slug found`);
      }

      await prisma.session.deleteMany({ where: { token: session.token } }).catch(() => {});
      await context.close();
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} mobile responsiveness audit failure(s).`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
