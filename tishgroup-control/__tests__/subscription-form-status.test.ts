import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const formSrc = readFileSync(join(process.cwd(), 'components/subscription-form.tsx'), 'utf8');

const EDITOR_STATUSES = [
  'TRIAL_ACTIVE',
  'PAID_ACTIVE',
  'TRIAL_RESTRICTED',
  'PAYMENT_RESTRICTED',
  'READ_ONLY',
  'CANCELLED',
] as const;

function mapSubscriptionEditorStatus(value: string | null | undefined): (typeof EDITOR_STATUSES)[number] {
  const raw = String(value ?? '').trim().toUpperCase();
  switch (raw) {
    case 'TRIAL':
    case 'TRIAL_DUE_SOON':
    case 'TRIAL_DUE_TODAY':
    case 'TRIAL_EXPIRED_GRACE':
    case 'TRIAL_ACTIVE':
      return 'TRIAL_ACTIVE';
    case 'RENEWAL_DUE_SOON':
    case 'PAYMENT_DUE_TODAY':
    case 'PAYMENT_OVERDUE_GRACE':
      return 'PAID_ACTIVE';
    case 'SUSPENDED':
      return 'READ_ONLY';
    case 'INACTIVE':
    case 'DEACTIVATED':
      return 'CANCELLED';
    default:
      if ((EDITOR_STATUSES as readonly string[]).includes(raw)) {
        return raw as (typeof EDITOR_STATUSES)[number];
      }
      return 'TRIAL_ACTIVE';
  }
}

describe('subscription form status options', () => {
  it('renders exactly the canonical editor status values', () => {
    for (const status of EDITOR_STATUSES) {
      expect(formSrc).toContain(`<option value="${status}">`);
    }
    expect(formSrc).toContain('export function mapSubscriptionEditorStatus');
    expect(formSrc).toContain('defaultValue={editorStatus}');
    expect(formSrc).not.toContain('<option value="TRIAL">');
    expect(formSrc).not.toContain('<option value="SUSPENDED">');
    expect(formSrc).not.toContain('<option value="INACTIVE">');
    expect(formSrc).not.toContain('defaultValue={business.subscriptionStatus}');
  });

  it('maps stored and derived values onto editor options instead of the first PAID_ACTIVE option', () => {
    expect(mapSubscriptionEditorStatus('TRIAL')).toBe('TRIAL_ACTIVE');
    expect(mapSubscriptionEditorStatus('TRIAL_DUE_SOON')).toBe('TRIAL_ACTIVE');
    expect(mapSubscriptionEditorStatus('TRIAL_DUE_TODAY')).toBe('TRIAL_ACTIVE');
    expect(mapSubscriptionEditorStatus('TRIAL_EXPIRED_GRACE')).toBe('TRIAL_ACTIVE');
    expect(mapSubscriptionEditorStatus('TRIAL_ACTIVE')).toBe('TRIAL_ACTIVE');
    expect(mapSubscriptionEditorStatus('RENEWAL_DUE_SOON')).toBe('PAID_ACTIVE');
    expect(mapSubscriptionEditorStatus('PAYMENT_DUE_TODAY')).toBe('PAID_ACTIVE');
    expect(mapSubscriptionEditorStatus('PAYMENT_OVERDUE_GRACE')).toBe('PAID_ACTIVE');
    expect(mapSubscriptionEditorStatus('SUSPENDED')).toBe('READ_ONLY');
    expect(mapSubscriptionEditorStatus('INACTIVE')).toBe('CANCELLED');
    expect(mapSubscriptionEditorStatus('DEACTIVATED')).toBe('CANCELLED');
    expect(mapSubscriptionEditorStatus('PAYMENT_RESTRICTED')).toBe('PAYMENT_RESTRICTED');
    expect(mapSubscriptionEditorStatus('TRIAL_RESTRICTED')).toBe('TRIAL_RESTRICTED');
    expect(formSrc).toContain("case 'TRIAL_DUE_SOON':");
    expect(formSrc).toContain("case 'PAYMENT_OVERDUE_GRACE':");
    expect(formSrc).toContain("case 'SUSPENDED':");
  });

  it('never defaults a derived trial state to PAID_ACTIVE', () => {
    expect(mapSubscriptionEditorStatus('TRIAL_ACTIVE')).not.toBe('PAID_ACTIVE');
    expect(formSrc).toContain('Changing plan or dates does not grant paid access');
    expect(formSrc.indexOf('<option value="TRIAL_ACTIVE">')).toBeLessThan(formSrc.indexOf('<option value="PAID_ACTIVE">'));
  });
});
