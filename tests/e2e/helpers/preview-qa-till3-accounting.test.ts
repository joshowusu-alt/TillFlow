import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..');

function source(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const PROHIBITED = [
  'ensurePreviewQaOwner',
  'completeOnboardingBusinessType',
  'provisionPreviewQaOwner',
  'completeTill3AccountingTenders',
  'openTill3ShiftForAccounting',
  'ensureSellableQaOnHand',
  'ensureTill3Exists',
  'gotoTill3Pos',
  'pos-complete-checkout',
  'clickUniqueVisible',
  'fillUniqueVisible',
  'selectUniqueVisible',
  "from './preview-qa-owner'",
  "from './preview-qa-product'",
  "from './login'",
  '#record-purchase-form',
  'reliabilitySalesAllowed',
  'preview-qa-catalogue',
  'preview-qa-manual-entry',
  'preview-qa-onboarding-manual',
  'preview-qa-onboarding-owner',
  'ensureQaOpeningStock',
  'enterManualImportRoute',
  'ensureSellableQaProduct',
  'runManualImportGate',
  'runManualProductEntryGate',
] as const;

describe('Till 3 accounting helper', () => {
  it('is sign-in-only evidence: no provisioning, product, stock, shift, checkout, or payment helpers', () => {
    const helper = source('tests/e2e/helpers/preview-qa-till3-accounting.ts');
    const spec = source('playwright/reliability-till3-accounting.spec.ts');
    const scanned = `${spec}\n${helper}`;
    expect(spec).toContain('signInExistingReliabilityOwner');
    expect(spec).toContain('proveTill3AccountingEvidenceOnly');
    expect(spec).toContain('PLAYWRIGHT_OWNER_EMAIL');
    expect(helper).toContain("locator('input[name=\"email\"]')");
    expect(helper).toContain("getByRole('button', { name: 'Sign in', exact: true })");
    expect(helper).toContain('assertTill3AccountingNoWrites');
    expect(helper).toContain('assertReliabilityPreviewQaTenant');
    expect(helper).toContain("goto('/shifts'");
    expect(helper).not.toContain('page.request');
    expect(helper).toContain('fetchPageJsonRedacted');
    expect(helper).not.toContain('fetchPreviewJsonRedacted');
    expect(helper).toContain('RELIABILITY_SNAPSHOT_TIMEOUT_MS');
    expect(helper).toContain('Expected Cash');
    expect(helper).toContain('Card / Transfer');
    expect(helper).toContain('Mobile Money');
    expect(source('lib/reliability/till3-accounting-gate.ts')).toContain('CARD-REL-T3ACC-1');
    expect(source('lib/reliability/till3-accounting-gate.ts')).toContain('INV-000001');
    expect(source('app/(protected)/pos/PosClient.tsx')).toContain('data-testid="pos-sale-complete"');
    for (const token of PROHIBITED) {
      expect(scanned, `evidence helper/spec must not contain ${token}`).not.toContain(token);
    }
  });
});
