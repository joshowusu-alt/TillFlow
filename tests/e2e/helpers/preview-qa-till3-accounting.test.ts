import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..');

function source(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Till 3 accounting helper', () => {
  it('is evidence-only: unique sale-complete contract, no new sale/payment/shift write', () => {
    const helper = source('tests/e2e/helpers/preview-qa-till3-accounting.ts');
    const spec = source('playwright/reliability-till3-accounting.spec.ts');
    const pos = source('app/(protected)/pos/PosClient.tsx');
    expect(spec).toContain('proveTill3AccountingPersisted');
    expect(spec).toContain('assertTill3ShiftSummaryUi');
    expect(spec).toContain('ensurePreviewQaOwner');
    expect(spec).not.toContain('completeTill3AccountingTenders');
    expect(spec).not.toContain('openTill3ShiftForAccounting');
    expect(spec).not.toContain('ensureSellableQaOnHand');
    expect(spec).not.toContain('enterManualImportRoute');
    expect(spec).not.toContain('Process Return');
    expect(spec).not.toContain('LATE_OFFLINE');
    expect(spec).not.toContain('PLAYWRIGHT_ONBOARDING_OWNER_EMAIL_2');
    expect(spec).not.toContain('setViewportSize');
    expect(helper).toContain("getByTestId('pos-sale-complete')");
    expect(helper).not.toMatch(/Sale Complete\|Ready for next customer/);
    expect(pos).toContain('data-testid="pos-sale-complete"');
    expect(pos).toContain('data-testid="pos-ready-next-customer"');
    expect(source('lib/reliability/till3-accounting-gate.ts')).toContain('CARD-REL-T3ACC-1');
    expect(helper).toContain('Expected Cash');
    const summaryFn = helper.slice(helper.indexOf('export async function assertTill3ShiftSummaryUi'));
    expect(summaryFn).toContain("goto('/shifts'");
    expect(summaryFn).not.toContain('proveTill3OpenShiftChrome');
  });
});
