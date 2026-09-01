/**
 * Preview-only Till 3 accounting evidence helper.
 * Sign in the existing owner, read the persisted INV-000001 / T3ACC sale, and
 * assert Till 3 Shift Reconciliation. Never Production. Never writes.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { formatMoney } from '../../../lib/format';
import { getBaseUrl, isProductionPlaywrightTarget } from './env';
import { isVercelPreviewPlaywrightTarget } from './vercel-preview-bypass';
import {
  RELIABILITY_ACTION_TIMEOUT_MS,
  RELIABILITY_NAVIGATION_TIMEOUT_MS,
  requireExactlyOneVisible,
  visibleOnly,
} from './preview-qa-locators';
import {
  RELIABILITY_IDENTITY_TIMEOUT_MS,
  RELIABILITY_SNAPSHOT_TIMEOUT_MS,
  fetchPageJsonRedacted,
} from './preview-qa-redacted-fetch';
import {
  TILL3_ACCOUNTING_TILL_NAME,
  assertTill3AccountingNoWrites,
  assertTill3AccountingPersisted,
  assertReliabilityPreviewQaTenant,
  classifyPersistedTill3OpenShifts,
  formatTill3AccountingTable,
  type Till3AccountingSnapshot,
} from '../../../lib/reliability/till3-accounting-gate';

function blocked(detail: string): never {
  throw new Error(`Till 3 accounting gate blocked: ${detail}`);
}

async function visibleCount(locator: Locator) {
  return visibleOnly(locator).count();
}

export async function confirmTill3AccountingPreviewSha(page: Page) {
  if (isProductionPlaywrightTarget()) {
    blocked('reliability-till3-accounting cannot run against Production.');
  }
  const baseURL = getBaseUrl();
  if (!isVercelPreviewPlaywrightTarget(baseURL)) {
    blocked('reliability-till3-accounting requires a Vercel Preview host.');
  }
  await page.goto('/login', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  const { json: body } = await fetchPageJsonRedacted<{
    sha?: string | null;
    vercelEnv?: string | null;
  }>(page, '/api/qa/deploy-sha', RELIABILITY_IDENTITY_TIMEOUT_MS);
  if (body.vercelEnv !== 'preview') {
    blocked('deploy-sha vercelEnv is not preview.');
  }
  const expectedSha = process.env.RELIABILITY_EXPECTED_SHA?.trim() || '';
  if (!expectedSha) {
    blocked('RELIABILITY_EXPECTED_SHA is required for the evidence-only Till 3 gate.');
  }
  if (body.sha !== expectedSha) {
    blocked('Preview SHA does not match RELIABILITY_EXPECTED_SHA.');
  }
  return body;
}

export async function fetchTill3AccountingSnapshot(page: Page): Promise<{
  snapshot: Till3AccountingSnapshot;
  durationMs: number;
}> {
  const { json, durationMs } = await fetchPageJsonRedacted<Till3AccountingSnapshot>(
    page,
    '/api/qa/reliability-snapshot',
    RELIABILITY_SNAPSHOT_TIMEOUT_MS,
  );
  return { snapshot: json, durationMs };
}

/**
 * LoginForm uses unassociated <label>Email</label> plus input[name="email"].
 * Accessible submit name is exact "Sign in" (pending: "Signing in…").
 * Never follows the register link. Invalid credentials fail closed.
 */
export async function signInExistingReliabilityOwner(page: Page) {
  const email = process.env.PLAYWRIGHT_OWNER_EMAIL?.trim() ?? '';
  const password = process.env.PLAYWRIGHT_OWNER_PASSWORD?.trim() ?? '';
  if (!email || !password) {
    blocked('PLAYWRIGHT_OWNER_EMAIL and PLAYWRIGHT_OWNER_PASSWORD are required.');
  }

  await page.goto('/login', {
    waitUntil: 'domcontentloaded',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  if (/\/register(?:\/|\?|$)/.test(page.url())) {
    blocked('login redirected to /register; will not provision an owner.');
  }

  const emailInput = page.locator('input[name="email"]');
  const passwordInput = page.locator('input[name="password"]');
  await expect(emailInput).toBeVisible({ timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS });
  await emailInput.fill(email);
  await passwordInput.fill(password);

  const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
  await expect(signIn).toBeVisible({ timeout: RELIABILITY_ACTION_TIMEOUT_MS });
  await signIn.click();

  const deadline = Date.now() + RELIABILITY_NAVIGATION_TIMEOUT_MS * 3;
  while (Date.now() < deadline) {
    if (/\/register(?:\/|\?|$)/.test(page.url())) {
      blocked('existing owner sign-in reached /register; will not create a business.');
    }
    const invalid = page.getByText(/Invalid (credentials|email or password)/i);
    if ((await visibleCount(invalid)) === 1) {
      blocked('existing PLAYWRIGHT_OWNER_EMAIL authentication failed; will not register.');
    }
    const signOut = page.getByRole('button', { name: /Sign out/i });
    const main = page.locator('#main-content');
    if ((await visibleCount(signOut)) === 1 || (await visibleCount(main)) === 1) {
      return;
    }
    if (!/\/login(?:\/|\?|$)/.test(page.url()) && (await visibleCount(main)) === 0) {
      await page.locator('#main-content').waitFor({ state: 'visible', timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS }).catch(() => undefined);
      if ((await visibleCount(page.locator('#main-content'))) === 1) return;
    }
    await page.waitForTimeout(200);
  }
  blocked('existing owner session was not visible after Sign in.');
}

export async function proveTill3AccountingPersisted(page: Page) {
  const { snapshot, durationMs } = await fetchTill3AccountingSnapshot(page);
  assertReliabilityPreviewQaTenant(snapshot);
  const invoice = assertTill3AccountingPersisted(snapshot);
  const persisted = classifyPersistedTill3OpenShifts(snapshot.openShifts);
  if (persisted.state !== 'till-3-open' || persisted.shiftId !== invoice.shiftId || persisted.tillId !== invoice.tillId) {
    blocked(
      `unique OPEN Till 3 shift ${persisted.shiftId ?? '(none)'}/${persisted.tillId ?? '(none)'} !== invoice ${invoice.shiftId}/${invoice.tillId}.`,
    );
  }
  const table = `${formatTill3AccountingTable(invoice)}\nsnapshotDurationMs=${durationMs} snapshotTimeoutMs=${RELIABILITY_SNAPSHOT_TIMEOUT_MS}`;
  return { snapshot, invoice, table, durationMs };
}

export async function assertTill3ShiftSummaryUi(page: Page) {
  const { invoice } = await proveTill3AccountingPersisted(page);
  await page.goto('/shifts', {
    waitUntil: 'load',
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByRole('heading', { name: 'Shift Reconciliation', exact: true })).toBeVisible({
    timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS,
  });
  if ((await visibleCount(page.getByRole('heading', { name: 'Start New Shift', exact: true }))) === 1) {
    blocked('Till 3 shift is open in snapshot but /shifts still shows Start New Shift.');
  }
  if ((await visibleCount(page.getByRole('button', { name: 'Open Shift', exact: true }))) === 1) {
    blocked('Till 3 shift is open in snapshot but /shifts still shows the closed-form start control.');
  }

  const till3Card = page.locator('.card').filter({
    has: page.getByRole('heading', { name: TILL3_ACCOUNTING_TILL_NAME, exact: true }),
  });
  await expect(till3Card).toHaveCount(1, { timeout: RELIABILITY_NAVIGATION_TIMEOUT_MS });
  await expect(till3Card.getByText('Shift Active', { exact: true })).toBeVisible({
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  await requireExactlyOneVisible(
    till3Card.getByRole('button', { name: 'Close Shift', exact: true }),
    'Till 3 Close Shift (read-only; do not click)',
    RELIABILITY_NAVIGATION_TIMEOUT_MS,
  );

  const expectedCash = till3Card
    .locator('.rounded-xl')
    .filter({ has: page.getByText('Expected Cash', { exact: true }) })
    .locator('.text-2xl');
  await expect(expectedCash).toHaveText(formatMoney(invoice.expectedCashPence ?? 0), {
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  const cardTransfer = till3Card
    .locator('.rounded-xl')
    .filter({ has: page.getByText('Card / Transfer', { exact: true }) })
    .locator('.text-2xl');
  await expect(cardTransfer).toHaveText(
    formatMoney((invoice.cardTotalPence ?? 0) + (invoice.transferTotalPence ?? 0)),
    { timeout: RELIABILITY_ACTION_TIMEOUT_MS },
  );
  const salesTotal = till3Card
    .locator('.rounded-xl')
    .filter({ has: page.getByText('Sales Total', { exact: true }) })
    .locator('.text-2xl');
  await expect(salesTotal).toHaveText(formatMoney(invoice.totalPence ?? 0), {
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
  const salesCount = till3Card
    .locator('.rounded-xl')
    .filter({ has: page.getByText('Sales Count', { exact: true }) })
    .locator('.text-2xl');
  await expect(salesCount).toHaveText('1');
  const momo = till3Card
    .locator('.rounded-xl')
    .filter({ has: page.getByText('Mobile Money', { exact: true }) })
    .locator('.text-2xl');
  await expect(momo).toHaveText(formatMoney(invoice.momoTotalPence ?? 0), {
    timeout: RELIABILITY_ACTION_TIMEOUT_MS,
  });
}

export async function proveTill3AccountingEvidenceOnly(page: Page) {
  const before = await proveTill3AccountingPersisted(page);
  await assertTill3ShiftSummaryUi(page);
  const after = await fetchTill3AccountingSnapshot(page);
  assertReliabilityPreviewQaTenant(after.snapshot);
  assertTill3AccountingPersisted(after.snapshot);
  assertTill3AccountingNoWrites(before.snapshot, after.snapshot);
  return before;
}
