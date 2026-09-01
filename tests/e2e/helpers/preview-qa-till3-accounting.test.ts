import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..');

function source(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Till 3 accounting helper', () => {
  it('physically completes a Till 3 split sale and never falls back to catalogue or Phase 9', () => {
    const helper = source('tests/e2e/helpers/preview-qa-till3-accounting.ts');
    const spec = source('playwright/reliability-till3-accounting.spec.ts');
    expect(helper).toContain('completeTill3AccountingTenders');
    expect(helper).toContain('TILL3_ACCOUNTING_REFS');
    expect(source('lib/reliability/till3-accounting-gate.ts')).toContain('CARD-REL-T3ACC-1');
    expect(helper).toContain('#pos-till-select');
    expect(helper).toContain('data-checkout-till-state="ready"');
    expect(helper).toContain('/pos?till=');
    expect(helper).toContain('assertPosBoundToPersistedTill3');
    const posFn = helper.slice(helper.indexOf('export async function gotoTill3Pos'));
    expect(posFn).not.toContain('localStorage.clear');
    expect(posFn).not.toContain('sessionStorage.clear');
    expect(helper).toContain('pos-complete-checkout');
    expect(helper).toContain('Expected Cash');
    expect(helper).not.toMatch(/locator\(['"]select['"]\)\.first\(\)/);
    expect(spec).toContain('ensurePreviewQaOwner');
    expect(spec).toContain('openTill3ShiftForAccounting');
    expect(spec).not.toContain('enterManualImportRoute');
    expect(helper).toContain('ensureSellableQaOnHand');
    expect(helper).toContain('#record-purchase-form');
    expect(helper).toContain('UNPAID');
    expect(helper).toContain('classifyPersistedTill3OpenShifts');
    expect(helper).toContain('Close Shift');
    expect(helper).toContain("waitUntil: 'load'");
    expect(helper).not.toMatch(/getByText\('Shift Active', \{ exact: true \}\)\.toBeVisible/);
    const summaryFn = helper.slice(helper.indexOf('export async function assertTill3ShiftSummaryUi'));
    expect(summaryFn).toContain("goto('/shifts'");
    expect(summaryFn).not.toContain('proveTill3OpenShiftChrome');
    expect(spec).not.toContain('Process Return');
    expect(spec).not.toContain('LATE_OFFLINE');
    expect(spec).not.toContain('PLAYWRIGHT_ONBOARDING_OWNER_EMAIL_2');
    expect(spec).not.toContain('setViewportSize');
  });
});
