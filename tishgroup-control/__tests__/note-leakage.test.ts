import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBillingHistory } from '@tillflow/lib/internal-control-billing-notes';

const root = join(process.cwd(), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('control note leakage containment', () => {
  it('does not let a Control note heading survive the merchant-visible parser', () => {
    const stored = [
      '[2026-04-01T10:00:00.000Z] Control note added',
      'Added by: Ada (ADMIN)',
      'Keep this internal',
      '',
      '[2026-04-02T10:00:00.000Z] Invoice sent',
      'Amount: GHc 199',
    ].join('\n');

    const visible = parseBillingHistory(stored);
    expect(visible.map((entry) => entry.title)).toEqual(['Invoice sent']);
    expect(visible.some((entry) => /control note added/i.test(entry.title))).toBe(false);
  });

  it('filters Control headings on the merchant billing page without deleting stored notes', () => {
    const billingPage = read('app/(protected)/settings/billing/page.tsx');
    expect(billingPage).toContain("from '@/lib/internal-control-billing-notes'");
    expect(billingPage).toContain('parseBillingHistory(billingNotes)');
    expect(billingPage).not.toMatch(/billingNotes\s*=\s*null/);
  });

  it('keeps customer-facing notes optional and labeled as merchant-visible', () => {
    const subscriptionForm = read('tishgroup-control/components/subscription-form.tsx');
    const paymentForm = read('tishgroup-control/components/payment-form.tsx');
    expect(subscriptionForm).toContain('name="customerFacingNote"');
    expect(subscriptionForm).toContain('merchants can see this');
    expect(paymentForm).toContain('name="customerFacingNote"');
    expect(paymentForm).toContain('merchants can see this');
    expect(paymentForm).toContain('name="idempotencyKey"');
    expect(paymentForm).not.toContain('leave blank to use this amount');
    expect(paymentForm).toContain('Partial payments do not automatically grant paid access');
  });

  it('keeps support ticket notes on ControlSupportIssueNote, not merchant billingNotes', () => {
    const supportAction = read('tishgroup-control/app/actions/control-support.ts');
    const supportMutations = read('tishgroup-control/lib/support-mutations.ts');
    expect(supportAction).toContain('canMutateSupport');
    expect(supportMutations).toContain('controlSupportIssueNote');
    expect(supportMutations).not.toContain('billingNotes');
    expect(supportMutations).not.toContain('controlNote');
  });

  it('removes roster quick billing setup that defaulted STARTER + PAID_ACTIVE', () => {
    const roster = read('tishgroup-control/app/businesses/page.tsx');
    expect(roster).toContain('Commercial changes must be made on the business billing page');
    expect(roster).not.toContain('updateControlSubscriptionAction');
    expect(roster).not.toContain('defaultValue="PAID_ACTIVE"');
    expect(roster).not.toContain('Quick billing setup');
  });
});
